require("./load-env-file").loadEnvFile();

const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");
const WordExtractor = require("word-extractor");
const equipmentCatalog = require("../data/equipment.json");
const { getRagConfig } = require("../src/rag/config");
const { getPool, ensureRagSchema } = require("../src/rag/pg-client");
const {
  splitDocumentIntoChunks,
  splitDocumentIntoParentChildChunkRecords,
  applySdb1106nmModelPrefixToChunk,
  extractAtomicForbiddenChunks,
  extractFaultTableTextChunks,
  extractPossibleFaultsListChunks,
  extractSpecTableFlattenedChunks,
  extractEquipmentModelIdentifiers,
} = require("../src/rag/chunking");
const { embedText, embedTextsBatch, vectorToSqlLiteral } = require("../src/rag/embeddings");
const { shouldSkipSdb151FamilyBinary } = require("./knowledge-content-loader");

const ROOT_DIR = path.join(__dirname, "..");
const KNOWLEDGE_DIR = path.join(ROOT_DIR, "knowledge");

const WORD_DOC_EXTRACTOR = new WordExtractor();
const SUPPORTED_FILE_EXT = new Set([".md", ".txt", ".pdf", ".doc", ".docx"]);

function tryConvertPdfToMarkdownViaPython(pdfPath) {
  const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
  const scriptPath = path.join(ROOT_DIR, "scripts", "pdf_to_markdown.py");
  if (!fsSync.existsSync(scriptPath)) {
    return null;
  }
  const outPath = path.join(os.tmpdir(), `rag-pdf-md-${Date.now()}-${Math.random().toString(36).slice(2)}.md`);
  const res = spawnSync(python, [scriptPath, pdfPath, outPath], {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    timeout: 900_000,
  });
  if (res.status !== 0 || res.error) {
    try {
      fsSync.unlinkSync(outPath);
    } catch (_e) {
      /* ignore */
    }
    return null;
  }
  try {
    const md = fsSync.readFileSync(outPath, "utf8");
    return md && md.trim().length > 40 ? md : null;
  } finally {
    try {
      fsSync.unlinkSync(outPath);
    } catch (_e) {
      /* ignore */
    }
  }
}

