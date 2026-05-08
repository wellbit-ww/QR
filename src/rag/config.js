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
    /** Во сколько раз расширить LIMIT перед rerank (min capped в retrieval). */
    retrievalCandidateMultiplier: parseNumber(
      process.env.RETRIEVAL_CANDIDATE_MULTIPLIER,
      4
    ),
    safetyRetrievalTopK: parseNumber(process.env.SAFETY_RETRIEVAL_TOP_K, 12),
    emergencyRetrievalTopK: parseNumber(process.env.EMERGENCY_RETRIEVAL_TOP_K, 14),
    synthesisRetrievalTopK: parseNumber(process.env.SYNTHESIS_RETRIEVAL_TOP_K, 12),
    minSimilarityScore: parseNumber(process.env.RETRIEVAL_MIN_SCORE, 0.35),
    /** Целевой размер чанка по символам (~800–1200 токенов для русских ТТХ — дефолт выше прежнего). */
    chunkSize: parseNumber(process.env.INGEST_CHUNK_SIZE, 3200),
    chunkOverlap: parseNumber(process.env.INGEST_CHUNK_OVERLAP, 280),
    ingestEmbedBatchSize: parseNumber(process.env.INGEST_EMBED_BATCH_SIZE, 16),
    /** Soft limit for embed input (chars); avoids Ollama NaN / 500 on long or heavy texts. */
    embedMaxChars: parseNumber(process.env.EMBED_MAX_CHARS, 24576),
    verifierModel: process.env.VERIFIER_MODEL || "gemma4:e2b",
    safetyClassifierModel:
      process.env.SAFETY_CLASSIFIER_MODEL || "gemma4:e2b",
    /** Second LLM pass to curb over-generalization / invented steps (disable: CHAT_SELF_CORRECT=0). */
    chatSelfCorrect: process.env.CHAT_SELF_CORRECT !== "0",
    selfCorrectionMaxContextChars: parseNumber(
      process.env.SELF_CORRECT_MAX_CONTEXT_CHARS,
      14000
    ),
    /** Включить префикс intent/model к запросу эмбеддинга (по умолчанию выкл.). */
    ragEmbedAugmentation: process.env.RAG_EMBED_AUGMENTATION === "1",
    /** Локальный rerank после vector search (выкл: RAG_RERANK=0). */
    ragRerankEnabled: process.env.RAG_RERANK !== "0",
    /** Пост-валидация ragGroundingCheck в API (выкл: RAG_ANSWER_VALIDATION=0). */
    ragAnswerValidation: process.env.RAG_ANSWER_VALIDATION !== "0",
  };
}

/** Upper bound for retrieval LIMIT when overlapping classifier + retrieval requests. */
function getMaxRetrievalTopK(cfg) {
  return Math.max(
    cfg.retrievalTopK,
    cfg.safetyRetrievalTopK,
    cfg.synthesisRetrievalTopK,
    cfg.emergencyRetrievalTopK,
    1
  );
}

module.exports = {
  getRagConfig,
  getMaxRetrievalTopK,
};
