const {
  classifySdb702nmMessage,
  buildSafetyDeterministicOrPrompt,
} = require("../../rag/sdb702nm-chat-gate");
const {
  tryDeterministicSdb702nmAnswer,
  buildSdb702nmDirectSystemContent,
  extractSafetyDocExcerpt,
} = require("../../rag/sdb702nm-direct-facts");
const { applySdb702nmPostGate } = require("../../rag/sdb702nm-post-gate");
const {
  directContextHintsForSdb702nmMessage,
  sectionHintsForSdb702nmMessage,
} = require("../../rag/sdb702nm-rag-priority");

const sdb702nmProfile = {
  id: "sdb702-nm",
  label: "SDB702 NM",
  autoDirectWhenNoPostgres: true,
  deferGuardrailsToPostGate: true,

  classifyPreGate(message, ctx = {}) {
    return classifySdb702nmMessage(message, { ...ctx, equipmentChatScoped: true });
  },

  tryDeterministicAnswer(message, ctx = {}) {
    return tryDeterministicSdb702nmAnswer(message, ctx);
  },

  buildSafetyDeterministicOrPrompt,

  directContextHints(message) {
    return directContextHintsForSdb702nmMessage(message);
  },

  sectionHints(message) {
    return sectionHintsForSdb702nmMessage(message);
  },

  buildDirectSystemContent(systemPrompt, docText) {
    return buildSdb702nmDirectSystemContent(systemPrompt, docText);
  },

  extractSafetyDocExcerpt,

  applyPostGate(params) {
    return applySdb702nmPostGate(params);
  },
};

module.exports = sdb702nmProfile;
