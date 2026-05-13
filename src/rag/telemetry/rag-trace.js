/**
 * Observability: один объект трассировки на запрос RAG (debug / аудит).
 */

function createRagTrace(seed = {}) {
  return {
    intent: null,
    focusParameter: null,
    queryScope: null,
    queryRisk: null,
    retrievedChunks: [],
    rerankTop: [],
    finalChunksUsed: [],
    validationFlags: [],
    retrievalFilterReason: "none",
    rejectedByParameterMismatch: 0,
    rejectedByBlockType: 0,
    validationFailures: [],
    finalGenerationMode: null,
    parameterResolved: false,
    parameterKey: null,
    parameterSource: null,
    parameterConfidence: 0,
    lexicalScore: 0,
    fusionScore: 0,
    embeddingAugmented: false,
    rerankApplied: false,
    ...seed,
    startedAt: Date.now(),
  };
}

function summarizeChunkForTrace(chunk, index) {
  const meta = chunk?.metadata || {};
  return {
    rank: index + 1,
    sourceDoc: chunk?.sourceDoc ?? null,
    section: chunk?.section ?? null,
    page: chunk?.page ?? null,
    chunkIndex: chunk?.chunkIndex ?? null,
    chunkKind: meta.chunkKind ?? null,
    blockType: meta.blockType ?? null,
    primaryParameter: meta.primaryParameter ?? null,
    score: chunk?.rerankScore ?? chunk?.score ?? null,
    snippet: String(chunk?.content || "").slice(0, 220),
  };
}

function finalizeRagTrace(trace, patch = {}) {
  return {
    ...trace,
    ...patch,
    durationMs: Date.now() - (trace.startedAt || Date.now()),
  };
}

module.exports = {
  createRagTrace,
  summarizeChunkForTrace,
  finalizeRagTrace,
};
