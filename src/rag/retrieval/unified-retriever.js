const { resolveRetrievalTopK } = require("../config");
const { isRegenerationShutdownQuery } = require("../safety-query-scope");
const { retrieveEquipmentContext } = require("../retrieval");
const { applySpecializedRetrievalStrategy } = require("../retrieval-strategies");
const { shouldInjectTable11, shouldInjectP1GoldenFacts } = require("../sdb1106nm-golden-facts");
const {
  isSdb1560mKitShelfCountQuery,
  isSdb1560mHumiditySetQuery,
} = require("../sdb1560m-rag-priority");
const { isHonestNumericSpecOnlyQuery } = require("../honest-rag-mode");

function buildIntentForRetrieval(routerDecision, query) {
  const route = routerDecision?.route || "UNKNOWN";
  const parameterFactViaLlm =
    route === "UNKNOWN" &&
    (routerDecision?.intent === "SINGLE_FIELD_QUERY" || routerDecision?.parameterResolved);
  if (routerDecision?.intent === "MAINTENANCE_QUERY") {
    return {
      intentType: "MAINTENANCE_QUERY",
      focusParameter: routerDecision?.focusParameter || null,
      queryScope: "medium",
      queryRisk: "medium",
      retrievalMode: routerDecision?.retrievalMode || "maintenance_focused",
      symptomDomain: routerDecision?.symptom || null,
      queryOperatingModes: [],
      originalQuery: String(query || "").trim(),
    };
  }
  const intentTypeMap = {
    DETERMINISTIC_PARAMETER: "FACT_QUERY",
    PROCEDURAL_QA: routerDecision.intent === "GETTING_STARTED_QUERY" ? "GETTING_STARTED_QUERY" : "PROCEDURE_QUERY",
    TROUBLESHOOTING_QA: "TROUBLESHOOTING_QUERY",
    REASONING_QA: "FACT_QUERY",
    SAFETY_QA: "SAFETY_QUERY",
    UNKNOWN: routerDecision?.intent || "FACT_QUERY",
  };
  const intentType = parameterFactViaLlm ? "FACT_QUERY" : intentTypeMap[route] || "FACT_QUERY";
  return {
    intentType,
    focusParameter: routerDecision?.focusParameter || null,
    queryScope: parameterFactViaLlm || intentType === "FACT_QUERY" ? "broad" : intentType === "SINGLE_FIELD_QUERY" ? "medium" : "medium",
    queryRisk: intentType === "TROUBLESHOOTING_QUERY" || intentType === "SAFETY_QUERY" ? "high" : "medium",
    retrievalMode: routerDecision?.retrievalMode || "hybrid",
    symptomDomain: routerDecision?.symptom || null,
    queryOperatingModes: [],
    originalQuery: String(query || "").trim(),
  };
}

