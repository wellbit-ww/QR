const { getRagConfig } = require("./config");
const { getPool } = require("./pg-client");
const { embedText, vectorToSqlLiteral } = require("./embeddings");

async function retrieveEquipmentContext({ equipmentId, query, topK }) {
  const config = getRagConfig();
  const pool = getPool(config.postgresUrl);

  if (!pool) {
    return {
      chunks: [],
      topScore: 0,
      retrievalLatencyMs: 0,
      reason: "RAG disabled: POSTGRES_URL is not set.",
    };
  }

  const startedAt = Date.now();
  const queryEmbedding = await embedText({
    embeddingUrl: config.embeddingUrl,
    embeddingModel: config.embeddingModel,
    text: query,
  });

  const limit = Number.isFinite(topK) && topK > 0 ? Math.floor(topK) : config.retrievalTopK;
  const vectorLiteral = vectorToSqlLiteral(queryEmbedding);

  const result = await pool.query(
    `
      SELECT
        source_doc,
        section,
        page,
        chunk_index,
        content,
        metadata,
        1 - (embedding <=> $1::vector) AS score
      FROM knowledge_chunks
      WHERE equipment_id = $2
      ORDER BY embedding <=> $1::vector
      LIMIT $3
    `,
    [vectorLiteral, equipmentId, limit]
  );

  const chunks = result.rows.map((row) => ({
    sourceDoc: row.source_doc,
    section: row.section || null,
    page: row.page || null,
    chunkIndex: row.chunk_index,
    content: row.content,
    metadata: row.metadata || {},
    score: Number(row.score) || 0,
  }));

  const topScore = chunks.length > 0 ? chunks[0].score : 0;

  return {
    chunks,
    topScore,
    retrievalLatencyMs: Date.now() - startedAt,
    selectedTopK: limit,
    reason: "",
  };
}

function formatContextForPrompt(chunks) {
  if (!chunks.length) {
    return "Релевантный контекст не найден.";
  }

  return chunks
    .map((chunk, index) => {
      const sourceParts = [chunk.sourceDoc];
      if (chunk.section) {
        sourceParts.push(`раздел: ${chunk.section}`);
      }
      if (Number.isInteger(chunk.page)) {
        sourceParts.push(`стр: ${chunk.page}`);
      }

      return [
        `[Фрагмент ${index + 1}]`,
        `Источник: ${sourceParts.join(", ")}`,
        chunk.content,
      ].join("\n");
    })
    .join("\n\n");
}

function extractSources(chunks) {
  const seen = new Set();
  const sources = [];

  for (const chunk of chunks) {
    const key = `${chunk.sourceDoc}|${chunk.page || ""}|${chunk.section || ""}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    sources.push({
      sourceDoc: chunk.sourceDoc,
      page: chunk.page,
      section: chunk.section,
      score: chunk.score,
    });
  }

  return sources;
}

module.exports = {
  retrieveEquipmentContext,
  formatContextForPrompt,
  extractSources,
};
