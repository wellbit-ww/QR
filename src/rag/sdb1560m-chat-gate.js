const { foreignSdbModels, buildForeignModelReply } = require("./sdb-model-scope");
const { isEmergencySmokeQuery, isRegenerationShutdownQuery } = require("./safety-query-scope");
const { buildSafetyDeterministicOrPrompt } = require("./sdb1560m-direct-facts");
const { isUnsupportedSdb1560mSpecQuery, buildUnsupportedSdb1560mSpecReply } = require("./sdb1560m-unsupported-spec");
const { isContactSupportQuery } = require("./sdb1106nm-query-variants");
const { buildPortalContactSupportAnswer } = require("./portal-contact-support-answer");

const EQUIPMENT = { id: "sdb1560m", name: "SDB1560 M" };
const CHATTER_RE = /^(?:спасибо|благодар(?:ю|им)?|понятно|ясно|окей|ок|хорошо|отлично|принято|да|нет|ага|угу)\s*[.!?…]*$/iu;
const GREETING_RE = /^(?:привет|здравствуй(?:те)?|добрый\s+(?:день|вечер|утро)|hello|hi)\s*[!?.…]*$/iu;
const OFF_TOPIC_RE =
  /(?:wattsan|sdb1560|1560|лазерн|токарн|сварк|сварить|bitcoin|биткоин|напиши\s+(?:код|программ|стих|стихотворен)|рецепт|приготов|борщ|политик|крипт|футбол|анекдот|сказк|python|javascript|java\b|typescript|chatgpt|gpt\b|нейросет|искусственн[\p{L}]*\s+интеллект)/iu;

function classifySdb1560mMessage(message, { history = [], equipmentChatScoped = false } = {}) {
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
  if (isUnsupportedSdb1560mSpecQuery(text)) {
    return {
      action: "UNSUPPORTED_SPEC",
      reason: "unsupported_parameter",
      reply: buildUnsupportedSdb1560mSpecReply(),
    };
  }
  if (CHATTER_RE.test(text)) {
    return {
      action: "CHATTER",
      reason: "chatter_only",
      reply: "Принято. Задайте вопрос по шкафу SDB1560NM: ТТХ, эксплуатации, режимам, неисправностям или безопасности по руководству.",
    };
  }
  if (GREETING_RE.test(text) || OFF_TOPIC_RE.test(text)) {
    return {
      action: "OFF_TOPIC",
      reason: "off_topic",
      reply: "Я отвечаю только по шкафу SDB1560NM и его руководству. Задайте вопрос по эксплуатации, ТТХ, режимам, неисправностям или безопасности этого шкафа.",
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
  classifySdb1560mMessage,
};
