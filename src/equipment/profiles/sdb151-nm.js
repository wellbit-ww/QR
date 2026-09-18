const catalog = require("../catalogs/sdb151-nm");
const {
  classifyFromCatalog,
  tryDeterministicFromCatalog,
  buildSafetyDeterministicOrPromptFromCatalog,
  directContextHintsFromCatalog,
  sectionHintsFromCatalog,
  buildDirectSystemContentFromCatalog,
  extractSafetyDocExcerptFromCatalog,
} = require("../../rag/catalog-engine");
const { applySdb151nmPostGate } = require("../../rag/sdb151nm-post-gate");
const {
  filterSdb151nmContextText,
  prependSdb151nmContextPreface,
} = require("../../rag/sdb151nm-context-filter");

const sdb151NmProfile = {
  id: catalog.id,
  label: catalog.displayName,
  catalog,
  autoDirectWhenNoPostgres: true,
  deferGuardrailsToPostGate: true,

  classifyPreGate(message, ctx = {}) {
    return classifyFromCatalog(catalog, message, { ...ctx, equipmentChatScoped: true });
  },

  tryDeterministicAnswer(message, ctx = {}) {
    return tryDeterministicFromCatalog(catalog, message, ctx);
  },

  buildSafetyDeterministicOrPrompt(message, docText) {
    const result = buildSafetyDeterministicOrPromptFromCatalog(catalog, message, docText);
    if (result && result.docExcerpt) {
      result.docExcerpt = filterSdb151nmContextText(result.docExcerpt);
    }
    return result;
  },

  directContextHints(message) {
    return directContextHintsFromCatalog(catalog, message);
  },

  sectionHints(message) {
    return sectionHintsFromCatalog(catalog, message);
  },

  buildDirectSystemContent(systemPrompt, docText) {
    return buildDirectSystemContentFromCatalog(
      catalog,
      systemPrompt,
      prependSdb151nmContextPreface(filterSdb151nmContextText(docText))
    );
  },

  extractSafetyDocExcerpt(docText, message) {
    return filterSdb151nmContextText(extractSafetyDocExcerptFromCatalog(docText, message));
  },

  applyPostGate(params) {
    return applySdb151nmPostGate(params);
  },
};

module.exports = sdb151NmProfile;
