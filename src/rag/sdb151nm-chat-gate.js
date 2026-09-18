const catalog = require("../equipment/catalogs/sdb151-nm");
const { classifyFromCatalog, buildSafetyDeterministicOrPromptFromCatalog } = require("./catalog-engine");

function classifySdb151nmMessage(message, ctx = {}) {
  return classifyFromCatalog(catalog, message, ctx);
}

function buildSafetyDeterministicOrPrompt(message, docText) {
  return buildSafetyDeterministicOrPromptFromCatalog(catalog, message, docText);
}

module.exports = {
  buildSafetyDeterministicOrPrompt,
  classifySdb151nmMessage,
};
