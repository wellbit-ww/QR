const fs = require("fs/promises");
const path = require("path");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");
const WordExtractor = require("word-extractor");
const equipmentCatalog = require("../data/equipment.json");
const { getRagConfig } = require("../src/rag/config");
const { getPool, ensureRagSchema } = require("../src/rag/pg-client");
const { splitDocumentIntoChunks } = require("../src/rag/chunking");
const { embedText, embedTextsBatch, vectorToSqlLiteral } = require("../src/rag/embeddings");

const ROOT_DIR = path.join(__dirname, "..");
const KNOWLEDGE_DIR = path.join(ROOT_DIR, "knowledge");

const WORD_DOC_EXTRACTOR = new WordExtractor();
const SUPPORTED_FILE_EXT = new Set([".md", ".txt", ".pdf", ".doc", ".docx"]);

async function loadFileContent(absolutePath, ext) {
  if (ext === ".pdf") {
    const raw = await fs.readFile(absolutePath);
    const pdf = await pdfParse(raw);
    return pdf.text || "";
  }

  if (ext === ".docx") {
    const result = await mammoth.extractRawText({ path: absolutePath });
    return result.value || "";
  }

  if (ext === ".doc") {
    const extracted = await WORD_DOC_EXTRACTOR.extract(absolutePath);
    return extracted.getBody() || "";
  }

  return fs.readFile(absolutePath, "utf8");
}

async function readOptionalDirectory(directoryPath) {
  try {
    return await fs.readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

/**
 * Collect supported files under equipmentDir recursively.
 * relativePath uses forward slashes and is stored as source_doc (unique per file).
 */
async function collectKnowledgeFiles(equipmentDir, baseDir = equipmentDir) {
  const out = [];
  const entries = await readOptionalDirectory(equipmentDir);

  for (const entry of entries) {
    const absolutePath = path.join(equipmentDir, entry.name);

    if (entry.isDirectory()) {
      const nested = await collectKnowledgeFiles(absolutePath, baseDir);
      out.push(...nested);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!SUPPORTED_FILE_EXT.has(ext)) {
      continue;
    }

    const relativePath = path.relative(baseDir, absolutePath).split(path.sep).join("/");

    out.push({ absolutePath, relativePath, ext });
  }

  return out;
}

async function warnLooseKnowledgeRootFiles() {
  const entries = await readOptionalDirectory(KNOWLEDGE_DIR);
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!SUPPORTED_FILE_EXT.has(ext)) {
      continue;
    }
    if (entry.name.toLowerCase() === "readme.md") {
      continue;
    }
    console.warn(
      `[INGEST] Пропуск файла в корне knowledge/: "${entry.name}". Переместите в knowledge/<id-оборудования>/`
    );
  }
}

async function loadEquipmentDocuments(equipment) {
  const docs = [];

  const equipmentDir = path.join(KNOWLEDGE_DIR, equipment.id);
  const fileRefs = await collectKnowledgeFiles(equipmentDir);

  for (const { absolutePath, relativePath, ext } of fileRefs) {
    let content = "";

    try {
      content = await loadFileContent(absolutePath, ext);
    } catch (error) {
      console.error(
        `[INGEST] Skipped ${equipment.id}/${relativePath}:`,
        error instanceof Error ? error.message : error
      );
      continue;
    }

    const doc = {
      sourceDoc: relativePath,
      section: path.basename(relativePath, ext),
      page: null,
      content,
      metadata: {
        sourceType: ext.slice(1),
        path: absolutePath.replace(/\\/g, "/"),
      },
    };
    docs.push(doc);

    console.log(
      `[INGEST] Loaded ${equipment.id}/${relativePath}: ${doc.content.trim().length} chars`
    );
  }

  return docs;
}

async function embedTextsWithFallback(config, texts) {
  try {
    return await embedTextsBatch({
      embeddingUrl: config.embeddingUrl,
      embeddingModel: config.embeddingModel,
      texts,
      maxInputChars: config.embedMaxChars,
    });
  } catch (error) {
    console.warn(
      "[INGEST] Batch embed failed; falling back to sequential:",
      error instanceof Error ? error.message : error
    );
    const vectors = [];
    for (const text of texts) {
      vectors.push(
        await embedText({
          embeddingUrl: config.embeddingUrl,
          embeddingModel: config.embeddingModel,
          text,
          maxInputChars: config.embedMaxChars,
        })
      );
    }
    return vectors;
  }
}

