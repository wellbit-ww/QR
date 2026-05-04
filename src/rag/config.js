const DEFAULT_EMBEDDING_URL = "http://127.0.0.1:11434/api/embed";
const DEFAULT_EMBEDDING_MODEL = "bge-m3";

function parseNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

function getRagConfig() {
  return {
    postgresUrl: process.env.POSTGRES_URL || "",
    embeddingUrl: process.env.EMBEDDING_URL || DEFAULT_EMBEDDING_URL,
    embeddingModel: process.env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL,
    retrievalTopK: parseNumber(process.env.RETRIEVAL_TOP_K, 8),
    safetyRetrievalTopK: parseNumber(process.env.SAFETY_RETRIEVAL_TOP_K, 12),
    emergencyRetrievalTopK: parseNumber(process.env.EMERGENCY_RETRIEVAL_TOP_K, 14),
    synthesisRetrievalTopK: parseNumber(process.env.SYNTHESIS_RETRIEVAL_TOP_K, 12),
    minSimilarityScore: parseNumber(process.env.RETRIEVAL_MIN_SCORE, 0.35),
    chunkSize: parseNumber(process.env.INGEST_CHUNK_SIZE, 1200),
    chunkOverlap: parseNumber(process.env.INGEST_CHUNK_OVERLAP, 200),
    verifierModel: process.env.VERIFIER_MODEL || "qwen2.5:1.5b-instruct",
    safetyClassifierModel:
      process.env.SAFETY_CLASSIFIER_MODEL || "qwen2.5:1.5b-instruct",
  };
}

module.exports = {
  getRagConfig,
};
