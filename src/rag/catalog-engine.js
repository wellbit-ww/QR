/**
 * Общий движок профилей шкафов: каталог = данные, здесь = маршруты ответа.
 * Пилот: SDB151NM. Контакты, серийник и замена без инструкции в РЭ — общие модули.
 */
const { isContactSupportQuery } = require("./sdb1106nm-query-variants");
const { buildPortalContactSupportAnswer } = require("./portal-contact-support-answer");
const {
  isUnsupportedReplacementQuery,
  buildUnsupportedReplacementAnswer,
} = require("./unsupported-replacement-scope");
const {
  isEquipmentSerialNumberQuery,
  resolveSerialNumberAnswer,
} = require("./equipment-serial-number-scope");
const { isEmergencySmokeQuery, isRegenerationShutdownQuery } = require("./safety-query-scope");
const { foreignSdbModels, buildForeignModelReply } = require("./sdb-model-scope");

function asRegExp(match) {
  if (match instanceof RegExp) {
    return match;
  }
  if (typeof match === "string" && match) {
    return new RegExp(match, "iu");
  }
  return null;
}

function textMatches(match, text) {
  const re = asRegExp(match);
  return Boolean(re && re.test(String(text || "")));
}

function factAnswer(facts, rule) {
  if (rule.answer) {
    return rule.answer;
  }
  const list = Array.isArray(facts) ? facts : [];
  const found = list.find((fact) => {
    const answer = String(fact.answer || "");
    if (rule.answerIncludes instanceof RegExp && !rule.answerIncludes.test(answer)) {
      return false;
    }
    if (Array.isArray(rule.answerIncludesAll)) {
      return rule.answerIncludesAll.every((re) => asRegExp(re).test(answer));
    }
    if (rule.id && fact.id && rule.id !== fact.id) {
      return false;
    }
    return true;
  });
  return found ? found.answer : null;
}

function tryDeterministicFromCatalog(catalog, message, options = {}) {
  const text = String(message || "").trim();
  const history = options.history || [];
  if (!text || !catalog) {
    return null;
  }

  const model = catalog.model;
  const facts = catalog.facts || [];

  if (textMatches(catalog.unsupportedSpec?.match, text)) {
    return catalog.unsupportedSpec.reply;
  }
  if (isContactSupportQuery(text)) {
    return buildPortalContactSupportAnswer();
  }
  if (isUnsupportedReplacementQuery(text, history)) {
    return buildUnsupportedReplacementAnswer(model, text, history);
  }
  if (isEquipmentSerialNumberQuery(text)) {
    return resolveSerialNumberAnswer(text, model);
  }
  if (isEmergencySmokeQuery(text) && catalog.safety?.smoke) {
    return catalog.safety.smoke;
  }

  for (const rule of catalog.priority || []) {
    if (!textMatches(rule.match, text)) {
      continue;
    }
    const answer = factAnswer(facts, rule);
    if (answer) {
      return answer;
    }
  }

  const match = facts.find((fact) => textMatches(fact.match || fact.test, text));
  return match ? match.answer : null;
}

function classifyFromCatalog(catalog, message, { history = [], equipmentChatScoped = false } = {}) {
  const text = String(message || "").trim();
  const equipment = catalog.equipment || { id: catalog.id, name: catalog.model };
  const gate = catalog.gate || {};

  if (foreignSdbModels(text, equipment).length) {
    return { action: "FOREIGN_MODEL", reason: "foreign_sdb_model", reply: buildForeignModelReply(equipment) };
  }
  if (isContactSupportQuery(text)) {
    return {
      action: "CONTACT_SUPPORT",
      reason: "portal_contact_support",
      reply: buildPortalContactSupportAnswer(),
    };
  }
  if (textMatches(catalog.unsupportedSpec?.match, text)) {
    return {
      action: "UNSUPPORTED_SPEC",
      reason: "unsupported_parameter",
      reply: catalog.unsupportedSpec.reply,
    };
  }
  if (asRegExp(gate.chatter)?.test(text)) {
    return {
      action: "CHATTER",
      reason: "chatter_only",
      reply: gate.chatterReply,
    };
  }
  if (asRegExp(gate.greeting)?.test(text) || asRegExp(gate.offTopic)?.test(text)) {
    return {
      action: "OFF_TOPIC",
      reason: "off_topic",
      reply: gate.offTopicReply,
    };
  }
  if (isEmergencySmokeQuery(text) || isRegenerationShutdownQuery(text)) {
    return { action: "SAFETY", reason: "safety_topic" };
  }
  void history;
  void equipmentChatScoped;
  return { action: "IN_SCOPE", reason: "equipment_chat_scoped" };
}

function sectionHintsFromCatalog(catalog, message) {
  const q = String(message || "");
  const hints = [];
  for (const row of catalog.sectionHints || []) {
    if (textMatches(row.match, q)) {
      hints.push(...(row.hints || []));
    }
  }
  return [...new Set(hints)];
}

function directContextHintsFromCatalog(catalog, message) {
  const hints = sectionHintsFromCatalog(catalog, message);
  if (!hints.length) {
    return "";
  }
  return `Ищи подтверждение в разделах общего РЭ: ${hints.join(", ")}.`;
}

function buildDirectSystemContentFromCatalog(catalog, systemPrompt, docText) {
  return `${systemPrompt}\n\n${catalog.criticalFacts}\n\nПолный текст руководства (единственный источник для процедур, обслуживания и безопасности):\n\n${docText}`;
}

function extractSafetyDocExcerptFromCatalog(docText, message) {
  const text = String(docText || "").trim();
  if (!text) {
    return "";
  }
  const headings = [
    text.toUpperCase().lastIndexOf("ДЕЙСТВИЯ В ЭКСТРЕМАЛЬНЫХ УСЛОВИЯХ"),
    text.toUpperCase().lastIndexOf("МЕРЫ БЕЗОПАСНОСТИ"),
    text.toUpperCase().lastIndexOf("ЗАПРЕЩАЕТСЯ"),
  ].filter((index) => index >= 0);
  const start = headings.length ? Math.min(...headings) : 0;
  void message;
  return text.slice(start, start + 12000);
}

function buildSafetyDeterministicOrPromptFromCatalog(catalog, message, docText) {
  const answer = tryDeterministicFromCatalog(catalog, message);
  return answer
    ? { mode: "deterministic", answer }
    : {
        mode: "grounded_llm",
        sectionHints: ["section_2_2_1", "section_2_4"],
        docExcerpt: extractSafetyDocExcerptFromCatalog(docText, message),
      };
}

module.exports = {
  asRegExp,
  textMatches,
  tryDeterministicFromCatalog,
  classifyFromCatalog,
  sectionHintsFromCatalog,
  directContextHintsFromCatalog,
  buildDirectSystemContentFromCatalog,
  extractSafetyDocExcerptFromCatalog,
  buildSafetyDeterministicOrPromptFromCatalog,
};