function enrichChunkRowMetadata(content, baseMeta, sourceDoc, chunkIndex) {
  const meta = { ...baseMeta };
  if (Array.isArray(meta.structuredParameters) && meta.structuredParameters.length > 0) {
    meta.structuredParameters = meta.structuredParameters.map((entry) => ({
      parameterKey: entry.parameterKey || null,
      value: entry.value || null,
      unit: entry.unit || null,
      aliases: Array.isArray(entry.aliases) ? entry.aliases : [],
      confidence: typeof entry.confidence === "number" ? entry.confidence : 0.7,
      sourceDoc,
      chunkIndex,
    }));
  }
  if (meta.chunkKind === "procedure") {
    const steps = [];
    for (const line of String(content || "").split("\n")) {
      const m = line.match(/^\s*(?:\d+\.|[-*+])\s+(.+)/);
      if (m) {
        steps.push(m[1].trim());
      }
    }
    if (steps.length) {
      meta.procedureStepCount = steps.length;
      meta.procedureOutline = steps.slice(0, 40);
    }
  }
  return meta;
}

async function upsertChunk(pool, chunkRow) {
  await pool.query(
    `
      INSERT INTO knowledge_chunks (
        equipment_id,
        source_doc,
        section,
        page,
        chunk_index,
        content,
        metadata,
        embedding
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::vector)
      ON CONFLICT (equipment_id, source_doc, chunk_index)
      DO UPDATE SET
        section = EXCLUDED.section,
        page = EXCLUDED.page,
        content = EXCLUDED.content,
        metadata = EXCLUDED.metadata,
        embedding = EXCLUDED.embedding,
        updated_at = NOW()
    `,
    [
      chunkRow.equipmentId,
      chunkRow.sourceDoc,
      chunkRow.section,
      chunkRow.page,
      chunkRow.chunkIndex,
      chunkRow.content,
      JSON.stringify(chunkRow.metadata || {}),
      chunkRow.embedding,
    ]
  );
}

async function main() {
  const config = getRagConfig();
  const pool = getPool(config.postgresUrl);

  if (!pool) {
    throw new Error("POSTGRES_URL is required for ingestion.");
  }

  await fs.mkdir(KNOWLEDGE_DIR, { recursive: true });
  await warnLooseKnowledgeRootFiles();

  await ensureRagSchema(pool);

  let totalChunks = 0;
  for (const equipment of Object.values(equipmentCatalog)) {
    const docs = await loadEquipmentDocuments(equipment);
    console.log(`[INGEST] Equipment ${equipment.id}: docs=${docs.length}`);

    for (const doc of docs) {
      const chunkObjs = splitDocumentIntoChunks(
        doc.content,
        config.chunkSize,
        config.chunkOverlap
      );
      console.log(
        `[INGEST] ${equipment.id}/${doc.sourceDoc}: chunks=${chunkObjs.length}, chunkSize=${config.chunkSize}, overlap=${config.chunkOverlap}`
      );

      const batchSize = Math.max(1, Math.floor(config.ingestEmbedBatchSize) || 16);

      for (let start = 0; start < chunkObjs.length; start += batchSize) {
        const end = Math.min(start + batchSize, chunkObjs.length);
        const sliceObjs = chunkObjs.slice(start, end);
        const sliceTexts = sliceObjs.map((c) => c.content);
        const vectors = await embedTextsWithFallback(config, sliceTexts);

        for (let i = 0; i < sliceObjs.length; i += 1) {
          const chunkIndex = start + i;
          const { content: chunkContent, metadata: splitMeta } = sliceObjs[i];

          const metadata = enrichChunkRowMetadata(
            chunkContent,
            {
            ...doc.metadata,
            ...splitMeta,
            equipmentName: equipment.name,
            },
            doc.sourceDoc,
            chunkIndex
          );

          await upsertChunk(pool, {
            equipmentId: equipment.id,
            sourceDoc: doc.sourceDoc,
            section: doc.section,
            page: doc.page,
            chunkIndex,
            content: chunkContent,
            metadata,
            embedding: vectorToSqlLiteral(vectors[i]),
          });

          totalChunks += 1;
        }
      }
    }
  }

  console.log(`Ingestion completed. Upserted chunks: ${totalChunks}`);
  await pool.end();
}

main().catch((error) => {
  console.error("Ingestion failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