async function unifiedRetrieve({
  ragConfig,
  equipmentId,
  query,
  routerDecision,
  retrievalTopCap,
  sectionHints,
}) {
  const topCap = Number.isFinite(retrievalTopCap)
    ? retrievalTopCap
    : resolveRetrievalTopK(ragConfig, routerDecision, query);
  const wideHybrid = routerDecision?.retrievalMode === "hybrid_wide";
  const maintenanceFocused = routerDecision?.retrievalMode === "maintenance_focused";
  const effectiveTopCap = wideHybrid
    ? Math.min(Math.max(topCap, ragConfig.synthesisRetrievalTopK + 2, 14), 32)
    : maintenanceFocused
      ? Math.max(topCap, ragConfig.technicalRetrievalTopK || 10)
      : topCap;
  const intent = buildIntentForRetrieval(routerDecision, query);
  const hints =
    Array.isArray(sectionHints) && sectionHints.length
      ? sectionHints
      : Array.isArray(routerDecision?.sectionHints)
        ? routerDecision.sectionHints
        : [];

  const base = await retrieveEquipmentContext({
    equipmentId,
    query,
    topK: effectiveTopCap,
    sectionHints: hints,
    intent: {
      ...intent,
      retrievalBoosters: {
        emergencySmoke: routerDecision?.retrievalMode === "emergency_section_24",
        regenerationShutdown: isRegenerationShutdownQuery(query),
        humidityStep: routerDecision?.focusParameter === "humidity",
        troubleshootingPossibleFaults: routerDecision?.route === "TROUBLESHOOTING_QA",
        maintenanceSections: routerDecision?.intent === "MAINTENANCE_QUERY",
        indicatorNormalMode: Boolean(routerDecision?.indicatorNormalMode),
        table11Flatten:
          equipmentId === "sdb151-nm"
            ? false
            : equipmentId === "sdb1106-nm"
            ? shouldInjectTable11(query, routerDecision) ||
              routerDecision?.focusParameter === "dimensions" ||
              routerDecision?.focusParameter === "load" ||
              /масс|габарит|ширин|высот|глубин|таблиц[аы]?\s*1\.1|1\.1\.2\.8|\bвес\b/i.test(String(query || ""))
            : equipmentId === "sdb1560m"
            ? routerDecision?.focusParameter === "kit_shelf_count" ||
              routerDecision?.focusParameter === "dimensions" ||
              routerDecision?.focusParameter === "load" ||
              isSdb1560mKitShelfCountQuery(query) ||
              /масс|габарит|таблиц[аы]?\s*1\.[12]/i.test(String(query || ""))
            : routerDecision?.focusParameter === "dimensions" ||
              routerDecision?.focusParameter === "load" ||
              /масс|габарит|ширин|высот|глубин|таблиц[аы]?\s*1\.1|1\.1\.2\.8/i.test(String(query || "")),
        sdb1560KitSupply:
          equipmentId === "sdb1560m" &&
          (routerDecision?.focusParameter === "kit_shelf_count" || isSdb1560mKitShelfCountQuery(query)),
        sdb1560SpecTable:
          equipmentId === "sdb1560m" &&
          isHonestNumericSpecOnlyQuery(query, intent),
        sdb1560HumidityUi:
          equipmentId === "sdb1560m" &&
          (isSdb1560mHumiditySetQuery(query) || routerDecision?.focusParameter === "humidity"),
        p1GoldenFacts:
          equipmentId === "sdb1106-nm" && shouldInjectP1GoldenFacts(query, routerDecision),
        sdb302RetrievalCards:
          equipmentId === "w-700" ||
          equipmentId === "sdb702-nm" ||
          equipmentId === "sdb151-nm" ||
          equipmentId === "sdb1560m",
      },
    },
  });

  const analyzedRoute = {
    queryType: routerDecision.route,
    requiresDeterministic: false,
    requiresProcedure: routerDecision.route === "PROCEDURAL_QA",
    requiresTroubleshooting: routerDecision.route === "TROUBLESHOOTING_QA",
    requiresReasoning: routerDecision.route === "REASONING_QA",
    confidence: Number(routerDecision.confidence || 0),
    extractedSymptoms: routerDecision.symptoms || [],
    extractedParameters: routerDecision.parameterResolved?.parameterKey
      ? [routerDecision.parameterResolved.parameterKey]
      : [],
    intent,
  };

  const specialized = await applySpecializedRetrievalStrategy({
    equipmentId,
    query,
    queryAnalysis: analyzedRoute,
    retrieval: base,
  });

  const semanticChunks = base.chunks || [];
  const structuredChunks =
    specialized.parameterResolved || specialized.parameterLookupAttempted ? specialized.chunks || [] : [];
  const fusedChunks = specialized.chunks || [];
  const bestMode =
    specialized.parameterResolved && routerDecision.route === "DETERMINISTIC_PARAMETER"
      ? "structured"
      : routerDecision?.retrievalMode === "hybrid_wide"
      ? "hybrid_wide"
      : specialized.route?.retrievalStrategy || specialized.retrievalMode || "hybrid";

  const maxScore = (...vals) => {
    const nums = vals.map((v) => Number(v || 0)).filter((n) => Number.isFinite(n));
    return nums.length ? Math.max(...nums) : 0;
  };

  return {
    semanticChunks,
    structuredChunks,
    fusedChunks,
    bestMode,
    chunksBeforeSingleFieldNarrowing: base.chunksBeforeSingleFieldNarrowing || null,
    scores: {
      topScore: maxScore(
        base.topScore,
        specialized.topScore,
        base.vectorTopSimilarity,
        specialized.vectorTopSimilarity,
      ),
      lexicalScore: maxScore(base.lexicalScore, specialized.lexicalScore),
      fusionScore: maxScore(
        base.fusionScore,
        specialized.fusionScore,
        base.topScore,
        specialized.topScore,
        base.vectorTopSimilarity,
        specialized.vectorTopSimilarity,
      ),
      vectorTopSimilarity: maxScore(base.vectorTopSimilarity, specialized.vectorTopSimilarity),
      minSimilarityScore: Number(ragConfig.minSimilarityScore || 0.35),
    },
    intent,
    raw: specialized,
  };
}

module.exports = {
  unifiedRetrieve,
  buildIntentForRetrieval,
};
