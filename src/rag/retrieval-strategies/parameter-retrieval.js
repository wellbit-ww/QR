const { QUERY_TYPES } = require("../query-analysis");

function isDeterministicParameterRoute(queryAnalysis) {
  return queryAnalysis?.queryType === QUERY_TYPES.DETERMINISTIC_PARAMETER;
}

function describeParameterRetrieval(queryAnalysis) {
  const parameterKey = queryAnalysis?.extractedParameters?.[0] || queryAnalysis?.intent?.focusParameter || null;
  return {
    route: QUERY_TYPES.DETERMINISTIC_PARAMETER,
    retrievalStrategy: "structured_parameter_lookup",
    answerStrategy: "deterministic_no_llm",
    llmAllowed: false,
    deterministicUsed: true,
    parameterKey,
  };
}

module.exports = {
  isDeterministicParameterRoute,
  describeParameterRetrieval,
};
