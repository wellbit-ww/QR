const { ROUTES } = require("../router/query-router");

const ACTIONS = Object.freeze({
  DETERMINISTIC_PARAMETER: "DETERMINISTIC_PARAMETER",
  ASK_CLARIFICATION: "ASK_CLARIFICATION",
  ABSTAIN: "ABSTAIN",
  SAFETY_CHECKLIST: "SAFETY_CHECKLIST",
  LLM_GENERATE: "LLM_GENERATE",
});

function makeDecision({ routerDecision, retrieval, minScoreThreshold }) {
  const route = routerDecision?.route || ROUTES.UNKNOWN;
  const retrievalScore = Number(retrieval?.scores?.topScore || 0);
  const minScore = Number.isFinite(minScoreThreshold)
    ? minScoreThreshold
    : Number(retrieval?.scores?.minSimilarityScore || 0.35);
  const hasChunks = (retrieval?.fusedChunks?.length || 0) > 0;
  const humidityRelaxedPass =
    routerDecision?.intent === "SINGLE_FIELD_QUERY" &&
    routerDecision?.focusParameter === "humidity" &&
    hasChunks &&
    retrievalScore >= minScore * 0.65;
  const maintenanceRelaxedPass =
    routerDecision?.intent === "MAINTENANCE_QUERY" && hasChunks && retrievalScore >= minScore * 0.6;
  const operatingCompareRelaxedPass =
    routerDecision?.intent === "COMPARISON_QUERY" && hasChunks && retrievalScore >= minScore * 0.6;
  const proceduralRelaxedPass =
    route === ROUTES.PROCEDURAL_QA && hasChunks && retrievalScore >= minScore * 0.55;
  const reasoningRelaxedPass =
    route === ROUTES.REASONING_QA && hasChunks && retrievalScore >= minScore * 0.55;
  const wideContextRelaxedPass =
    routerDecision?.retrievalMode === "hybrid_wide" &&
    hasChunks &&
    retrievalScore >= minScore * 0.55;
  const safetyCriticalPass =
    routerDecision?.route === ROUTES.SAFETY_QA &&
    routerDecision?.safetyAnswerMode === "grounded_text" &&
    hasChunks;
  const retrievalPassed =
    (retrievalScore >= minScore && hasChunks) ||
    humidityRelaxedPass ||
    maintenanceRelaxedPass ||
    operatingCompareRelaxedPass ||
    proceduralRelaxedPass ||
    reasoningRelaxedPass ||
    wideContextRelaxedPass ||
    safetyCriticalPass;

  if (route === ROUTES.TROUBLESHOOTING_QA && !retrievalPassed) {
    return {
      action: ACTIONS.ASK_CLARIFICATION,
      reason: "troubleshooting_retrieval_weak",
      llmAllowed: false,
      retrievalPassed,
    };
  }

  if (!retrievalPassed) {
    return {
      action: ACTIONS.ABSTAIN,
      reason: "retrieval_below_threshold",
      llmAllowed: false,
      retrievalPassed,
    };
  }

  if (route === ROUTES.SAFETY_QA) {
    if (routerDecision?.safetyAnswerMode === "grounded_text") {
      return {
        action: ACTIONS.LLM_GENERATE,
        reason: "safety_grounded_text_from_re",
        llmAllowed: true,
        retrievalPassed,
      };
    }
    return {
      action: ACTIONS.SAFETY_CHECKLIST,
      reason: "safety_route_constrained_json",
      llmAllowed: true,
      retrievalPassed,
    };
  }

  const parameterFactViaLlm =
    route === ROUTES.UNKNOWN &&
    (routerDecision?.intent === "SINGLE_FIELD_QUERY" || routerDecision?.parameterResolved);

  if (
    route === ROUTES.PROCEDURAL_QA ||
    route === ROUTES.REASONING_QA ||
    route === ROUTES.TROUBLESHOOTING_QA ||
    route === ROUTES.UNKNOWN
  ) {
    return {
      action: ACTIONS.LLM_GENERATE,
      reason: parameterFactViaLlm
        ? "single_field_parameter_llm_from_context"
        : route === ROUTES.UNKNOWN
          ? "unknown_route_with_valid_retrieval"
          : "route_allows_grounded_generation",
      llmAllowed: true,
      retrievalPassed,
    };
  }

  return {
    action: ACTIONS.ABSTAIN,
    reason: "unsupported_route",
    llmAllowed: false,
    retrievalPassed,
  };
}

module.exports = {
  ACTIONS,
  makeDecision,
};
