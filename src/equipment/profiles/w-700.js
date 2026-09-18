const {
  classifySdb302nmMessage,
  buildSafetyDeterministicOrPrompt,
} = require("../../rag/sdb302nm-chat-gate");
const {
  tryDeterministicSdb302nmAnswer,
  buildSdb302nmDirectSystemContent,
  extractSafetyDocExcerpt,
} = require("../../rag/sdb302nm-direct-facts");
const { applySdb302nmPostGate } = require("../../rag/sdb302nm-post-gate");
const {
  directContextHintsForSdb302nmMessage,
  sectionHintsForSdb302nmMessage,
} = require("../../rag/sdb302nm-rag-priority");

const w700Profile = {
  id: "w-700",
  label: "SDB302 NM",
  autoDirectWhenNoPostgres: true,
  deferGuardrailsToPostGate: true,

  classifyPreGate(message, ctx = {}) {
    return classifySdb302nmMessage(message, { ...ctx, equipmentChatScoped: true });
  },

  tryDeterministicAnswer(message, ctx = {}) {
    return tryDeterministicSdb302nmAnswer(message, ctx);
  },

  buildSafetyDeterministicOrPrompt,

  directContextHints(message) {
    return directContextHintsForSdb302nmMessage(message);
  },

  sectionHints(message) {
    return sectionHintsForSdb302nmMessage(message);
  },

  buildDirectSystemContent(systemPrompt, docText) {
    return buildSdb302nmDirectSystemContent(systemPrompt, docText);
  },

  extractSafetyDocExcerpt,

  applyPostGate(params) {
    return applySdb302nmPostGate(params);
  },
};

module.exports = w700Profile;
