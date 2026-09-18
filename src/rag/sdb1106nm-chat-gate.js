const { detectForeignSdbModelQuery, FOREIGN_MODEL_REPLY } = require("./sdb1106nm-scope");
const {
  isEmergencySmokeQuery,
  isRegenerationShutdownQuery,
  sectionHintsForQuery,
} = require("./safety-query-scope");
const {
  tryDeterministicSdb1106nmAnswer,
  extractSafetyDocExcerpt,
} = require("./sdb1106nm-direct-facts");
const { isContactSupportQuery } = require("./sdb1106nm-query-variants");
const { buildPortalContactSupportAnswer } = require("./portal-contact-support-answer");
const { ROUTES, computeRegexRouteDecision } = require("./router/query-router");

const CHATTER_ONLY_RE =
  /^(?:спасибо|благодар(?:ю|им)?|понятно|ясно|окей|ок|хорошо|отлично|принято|да|нет|ага|угу|расскажи\s+подробнее|подробнее|ещё\s+раз|еще\s+раз)\s*[.!?…]*$/iu;

const CHATTER_REPLY =
  "Принято. Задайте вопрос по шкафу SDB1106NM — параметры, эксплуатация, неисправности или безопасность по руководству.";

const SCOPE_REJECT_REPLY =
  "Я отвечаю только по шкафу SDB1106NM и его руководству по сухому хранению. Задайте вопрос по эксплуатации, ТТХ, режимам, неисправностям или безопасности этого шкафа.";

/** Тематика шкафа / РЭ — широкий whitelist домена сухого хранения. */
const IN_SCOPE_WHITELIST_RE =
  /(?:влажност|%?\s*rh\b|осуш|регенерац|хранен|полк|нагрузк|мощност|потребля|ттх|характеристик|напряжен|питани|азот|n₂|n2|подогрев|esd|заземл|антистат|включ|запуск|подготов|неисправ|не\s+работ|ошибк|сбой|эксплуатац|условия\s+эксплуатац|комплект|поставк|dry\s*storage|программ|sdb1106|шкаф|сух\w*\s+хранен|осушител|дешикатор|уплотнител|двер|индикатор|режим\s+работ|температур|габарит|масса|вес|степень\s+защиты|\bip\d|\bip\b|частот|\bгц\b|ethernet|сеть|табл|пункт|раздел|дым|гар[иью]|безопасност|эвакуац|обслужив|замен|ресурс|осмотр|проверк|настройк|меню|кнопк|кабель|тумблер|рубильник|220|вольт|ом\b|браслет|кожух|осушени|регенерац|влажност|rh\b|2\.\d|1\.1|цвет|ral|покрыт|порошков|освещ|опци|цеолит|поглотител|спирт|растворител|горюч|гранулят|наполнител|паспорт|книжк|ухл|климат|15150|простой\s+режим|коробк|завод|пищит|пищ|жр[её]т|протир|смотров|погруз|разгруз|звук|сигнализац|взрыво|легковоспламен|калибр|колес|колёс|выключател|перепад|стабилиз|конвекц|выдвижн|укорочен|вырез|поражен|электрическ|изделие|пиков|датчик|сенсор|функци|назначен|измер|контрол|индикац|производител|бренд)/iu;

/** Жёсткий blacklist: другое оборудование, общий чат, код, нерелевантные темы. */
const OFF_TOPIC_BLACKLIST_RE =
  /(?:wattsan|w-700|w\s*700|лазерн|токарн|сварк|сварить|bitcoin|биткоин|напиши\s+(?:код|программ|стих|стихотворен)|рецепт|политик|крипт|футбол|анекдот|сказк|что\s+такое\s+(?:bitcoin|биткоин)|станок\s+с\s+чпу|\bчпу\b|python|javascript|java\b|typescript|приготов|борщ|elon|муск|chatgpt|gpt\b|нейросет|искусственн[\p{L}]*\s+интеллект)/iu;

const GREETING_ONLY_RE =
  /^(?:привет|здравствуй(?:те)?|добрый\s+(?:день|вечер|утро)|hello|hi)\s*[!?.…]*$/iu;

/** Короткий уточняющий вопрос без доменных слов — допустим после in-scope истории. */
const FOLLOWUP_ONLY_RE =
  /^(?:а\s+|и\s+)?(?:если|когда|сколько|почему|зачем|как\s+именно|какие|какой|какова|что|расскаж|опиш|перечисл|уточни|подробнее|ещё\s+раз|еще\s+раз|с\s+опци|без\s+опци|да|нет)[\s\S]{0,120}[?.!…]*$/iu;

