/**
 * Equipment profile — SDB1106NM (Phase F baseline).
 * Wraps model-specific gate, deterministic facts, and post-gate hardening.
 */
const {
  classifySdb1106nmMessage,
  buildSafetyDeterministicOrPrompt,
} = require("../../rag/sdb1106nm-chat-gate");
const {
  directContextHintsForMessage,
  tryDeterministicSdb1106nmAnswer,
  buildSdb1106nmDirectSystemContent,
  extractSafetyDocExcerpt,
} = require("../../rag/sdb1106nm-direct-facts");
const { applySdb1106nmPostGate } = require("../../rag/sdb1106nm-post-gate");

/** @type {import("../equipment-runtime").EquipmentProfile} */
const sdb1106nmProfile = {
  id: "sdb1106-nm",
  label: "SDB1106 NM",
  autoDirectWhenNoPostgres: true,
  deferGuardrailsToPostGate: true,

  classifyPreGate(message, ctx = {}) {
    return classifySdb1106nmMessage(message, ctx);
  },

  tryDeterministicAnswer(message, ctx = {}) {
    return tryDeterministicSdb1106nmAnswer(message, ctx);
  },

  buildSafetyDeterministicOrPrompt(message, docText) {
    return buildSafetyDeterministicOrPrompt(message, docText);
  },

  directContextHints(message) {
    return directContextHintsForMessage(message);
  },

  buildDirectSystemContent(systemPrompt, docText) {
    return buildSdb1106nmDirectSystemContent(systemPrompt, docText);
  },

  extractSafetyDocExcerpt(docText, message) {
    return extractSafetyDocExcerpt(docText, message);
  },

  applyPostGate(params) {
    return applySdb1106nmPostGate(params);
  },
};

module.exports = sdb1106nmProfile;
