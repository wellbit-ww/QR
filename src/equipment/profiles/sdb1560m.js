const {
  classifySdb1560mMessage,
  buildSafetyDeterministicOrPrompt,
} = require("../../rag/sdb1560m-chat-gate");
const {
  tryDeterministicSdb1560mAnswer,
  buildSdb1560mDirectSystemContent,
  extractSafetyDocExcerpt,
} = require("../../rag/sdb1560m-direct-facts");
const { applySdb1560mPostGate } = require("../../rag/sdb1560m-post-gate");
const {
  directContextHintsForSdb1560mMessage,
  sectionHintsForSdb1560mMessage,
} = require("../../rag/sdb1560m-rag-priority");
const { shouldUseHonestRag } = require("../../rag/honest-rag-mode");
const { tryHonestWhitelistedDeterministicAnswer } = require("../../rag/honest-rag-deterministic");
const { applyHonestRagPostGate } = require("../../rag/honest-rag-post-gate");

const HONEST_EQUIPMENT = Object.freeze({ id: "sdb1560m", name: "SDB1560 M" });

const sdb1560mProfile = {
  id: "sdb1560m",
  label: "SDB1560 M",
  autoDirectWhenNoPostgres: true,
  deferGuardrailsToPostGate: true,

  classifyPreGate(message, ctx = {}) {
    return classifySdb1560mMessage(message, { ...ctx, equipmentChatScoped: true });
  },

  tryDeterministicAnswer(message, ctx = {}) {
    if (shouldUseHonestRag("sdb1560m")) {
      return tryHonestWhitelistedDeterministicAnswer(message, {
        ...ctx,
        buildSafetyDeterministicOrPrompt,
      }, HONEST_EQUIPMENT);
    }
    return tryDeterministicSdb1560mAnswer(message, ctx);
  },

  buildSafetyDeterministicOrPrompt,

  directContextHints(message) {
    return directContextHintsForSdb1560mMessage(message);
  },

  sectionHints(message) {
    return sectionHintsForSdb1560mMessage(message);
  },

  buildDirectSystemContent(systemPrompt, docText) {
    return buildSdb1560mDirectSystemContent(systemPrompt, docText);
  },

  extractSafetyDocExcerpt,

  applyPostGate(params) {
    const equipmentId = params?.equipment?.id || "sdb1560m";
    if (shouldUseHonestRag(equipmentId)) {
      return applyHonestRagPostGate(params);
    }
    return applySdb1560mPostGate(params);
  },
};

module.exports = sdb1560mProfile;
