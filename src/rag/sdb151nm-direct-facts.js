/**
 * SDB151NM deterministic layer — тонкая обёртка над каталогом.
 */
const catalog = require("../equipment/catalogs/sdb151-nm");
const {
  tryDeterministicFromCatalog,
  buildDirectSystemContentFromCatalog,
  extractSafetyDocExcerptFromCatalog,
  buildSafetyDeterministicOrPromptFromCatalog,
} = require("./catalog-engine");
const {
  filterSdb151nmContextText,
  prependSdb151nmContextPreface,
} = require("./sdb151nm-context-filter");

function tryDeterministicSdb151nmAnswer(message, options = {}) {
  return tryDeterministicFromCatalog(catalog, message, options);
}

function buildSdb151nmDirectSystemContent(systemPrompt, docText) {
  const filtered = prependSdb151nmContextPreface(filterSdb151nmContextText(docText));
  return buildDirectSystemContentFromCatalog(catalog, systemPrompt, filtered);
}

function extractSafetyDocExcerpt(docText, message) {
  return filterSdb151nmContextText(extractSafetyDocExcerptFromCatalog(docText, message));
}

function buildSafetyDeterministicOrPrompt(message, docText) {
  const result = buildSafetyDeterministicOrPromptFromCatalog(catalog, message, docText);
  if (result && result.docExcerpt) {
    result.docExcerpt = filterSdb151nmContextText(result.docExcerpt);
  }
  return result;
}

module.exports = {
  SDB151NM_CRITICAL_FACTS: catalog.criticalFacts,
  buildSdb151nmDirectSystemContent,
  buildSafetyDeterministicOrPrompt,
  extractSafetyDocExcerpt,
  tryDeterministicSdb151nmAnswer,
};