const SDB1106NM_EQUIPMENT_STUB = { id: "sdb1106-nm", name: "SDB1106NM" };

function combinedGateText(message, history) {
  const q = String(message || "").trim();
  const recentUser = (Array.isArray(history) ? history : [])
    .filter((entry) => entry?.role === "user" && typeof entry.content === "string")
    .slice(-2)
    .map((entry) => entry.content.trim())
    .join(" ");
  return `${recentUser} ${q}`.replace(/\s+/g, " ").trim();
}

function historyHasInScopeUserMessage(history) {
  const users = (Array.isArray(history) ? history : [])
    .filter((entry) => entry?.role === "user" && typeof entry.content === "string")
    .slice(-2);
  return users.some((entry) => matchesInScopeWhitelist(entry.content));
}

function matchesInScopeWhitelist(text) {
  return IN_SCOPE_WHITELIST_RE.test(String(text || ""));
}

function isOffTopic(message, history, { equipmentChatScoped = false } = {}) {
  const q = String(message || "").trim();

  // Blacklist / приветствие на текущем сообщении — всегда стоп (история не отменяет).
  if (OFF_TOPIC_BLACKLIST_RE.test(q) || GREETING_ONLY_RE.test(q)) {
    return true;
  }

  // В чате, уже привязанном к SDB1106NM, не отсекаем бытовые формулировки без слова «шкаф».
  if (equipmentChatScoped && q.length >= 6) {
    return false;
  }

  // Текущее сообщение явно про шкаф / РЭ.
  if (matchesInScopeWhitelist(q)) {
    return false;
  }

  // Короткий follow-up после in-scope вопроса в истории.
  if (
    q.length <= 120 &&
    FOLLOWUP_ONLY_RE.test(q) &&
    historyHasInScopeUserMessage(history) &&
    matchesInScopeWhitelist(combinedGateText(message, history))
  ) {
    return false;
  }

  // Default deny: нет доменных слов в текущем вопросе — оффтоп.
  return true;
}

function isSafetyTopic(message) {
  const q = String(message || "").trim();
  if (isEmergencySmokeQuery(q) || isRegenerationShutdownQuery(q)) {
    return true;
  }
  const decision = computeRegexRouteDecision({
    query: q,
    history: [],
    equipmentId: SDB1106NM_EQUIPMENT_STUB.id,
    equipment: SDB1106NM_EQUIPMENT_STUB,
  });
  return decision.route === ROUTES.SAFETY_QA;
}

/**
 * @param {string} message
 * @param {{ history?: Array<{ role: string, content: string }> }} [options]
 * @returns {{ action: string, reason: string, reply?: string }}
 */
function classifySdb1106nmMessage(message, { history = [], equipmentChatScoped = false } = {}) {
  const q = String(message || "").trim();

  if (detectForeignSdbModelQuery(q)) {
    return { action: "FOREIGN_MODEL", reason: "foreign_sdb_model", reply: FOREIGN_MODEL_REPLY };
  }

  if (isContactSupportQuery(q)) {
    return {
      action: "CONTACT_SUPPORT",
      reason: "portal_contact_support",
      reply: buildPortalContactSupportAnswer(),
    };
  }

  if (CHATTER_ONLY_RE.test(q)) {
    return { action: "CHATTER", reason: "chatter_only", reply: CHATTER_REPLY };
  }

  if (isOffTopic(q, history, { equipmentChatScoped })) {
    return { action: "OFF_TOPIC", reason: "off_topic_blacklist", reply: SCOPE_REJECT_REPLY };
  }

  if (isSafetyTopic(q)) {
    return { action: "SAFETY", reason: "safety_topic" };
  }

  return { action: "IN_SCOPE", reason: "in_scope" };
}

/**
 * Safety fast-path: детерминированный ответ или контекст для grounded LLM.
 * @returns {{ mode: "deterministic", answer: string } | { mode: "grounded_llm", sectionHints: string[], docExcerpt: string }}
 */
function buildSafetyDeterministicOrPrompt(message, docText = "") {
  const deterministic = tryDeterministicSdb1106nmAnswer(message);
  if (deterministic) {
    return { mode: "deterministic", answer: deterministic };
  }
  return {
    mode: "grounded_llm",
    sectionHints: sectionHintsForQuery(message),
    docExcerpt: extractSafetyDocExcerpt(docText, message),
  };
}

module.exports = {
  CHATTER_REPLY,
  SCOPE_REJECT_REPLY,
  classifySdb1106nmMessage,
  buildSafetyDeterministicOrPrompt,
};
