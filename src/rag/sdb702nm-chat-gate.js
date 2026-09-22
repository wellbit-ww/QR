const { foreignSdbModels, buildForeignModelReply } = require("./sdb-model-scope");
const { isEmergencySmokeQuery, isRegenerationShutdownQuery } = require("./safety-query-scope");
const { buildSafetyDeterministicOrPrompt } = require("./sdb702nm-direct-facts");
const { isUnsupportedSdb702nmSpecQuery, buildUnsupportedSdb702nmSpecReply } = require("./sdb702nm-unsupported-spec");
const { isContactSupportQuery } = require("./sdb1106nm-query-variants");
const { buildPortalContactSupportAnswer } = require("./portal-contact-support-answer");

const EQUIPMENT = { id: "w-700", name: "SDB702NM" };
const CHATTER_RE = /^(?:спасибо|благодар(?:ю|им)?|понятно|ясно|окей|ок|хорошо|отлично|принято|да|нет|ага|угу)\s*[.!?…]*$/iu;
const GREETING_RE = /^(?:привет|здравствуй(?:те)?|добрый\s+(?:день|вечер|утро)|hello|hi)\s*[!?.…]*$/iu;
const OFF_TOPIC_RE =
  /(?:wattsan|w-700|w\s*700|лазерн|токарн|сварк|сварить|bitcoin|биткоин|напиши\s+(?:код|программ|стих|стихотворен)|рецепт|приготов|борщ|политик|крипт|футбол|анекдот|сказк|python|javascript|java\b|typescript|chatgpt|gpt\b|нейросет|искусственн[\p{L}]*\s+интеллект)/iu;

function classifySdb702nmMessage(message, { history = [], equipmentChatScoped = false } = {}) {
  const text = String(message || "").trim();
  if (foreignSdbModels(text, EQUIPMENT).length) {
    return { action: "FOREIGN_MODEL", reason: "foreign_sdb_model", reply: buildForeignModelReply(EQUIPMENT) };
  }
  if (isContactSupportQuery(text)) {
    return {
      action: "CONTACT_SUPPORT",
      reason: "portal_contact_support",
      reply: buildPortalContactSupportAnswer(),
    };
  }
  if (isUnsupportedSdb702nmSpecQuery(text)) {
    return {
      action: "UNSUPPORTED_SPEC",
      reason: "unsupported_parameter",
      reply: buildUnsupportedSdb702nmSpecReply(),
    };
  }
  if (CHATTER_RE.test(text)) {
    return {
      action: "CHATTER",
      reason: "chatter_only",
      reply: "Принято. Задайте вопрос по шкафу SDB702NM: ТТХ, эксплуатации, режимам, неисправностям или безопасности по руководству.",
    };
  }
  if (GREETING_RE.test(text) || OFF_TOPIC_RE.test(text)) {
    return {
      action: "OFF_TOPIC",
      reason: "off_topic",
      reply: "Я отвечаю только по шкафу SDB702NM и его руководству. Задайте вопрос по эксплуатации, ТТХ, режимам, неисправностям или безопасности этого шкафа.",
    };
  }
  if (isEmergencySmokeQuery(text) || isRegenerationShutdownQuery(text)) {
    return { action: "SAFETY", reason: "safety_topic" };
  }
  void history;
  void equipmentChatScoped;
  return { action: "IN_SCOPE", reason: "equipment_chat_scoped" };
}

module.exports = {
  buildSafetyDeterministicOrPrompt,
  classifySdb702nmMessage,
};
