const {
  classifySdb151nmMessage,
  buildSafetyDeterministicOrPrompt,
} = require("../../rag/sdb151nm-chat-gate");
const {
  tryDeterministicSdb151nmAnswer,
  buildSdb151nmDirectSystemContent,
  extractSafetyDocExcerpt,
} = require("../../rag/sdb151nm-direct-facts");
const { applySdb151nmPostGate } = require("../../rag/sdb151nm-post-gate");
const {
  directContextHintsForSdb151nmMessage,
  sectionHintsForSdb151nmMessage,
} = require("../../rag/sdb151nm-rag-priority");

const sdb151NmProfile = {
  id: "sdb151-nm",
  label: "SDB151 NM",
  autoDirectWhenNoPostgres: true,
  deferGuardrailsToPostGate: true,

  classifyPreGate(message, ctx = {}) {
    return classifySdb151nmMessage(message, { ...ctx, equipmentChatScoped: true });
  },

  tryDeterministicAnswer(message, ctx = {}) {
    return tryDeterministicSdb151nmAnswer(message, ctx);
  },

  buildSafetyDeterministicOrPrompt,

  directContextHints(message) {
    return directContextHintsForSdb151nmMessage(message);
  },

  sectionHints(message) {
    return sectionHintsForSdb151nmMessage(message);
  },

  buildDirectSystemContent(systemPrompt, docText) {
    return buildSdb151nmDirectSystemContent(systemPrompt, docText);
  },

  extractSafetyDocExcerpt,

  applyPostGate(params) {
    return applySdb151nmPostGate(params);
  },
};

module.exports = sdb151NmProfile;
