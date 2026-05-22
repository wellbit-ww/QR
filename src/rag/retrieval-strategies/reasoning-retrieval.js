const { getRagConfig } = require("../config");
const { getPool } = require("../pg-client");
const { QUERY_TYPES } = require("../query-analysis");

const CAUSAL_SIGNAL_RE =
  /(?:если|при|после|во\s+время|вследствие|поэтому|приводит|вызывает|из-за|при\s+открыт|сигнализац|блокиров|отключ|прекращ|наруш|поддержан)/iu;

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenOverlap(query, chunk) {
  const tokens = normalizeText(query)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 4);
  if (!tokens.length) {
    return 0;
  }
  const uniq = [...new Set(tokens)];
  const hay = normalizeText(`${chunk?.section || ""} ${chunk?.content || ""}`);
  const hits = uniq.filter((t) => hay.includes(t)).length;
  return hits / uniq.length;
}

function reasoningSignalScore(query, chunk) {
  const text = `${chunk?.section || ""}\n${chunk?.content || ""}`;
  let score = 0;
  if (CAUSAL_SIGNAL_RE.test(text)) {
    score += 0.18;
  }
  score += tokenOverlap(query, chunk) * 0.24;
  if (chunk?.metadata?.chunkKind === "general" || chunk?.metadata?.chunkKind === "procedure") {
    score += 0.06;
  }
  if (/титул|общие\s+указания|комплект\s+поставк|драгоценных\s+материалов|гарантийный\s+срок/iu.test(text)) {
    score -= 0.16;
  }
  return score;
}

function mergeChunks(primary, neighbors) {
  const byKey = new Map();
  for (const chunk of [...(primary || []), ...(neighbors || [])]) {
    const key = `${chunk.sourceDoc}|${chunk.chunkIndex}`;
    if (!byKey.has(key)) {
      byKey.set(key, chunk);
      continue;
    }
    const current = byKey.get(key);
    const currentScore = current.routedScore ?? current.rerankScore ?? current.score ?? 0;
    const nextScore = chunk.routedScore ?? chunk.rerankScore ?? chunk.score ?? 0;
    if (nextScore > currentScore) {
      byKey.set(key, { ...current, ...chunk });
    }
  }
  return [...byKey.values()];
}

async function expandNeighborChunks({ equipmentId, chunks, radius = 1 }) {
  const config = getRagConfig();
  const pool = getPool(config.postgresUrl);
  if (!pool || !Array.isArray(chunks) || chunks.length === 0) {
    return [];
  }

  const conditions = [];
  const values = [equipmentId];
  let idx = 2;
  for (const chunk of chunks.slice(0, 8)) {
    if (!chunk?.sourceDoc || !Number.isInteger(chunk.chunkIndex)) {
      continue;
    }
    values.push(chunk.sourceDoc, chunk.chunkIndex - radius, chunk.chunkIndex + radius);
    conditions.push(`(source_doc = $${idx++} AND chunk_index BETWEEN $${idx++} AND $${idx++})`);
  }
  if (!conditions.length) {
    return [];
  }

  const result = await pool.query(
    `
      SELECT
        source_doc,
        section,
        page,
        chunk_index,
        content,
        metadata,
        0::float AS score
      FROM knowledge_chunks
      WHERE equipment_id = $1
        AND (${conditions.join(" OR ")})
      ORDER BY source_doc, chunk_index
      LIMIT 60
    `,
    values
  );

  return result.rows.map((row) => ({
    sourceDoc: row.source_doc,
    section: row.section || null,
    page: row.page || null,
    chunkIndex: row.chunk_index,
    content: row.content,
    metadata: row.metadata || {},
    score: Number(row.score) || 0,
    neighborExpanded: true,
  }));
}

function buildCausalChain(query, chunks) {
  const scored = [...(chunks || [])]
    .map((chunk) => {
      const boost = reasoningSignalScore(query, chunk);
      const base = Number(chunk.rerankScore ?? chunk.score ?? 0);
      return {
        ...chunk,
        routedScore: base + boost + (chunk.neighborExpanded ? 0.04 : 0),
        retrievalStrategyBoost: Number((boost + (chunk.neighborExpanded ? 0.04 : 0)).toFixed(4)),
      };
    })
    .sort((a, b) => (b.routedScore ?? 0) - (a.routedScore ?? 0));

  const chain = scored
    .filter((chunk) => CAUSAL_SIGNAL_RE.test(`${chunk.section || ""}\n${chunk.content || ""}`) || tokenOverlap(query, chunk) >= 0.25)
    .slice(0, 6);

  return {
    chunks: scored,
    chain,
    causalChainUsed: chain.length >= 2,
  };
}

async function applyReasoningRetrieval({ equipmentId, query, chunks }) {
  const initial = [...(chunks || [])]
    .map((chunk) => {
      const boost = reasoningSignalScore(query, chunk);
      const base = Number(chunk.rerankScore ?? chunk.score ?? 0);
      return {
        ...chunk,
        routedScore: base + boost,
        retrievalStrategyBoost: Number(boost.toFixed(4)),
      };
    })
    .sort((a, b) => (b.routedScore ?? 0) - (a.routedScore ?? 0));

  const neighbors = await expandNeighborChunks({ equipmentId, chunks: initial.slice(0, 6), radius: 1 });
  const merged = mergeChunks(initial, neighbors);
  return buildCausalChain(query, merged);
}

function describeReasoningRetrieval() {
  return {
    route: QUERY_TYPES.REASONING_QA,
    retrievalStrategy: "reasoning_causal_multihop",
    answerStrategy: "grounded_reasoning_synthesis",
    llmAllowed: true,
    deterministicUsed: false,
  };
}

module.exports = {
  applyReasoningRetrieval,
  expandNeighborChunks,
  buildCausalChain,
  describeReasoningRetrieval,
};
