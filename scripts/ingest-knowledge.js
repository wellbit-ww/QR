const fs = require("fs/promises");
const path = require("path");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");
const WordExtractor = require("word-extractor");
const equipmentCatalog = require("../data/equipment.json");
const { getRagConfig } = require("../src/rag/config");
const { getPool, ensureRagSchema } = require("../src/rag/pg-client");
const { splitIntoChunks } = require("../src/rag/chunking");
const { embedText, vectorToSqlLiteral } = require("../src/rag/embeddings");

const ROOT_DIR = path.join(__dirname, "..");
const KNOWLEDGE_DIR = path.join(ROOT_DIR, "data", "knowledge");

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

function buildBaseDocumentFromEquipment(equipment) {
  return [
    `${equipment.name} (${equipment.id})`,
    "",
    `Описание: ${equipment.description || ""}`,
    `Сводка: ${equipment.summary || ""}`,
    "",
    "Детали:",
    ...(equipment.details || []).map((item) => `- ${item}`),
    "",
    "Технические сведения:",
    ...(equipment.specs || []).map((item) => `- ${item}`),
  ].join("\n");
}

async function loadEquipmentDocuments(equipment) {
  const docs = [
    {
      sourceDoc: "equipment-catalog",
      section: "catalog-summary",
      page: null,
      content: buildBaseDocumentFromEquipment(equipment),
      metadata: { sourceType: "catalog-json" },
    },
  ];

  const equipmentDir = path.join(KNOWLEDGE_DIR, equipment.id);
  const entries = await readOptionalDirectory(equipmentDir);

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!SUPPORTED_FILE_EXT.has(ext)) {
      continue;
    }

    const absolutePath = path.join(equipmentDir, entry.name);
    let content = "";

    try {
      content = await loadFileContent(absolutePath, ext);
    } catch (error) {
      console.error(
        `[INGEST] Skipped ${equipment.id}/${entry.name}:`,
        error instanceof Error ? error.message : error
      );
      continue;
    }

    const doc = {
      sourceDoc: entry.name,
      section: path.basename(entry.name, ext),
      page: null,
      content,
      metadata: { sourceType: ext.slice(1), path: absolutePath },
    };
    docs.push(doc);

    console.log(
      `[INGEST] Loaded ${equipment.id}/${entry.name}: ${doc.content.trim().length} chars`
    );
  }

  return docs;
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

  await ensureRagSchema(pool);

  let totalChunks = 0;
  for (const equipment of Object.values(equipmentCatalog)) {
    const docs = await loadEquipmentDocuments(equipment);
    console.log(`[INGEST] Equipment ${equipment.id}: docs=${docs.length}`);

    for (const doc of docs) {
      const chunks = splitIntoChunks(doc.content, config.chunkSize, config.chunkOverlap);
      console.log(
        `[INGEST] ${equipment.id}/${doc.sourceDoc}: chunks=${chunks.length}, chunkSize=${config.chunkSize}, overlap=${config.chunkOverlap}`
      );

      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
        const chunkContent = chunks[chunkIndex];
        const vector = await embedText({
          embeddingUrl: config.embeddingUrl,
          embeddingModel: config.embeddingModel,
          text: chunkContent,
        });

        await upsertChunk(pool, {
          equipmentId: equipment.id,
          sourceDoc: doc.sourceDoc,
          section: doc.section,
          page: doc.page,
          chunkIndex,
          content: chunkContent,
          metadata: {
            ...doc.metadata,
            equipmentName: equipment.name,
          },
          embedding: vectorToSqlLiteral(vector),
        });

        totalChunks += 1;
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
