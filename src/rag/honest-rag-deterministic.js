const { foreignSdbModels } = require("./sdb-model-scope");
const { isEmergencySmokeQuery, isRegenerationShutdownQuery } = require("./safety-query-scope");
const { isContactSupportQuery } = require("./sdb1106nm-query-variants");
const { buildPortalContactSupportAnswer } = require("./portal-contact-support-answer");
const {
  isEquipmentSerialNumberQuery,
  resolveSerialNumberAnswer,
} = require("./equipment-serial-number-scope");
const {
  isUnsupportedReplacementQuery,
  buildUnsupportedReplacementAnswer,
} = require("./unsupported-replacement-scope");

const DEFAULT_EQUIPMENT = Object.freeze({ id: "sdb1560m", name: "SDB1560 M" });

/**
 * Узкий whitelist deterministic для honest-режима (без TTX FAQ из direct-facts).
 */
function tryHonestWhitelistedDeterministicAnswer(message, ctx = {}, equipment = DEFAULT_EQUIPMENT) {
  const text = String(message || "").trim();
  if (!text) {
    return null;
  }

  if (foreignSdbModels(text, equipment).length) {
    return null;
  }

  if (isContactSupportQuery(text)) {
    return buildPortalContactSupportAnswer();
  }

  if (isEquipmentSerialNumberQuery(text)) {
    return resolveSerialNumberAnswer(text, equipment.name || "SDB1560NM");
  }

  if (isUnsupportedReplacementQuery(text)) {
    return buildUnsupportedReplacementAnswer(text);
  }

  if (isEmergencySmokeQuery(text) || isRegenerationShutdownQuery(text)) {
    const buildSafety = ctx.buildSafetyDeterministicOrPrompt;
    if (typeof buildSafety === "function") {
      const safetyPath = buildSafety(text, ctx.docText || "");
      if (safetyPath?.mode === "deterministic" && safetyPath.answer) {
        return safetyPath.answer;
      }
    }
  }

  return null;
}

module.exports = {
  tryHonestWhitelistedDeterministicAnswer,
};
