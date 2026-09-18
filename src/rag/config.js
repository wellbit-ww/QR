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
    retrievalTopK: parseNumber(process.env.RETRIEVAL_TOP_K, 15),
    /** Сложные технические запросы (сравнение чисел, ТТХ, ТО) — больше чанков в контексте. */
    technicalRetrievalTopK: parseNumber(process.env.TECHNICAL_RETRIEVAL_TOP_K, 15),
    /** Во сколько раз расширить LIMIT перед rerank (min capped в retrieval). */
    retrievalCandidateMultiplier: parseNumber(
      process.env.RETRIEVAL_CANDIDATE_MULTIPLIER,
      4
    ),
    safetyRetrievalTopK: parseNumber(process.env.SAFETY_RETRIEVAL_TOP_K, 12),
    emergencyRetrievalTopK: parseNumber(process.env.EMERGENCY_RETRIEVAL_TOP_K, 14),
    synthesisRetrievalTopK: parseNumber(process.env.SYNTHESIS_RETRIEVAL_TOP_K, 12),
    minSimilarityScore: parseNumber(process.env.RETRIEVAL_MIN_SCORE, 0.28),
    /** Целевой размер чанка по символам (~800–1200 токенов для русских ТТХ — дефолт выше прежнего). */
    chunkSize: parseNumber(process.env.INGEST_CHUNK_SIZE, 3200),
    chunkOverlap: parseNumber(process.env.INGEST_CHUNK_OVERLAP, 500),
    ingestEmbedBatchSize: parseNumber(process.env.INGEST_EMBED_BATCH_SIZE, 16),
    /** Soft limit for embed input (chars); avoids Ollama NaN / 500 on long or heavy texts. */
    embedMaxChars: parseNumber(process.env.EMBED_MAX_CHARS, 24576),
    verifierModel: process.env.VERIFIER_MODEL || process.env.OLLAMA_MODEL || "qwen2.5:32b-instruct",
    safetyClassifierModel:
      process.env.SAFETY_CLASSIFIER_MODEL || process.env.OLLAMA_MODEL || "qwen2.5:32b-instruct",
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
    /** Parent–child ingest: large parent span for LLM, small child for vectors (disable: RAG_PARENT_CHILD=0). */
    useParentChildChunking: process.env.RAG_PARENT_CHILD !== "0",
    parentChunkChars: parseNumber(process.env.PARENT_CHUNK_CHARS, 6000),
    childChunkChars: parseNumber(process.env.CHILD_CHUNK_CHARS, 1500),
    childOverlapChars: parseNumber(process.env.CHILD_CHUNK_OVERLAP, 120),
    /** Hybrid vector + Russian FTS merged with RRF (disable: RAG_HYBRID_RRF=0). */
    hybridSearchRrf: process.env.RAG_HYBRID_RRF !== "0",
    rrfK: parseNumber(process.env.RAG_RRF_K, 60),
    /** Множитель вклада FTS в RRF при запросах с ГОСТ/IP/RH/Вт/Бар (RAG_RRF_LEXICAL_BOOST_ABBREV). */
    rrfLexicalBoostAbbrev: parseNumber(process.env.RAG_RRF_LEXICAL_BOOST_ABBREV, 2),
    /** When regex router yields UNKNOWN, call Ollama for route (disable: RAG_ROUTER_LLM=0). */
    routerLlmFallback: process.env.RAG_ROUTER_LLM !== "0",
    routerLlmModel:
      process.env.OLLAMA_ROUTER_MODEL || process.env.OLLAMA_FALLBACK_MODEL || "llama3.1:8b",
    /** Мин. сходство retrieval (0–1) для semantic rescue при мягком провале заземления. */
    semanticRescueThreshold: parseNumber(process.env.SOVA_GROUNDING_SEMANTIC_RESCUE, 0.82),
    /** LLM query rewriting перед retrieval (выкл: SOVA_QUERY_REWRITE=0). */
    queryRewriteEnabled: process.env.SOVA_QUERY_REWRITE !== "0",
  };
}

/** Upper bound for retrieval LIMIT when overlapping classifier + retrieval requests. */
function getMaxRetrievalTopK(cfg) {
  return Math.max(
    cfg.retrievalTopK,
    cfg.technicalRetrievalTopK,
    cfg.safetyRetrievalTopK,
    cfg.synthesisRetrievalTopK,
    cfg.emergencyRetrievalTopK,
    1
  );
}

function isComplexTechnicalRetrieval(routerDecision, query) {
  const q = String(query || "");
  const intent = String(routerDecision?.intent || "");
  if (
    intent === "MAINTENANCE_QUERY" ||
    intent === "COMPARISON_QUERY" ||
    intent === "SINGLE_FIELD_QUERY"
  ) {
    return true;
  }
  if (routerDecision?.focusParameter) {
    return true;
  }
  if (
    routerDecision?.retrievalMode === "hybrid_wide" ||
    routerDecision?.retrievalMode === "maintenance_focused"
  ) {
    return true;
  }
  if (
    /условия\s+эксплуатации|1\.1\.3|эксплуатац|таблиц|ттх|техническ|диапазон|допустим|максимальн|минимальн|нарушен|входит\s+ли|соответствует|можно\s+ли/i.test(
      q
    ) &&
    /\d/.test(q)
  ) {
    return true;
  }
  if (
    /\d/.test(q) &&
    /градус|температур|влажност|напряжен|кпа|гц|вольт|rh|давлен/i.test(q)
  ) {
    return true;
  }
  return false;
}

/** topK для retrieve: 10+ на сложных технических вопросах (таблицы, сравнение чисел). */
function resolveRetrievalTopK(cfg, routerDecision, query) {
  const base = Math.max(1, Math.floor(cfg.retrievalTopK || 8));
  if (isComplexTechnicalRetrieval(routerDecision, query)) {
    return Math.max(base, Math.floor(cfg.technicalRetrievalTopK || 15));
  }
  return base;
}

module.exports = {
  getRagConfig,
  getMaxRetrievalTopK,
  isComplexTechnicalRetrieval,
  resolveRetrievalTopK,
};