async function loadFileContent(absolutePath, ext) {
  if (ext === ".pdf") {
    const md = tryConvertPdfToMarkdownViaPython(absolutePath);
    if (md) {
      return md;
    }
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
    if (shouldSkipSdb151FamilyBinary(equipment.id, relativePath, fileRefs)) {
      console.log(`[INGEST] ${equipment.id}: skip family ${relativePath} (scoped SDB151NM.md present)`);
      continue;
    }
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

    if (!String(content || "").trim()) {
      console.warn(`[INGEST] Skipped ${equipment.id}/${relativePath}: no extractable text`);
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
        equipmentModels: extractEquipmentModelIdentifiers(content, equipment),
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

function isRetrievalCardSource(sourceDoc) {
  return /(?:^|\/)retrieval-cards\//i.test(String(sourceDoc || "").replace(/\\/g, "/"));
}

function enrichChunkRowMetadata(content, baseMeta, sourceDoc, chunkIndex) {
  const meta = { ...baseMeta };
  if (isRetrievalCardSource(sourceDoc)) {
    meta.retrievalCard = true;
  }
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
        embedding,
        content_tsv
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::vector, to_tsvector('simple', COALESCE($6::text, '')))
      ON CONFLICT (equipment_id, source_doc, chunk_index)
      DO UPDATE SET
        section = EXCLUDED.section,
        page = EXCLUDED.page,
        content = EXCLUDED.content,
        metadata = EXCLUDED.metadata,
        embedding = EXCLUDED.embedding,
        content_tsv = to_tsvector('simple', COALESCE(EXCLUDED.content, '')),
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

async function deleteEquipmentChunks(pool, equipmentId) {
  const r = await pool.query(`DELETE FROM knowledge_chunks WHERE equipment_id = $1`, [equipmentId]);
  return r.rowCount || 0;
}

async function main() {
  const forceReindex = process.argv.includes("--force");
  const onlyArg = process.argv.find((a) => String(a).startsWith("--only="));
  const onlyId = onlyArg ? String(onlyArg).slice("--only=".length).trim() : "";
  void forceReindex;
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
    if (onlyId && equipment.id !== onlyId) {
      continue;
    }
    const docs = await loadEquipmentDocuments(equipment);
    console.log(`[INGEST] Equipment ${equipment.id}: docs=${docs.length}`);

    for (const doc of docs) {
      const retrievalCard = isRetrievalCardSource(doc.sourceDoc);
      const usePc = Boolean(config.useParentChildChunking);
      let chunkObjs = usePc
        ? splitDocumentIntoParentChildChunkRecords(doc.content, equipment, {
            parentChunkChars: config.parentChunkChars,
            childChunkChars: config.childChunkChars,
            childOverlapChars: config.childOverlapChars,
            parentOverlapChars: config.parentOverlapChars || config.chunkOverlap,
          })
        : splitDocumentIntoChunks(doc.content, config.chunkSize, config.chunkOverlap);
      const atomicSafety = extractAtomicForbiddenChunks(doc.content, {
        equipmentName: equipment.name,
      });
      if (atomicSafety.length) {
        chunkObjs = [...chunkObjs, ...atomicSafety];
        console.log(
          `[INGEST] ${equipment.id}/${doc.sourceDoc}: +${atomicSafety.length} atomic safety (ЗАПРЕЩАЕТСЯ) chunks`
        );
      }
      const faultTableChunks = retrievalCard
        ? []
        : extractFaultTableTextChunks(doc.content, {
            equipmentName: equipment.name,
          });
      if (faultTableChunks.length) {
        chunkObjs = [...chunkObjs, ...faultTableChunks];
        console.log(
          `[INGEST] ${equipment.id}/${doc.sourceDoc}: +${faultTableChunks.length} fault table (3.1.4 / табл. 3.2) chunks`
        );
      }
      const possibleFaultsChunks =
        equipment.id === "sdb151-nm" || retrievalCard
          ? []
          : extractPossibleFaultsListChunks(doc.content, {
              equipmentName: equipment.name,
            });
      if (possibleFaultsChunks.length) {
        chunkObjs = [...chunkObjs, ...possibleFaultsChunks];
        console.log(
          `[INGEST] ${equipment.id}/${doc.sourceDoc}: +${possibleFaultsChunks.length} possible-faults list (2.2.2 / humidity checks) chunks`
        );
      }
      const specFlatChunks =
        equipment.id === "sdb151-nm" || retrievalCard
          ? []
          : extractSpecTableFlattenedChunks(doc.content, {
              equipmentName: equipment.name,
            });
      if (specFlatChunks.length) {
        chunkObjs = [...chunkObjs, ...specFlatChunks];
        console.log(
          `[INGEST] ${equipment.id}/${doc.sourceDoc}: +${specFlatChunks.length} table-1.1 flattened (model/param/value) chunks`
        );
      }
      console.log(
        `[INGEST] ${equipment.id}/${doc.sourceDoc}: chunks=${chunkObjs.length}, mode=${usePc ? "parent_child" : "legacy"}, ` +
          (usePc
            ? `parent≈${config.parentChunkChars} child≈${config.childChunkChars}`
            : `chunkSize=${config.chunkSize}, overlap=${config.chunkOverlap}`)
      );

      const batchSize = Math.max(1, Math.floor(config.ingestEmbedBatchSize) || 16);

      for (let start = 0; start < chunkObjs.length; start += batchSize) {
        const end = Math.min(start + batchSize, chunkObjs.length);
        const sliceObjs = chunkObjs.slice(start, end);
        const prepared = sliceObjs.map((obj, i) => {
          const chunkIndex = start + i;
          const { content: chunkContent, metadata: splitMeta } = obj;
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
          let contentForStore = applySdb1106nmModelPrefixToChunk(chunkContent, metadata);
          if (metadata.parentLlmContext) {
            metadata.parentLlmContext = applySdb1106nmModelPrefixToChunk(
              metadata.parentLlmContext,
              metadata
            );
          }
          return { chunkIndex, contentForStore, metadata };
        });
        const vectors = await embedTextsWithFallback(
          config,
          prepared.map((p) => p.contentForStore)
        );

        for (let i = 0; i < prepared.length; i += 1) {
          const { chunkIndex, contentForStore, metadata } = prepared[i];

          await upsertChunk(pool, {
            equipmentId: equipment.id,
            sourceDoc: doc.sourceDoc,
            section: doc.section,
            page: doc.page,
            chunkIndex,
            content: contentForStore,
            metadata,
            embedding: vectorToSqlLiteral(vectors[i]),
          });

          totalChunks += 1;
        }
      }

      if (equipment.id === "w-700") {
        const staleIdx = await pool.query(
          `DELETE FROM knowledge_chunks
           WHERE equipment_id = $1
             AND source_doc = $2
             AND chunk_index >= $3`,
          [equipment.id, doc.sourceDoc, chunkObjs.length]
        );
        if (staleIdx.rowCount) {
          console.log(
            `[INGEST] ${equipment.id}/${doc.sourceDoc}: removed ${staleIdx.rowCount} leftover chunk indices`
          );
        }
      }
    }

    if (equipment.id === "sdb151-nm" && docs.length) {
      const keep = docs.map((d) => d.sourceDoc);
      const stale = await pool.query(
        `DELETE FROM knowledge_chunks
         WHERE equipment_id = $1
           AND NOT (source_doc = ANY($2::text[]))`,
        [equipment.id, keep]
      );
      if (stale.rowCount) {
        console.log(
          `[INGEST] sdb151-nm: removed ${stale.rowCount} leftover chunks not in current sources`
        );
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
