const { getRagConfig } = require("./config");
const { getPool } = require("./pg-client");
const { embedText, vectorToSqlLiteral } = require("./embeddings");
const { rerankChunks } = require("./rerank");

function chunkMatchesSectionHints(chunk, hints) {
  if (!hints || hints.length === 0) {
    return true;
  }

  const haystack = `${chunk.section || ""}\n${chunk.content || ""}`;
  return hints.some((hint) => {
    const h = String(hint).trim();
    if (!h) {
      return false;
    }

    const escaped = h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
      `(?:^|[\\s\\u00A0>–—(\\[])${escaped}(?:\\.|\\)|\\s|$|[\\u00A0–—])`,
      "imu"
    ).test(haystack);
  });
}

function mergeEmbeddingQuery(originalQuery, intent, config) {
  const base = String(originalQuery || "").trim();
  if (!config?.ragEmbedAugmentation || !intent?.embeddingAugmentation) {
    return base;
  }
  return `${intent.embeddingAugmentation}\n${base}`;
}

function sanitizeChunk(row) {
  return {
    sourceDoc: row.source_doc,
    section: row.section || null,
    page: row.page || null,
    chunkIndex: row.chunk_index,
    content: row.content,
    metadata: row.metadata || {},
    score: Number(row.score) || 0,
  };
}

/**
 * @param {object} params
 * @param {string} params.equipmentId
 * @param {string} params.query
 * @param {number} [params.topK]
 * @param {string[]} [params.sectionHints]
 * @param {object|null} [params.intent] — classifyQueryIntent(...)
 * @param {object|null} [params.retrievalOverrides] — переопределения конфигурации для отладки
 */
async function retrieveEquipmentContext({
  equipmentId,
  query,
  topK,
  sectionHints,
  intent,
  retrievalOverrides,
}) {
  const baseConfig = getRagConfig();
  const config =
    retrievalOverrides && typeof retrievalOverrides === "object"
      ? { ...baseConfig, ...retrievalOverrides }
      : baseConfig;
  const limit = Number.isFinite(topK) && topK > 0 ? Math.floor(topK) : config.retrievalTopK;
  const pool = getPool(config.postgresUrl);

  if (!pool) {
    return {
      chunks: [],
      topScore: 0,
      retrievalLatencyMs: 0,
      selectedTopK: limit,
      sectionHints: [],
      sectionHintFiltered: false,
      rerankApplied: false,
      fetchLimit: 0,
      reason: "RAG disabled: POSTGRES_URL is not set.",
    };
  }

  const startedAt = Date.now();
  const originalQuery = String(query || "").trim();
  const embedQuery = mergeEmbeddingQuery(originalQuery, intent, config);

  const queryEmbedding = await embedText({
    embeddingUrl: config.embeddingUrl,
    embeddingModel: config.embeddingModel,
    text: embedQuery,
    maxInputChars: config.embedMaxChars,
  });

  const hints =
    Array.isArray(sectionHints) && sectionHints.length > 0
      ? sectionHints.map((h) => String(h).trim()).filter(Boolean)
      : [];

  const mult = Math.max(1, Math.min(12, config.retrievalCandidateMultiplier || 4));
  let fetchLimit = Math.min(limit * mult, 200);
  if (hints.length > 0) {
    fetchLimit = Math.min(Math.max(fetchLimit, limit * 5), 200);
  }

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
    [vectorLiteral, equipmentId, fetchLimit]
  );

  let chunks = result.rows.map(sanitizeChunk);

  let sectionHintFiltered = false;
  if (hints.length > 0) {
    const filtered = chunks.filter((chunk) => chunkMatchesSectionHints(chunk, hints));
    sectionHintFiltered = filtered.length > 0;
    chunks = sectionHintFiltered ? filtered : chunks;
  }

  const rerankApplied =
    Boolean(config.ragRerankEnabled) && Boolean(intent && intent.intentType);
  let ranked = rerankApplied ? rerankChunks(chunks, intent) : chunks;

  ranked = ranked.slice(0, limit);

  const topScore = ranked.length > 0 ? ranked[0].rerankScore ?? ranked[0].score : 0;

  return {
    chunks: ranked,
    topScore,
    retrievalLatencyMs: Date.now() - startedAt,
    selectedTopK: limit,
    sectionHints: hints,
    sectionHintFiltered,
    rerankApplied,
    fetchLimit,
    embeddingAugmented: embedQuery !== originalQuery,
    originalQuery,
    embedQuery,
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

      const meta = chunk.metadata || {};
      const modes = Array.isArray(meta.operatingModes) ? meta.operatingModes.join(", ") : "";
      const kind = meta.chunkKind ? String(meta.chunkKind) : "";
      const metaLine =
        modes || kind
          ? [`Метаданные фрагмента:`, kind && `тип: ${kind}`, modes && `режимы (индекс): ${modes}`]
              .filter(Boolean)
              .join(" ")
          : "";

      const lines = [
        `[Фрагмент ${index + 1}]`,
        `Источник: ${sourceParts.join(", ")}`,
      ];
      if (metaLine) {
        lines.push(metaLine);
      }
      lines.push(chunk.content);
      return lines.join("\n");
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
      score: chunk.rerankScore ?? chunk.score,
    });
  }

  return sources;
}

module.exports = {
  retrieveEquipmentContext,
  formatContextForPrompt,
  extractSources,
};
