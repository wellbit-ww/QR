const { resolveParameter } = require("../parameter-registry");
const { extractStructuredParameters } = require("../parameter-extraction");

/** Сопоставление запроса с ключом параметра (алиасы). Значения ТТХ в коде не хранятся. */
function resolveParameterFromQuery(query, focusParameter = null) {
  return resolveParameter(String(query || ""), focusParameter);
}

function extractParametersFromText(text) {
  return extractStructuredParameters(String(text || ""));
}

module.exports = {
  resolveParameterFromQuery,
  extractParametersFromText,
};
