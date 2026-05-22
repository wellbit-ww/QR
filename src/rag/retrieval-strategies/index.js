const { QUERY_TYPES } = require("../query-analysis");
const { chunkBestSimilarity } = require("../retrieval");
const {
  describeParameterRetrieval,
  isDeterministicParameterRoute,
} = require("./parameter-retrieval");
const {
  applyProceduralRetrieval,
  describeProceduralRetrieval,
} = require("./procedural-retrieval");
const {
  applyTroubleshootingRetrieval,
  describeTroubleshootingRetrieval,
  shouldAskDiagnosticClarification,
} = require("./troubleshooting-retrieval");
const {
  applyReasoningRetrieval,
  describeReasoningRetrieval,
} = require("./reasoning-retrieval");

function describeRoute(queryAnalysis) {
  switch (queryAnalysis?.queryType) {
    case QUERY_TYPES.DETERMINISTIC_PARAMETER:
      return describeParameterRetrieval(queryAnalysis);
    case QUERY_TYPES.PROCEDURAL_QA:
      return describeProceduralRetrieval(queryAnalysis);
    case QUERY_TYPES.TROUBLESHOOTING_QA:
      return describeTroubleshootingRetrieval(queryAnalysis);
    case QUERY_TYPES.REASONING_QA:
      return describeReasoningRetrieval(queryAnalysis);
    default:
      return {
        route: QUERY_TYPES.UNKNOWN,
        retrievalStrategy: "fallback_hybrid",
        answerStrategy: "grounded_fallback_synthesis",
        llmAllowed: true,
        deterministicUsed: false,
      };
  }
}

async function applySpecializedRetrievalStrategy({
  equipmentId,
  query,
  queryAnalysis,
  retrieval,
}) {
  const route = describeRoute(queryAnalysis);
  const baseChunks = retrieval?.chunks || [];
  let chunks = baseChunks;
  let causalChain = [];
  let causalChainUsed = false;
  let diagnosticClarificationSuggested = false;

  if (queryAnalysis?.queryType === QUERY_TYPES.PROCEDURAL_QA) {
    chunks = applyProceduralRetrieval(baseChunks);
  } else if (queryAnalysis?.queryType === QUERY_TYPES.TROUBLESHOOTING_QA) {
    chunks = applyTroubleshootingRetrieval(baseChunks, queryAnalysis);
    diagnosticClarificationSuggested = shouldAskDiagnosticClarification(queryAnalysis, chunks);
  } else if (queryAnalysis?.queryType === QUERY_TYPES.REASONING_QA) {
    const reasoning = await applyReasoningRetrieval({ equipmentId, query, chunks: baseChunks });
    chunks = reasoning.chunks;
    causalChain = reasoning.chain;
    causalChainUsed = reasoning.causalChainUsed;
  }

  const chunkTop = chunks.length ? chunkBestSimilarity(chunks[0]) : 0;
  const mergedTopScore = Math.max(
    chunkTop,
    Number(retrieval?.topScore || 0),
    Number(retrieval?.vectorTopSimilarity || 0),
    Number(retrieval?.fusionScore || 0),
  );

  return {
    ...retrieval,
    chunks,
    topScore: mergedTopScore,
    telemetryCandidates: chunks.slice(0, Math.min(40, chunks.length)).map((ch) => ({
      sourceDoc: ch.sourceDoc,
      section: ch.section,
      chunkIndex: ch.chunkIndex,
      chunkKind: ch.metadata?.chunkKind ?? null,
      blockType: ch.metadata?.blockType ?? null,
      primaryParameter: ch.metadata?.primaryParameter ?? null,
      rerankScore: chunkBestSimilarity(ch),
      rerankComponents: ch.rerankComponents ?? null,
      retrievalStrategyBoost: ch.retrievalStrategyBoost ?? null,
      neighborExpanded: Boolean(ch.neighborExpanded),
      snippet: String(ch.content || "").slice(0, 280),
    })),
    retrievalMode: route.retrievalStrategy,
    route,
    causalChain,
    causalChainUsed,
    diagnosticClarificationSuggested,
  };
}

module.exports = {
  describeRoute,
  applySpecializedRetrievalStrategy,
  isDeterministicParameterRoute,
};
