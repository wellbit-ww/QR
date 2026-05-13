/**
 * Классификация запроса до retrieval: intent + режимы + фокус параметра (single-field).
 */

const INTENT_TYPES = Object.freeze({
  FACT_QUERY: "FACT_QUERY",
  PROCEDURE_QUERY: "PROCEDURE_QUERY",
  COMPARISON_QUERY: "COMPARISON_QUERY",
  SAFETY_QUERY: "SAFETY_QUERY",
  CONFIGURATION_QUERY: "CONFIGURATION_QUERY",
  GETTING_STARTED_QUERY: "GETTING_STARTED_QUERY",
  SINGLE_FIELD_QUERY: "SINGLE_FIELD_QUERY",
  TROUBLESHOOTING_QUERY: "TROUBLESHOOTING_QUERY",
  QUICK_FACT_QUERY: "QUICK_FACT_QUERY",
});

const QUERY_SCOPE = Object.freeze({
  NARROW: "narrow",
  MEDIUM: "medium",
  BROAD: "broad",
});

const QUERY_RISK = Object.freeze({
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
});

function inferQueryScope(intentType, focusParameter) {
  if (intentType === INTENT_TYPES.SINGLE_FIELD_QUERY && focusParameter) {
    return QUERY_SCOPE.NARROW;
  }
  if (
    intentType === INTENT_TYPES.QUICK_FACT_QUERY ||
    intentType === INTENT_TYPES.COMPARISON_QUERY ||
    intentType === INTENT_TYPES.CONFIGURATION_QUERY
  ) {
    return QUERY_SCOPE.MEDIUM;
  }
  if (
    intentType === INTENT_TYPES.GETTING_STARTED_QUERY ||
    intentType === INTENT_TYPES.TROUBLESHOOTING_QUERY ||
    intentType === INTENT_TYPES.PROCEDURE_QUERY
  ) {
    return QUERY_SCOPE.MEDIUM;
  }
  return QUERY_SCOPE.BROAD;
}

function inferQueryRisk(intentType) {
  if (intentType === INTENT_TYPES.SAFETY_QUERY || intentType === INTENT_TYPES.TROUBLESHOOTING_QUERY) {
    return QUERY_RISK.HIGH;
  }
  if (
    intentType === INTENT_TYPES.SINGLE_FIELD_QUERY ||
    intentType === INTENT_TYPES.FACT_QUERY ||
    intentType === INTENT_TYPES.QUICK_FACT_QUERY ||
    intentType === INTENT_TYPES.COMPARISON_QUERY
  ) {
    return QUERY_RISK.MEDIUM;
  }
  return QUERY_RISK.LOW;
}

/** Человекочитаемое пояснение фокуса для промпта. */
const FOCUS_PARAMETER_LABELS = Object.freeze({
  humidity: "влажность / RH",
  voltage: "напряжение питания",
  frequency: "частота сети",
  pressure: "давление",
  load: "нагрузка / масса (полки и т.п.)",
  protection: "степень защиты (IP)",
  dimensions: "габариты / масса корпуса",
  grounding: "заземление",
  grounding_resistance: "сопротивление заземляющего контура",
  nitrogen: "азот",
  temperature: "температура",
});

const CLEAR_MODES_INTENTS = new Set([
  INTENT_TYPES.FACT_QUERY,
  INTENT_TYPES.SINGLE_FIELD_QUERY,
  INTENT_TYPES.QUICK_FACT_QUERY,
]);

function detectQueryOperatingModes(text) {
  const modes = new Set();
  const s = String(text || "");

  if (/осушени|режим\s*осуш|осушк|осушител|сушк/i.test(s)) {
    modes.add("drying");
  }
  if (/хранени|режим\s*хран|хранилищ/i.test(s)) {
    modes.add("storage");
  }
  if (/регенерац/i.test(s)) {
    modes.add("regeneration");
  }

  return [...modes];
}

function detectConfigurationHints(text) {
  const s = String(text || "");
  return {
    nitrogenSensor:
      /азот/i.test(s) && /датчик/i.test(s),
    nitrogenNoSensor:
      /азот/i.test(s) && /без\s+датчик/i.test(s),
    uiMenu: /меню|экран|диспле|индикац|ui\b|set\b|кнопк|настрой/i.test(s),
  };
}

function looksLikeExplanationSeeking(m) {
  return /почему|зачем|как\s+работает|принцип\s+действия|опиши\s+подробн|расскажи\s+подробн|объясни/i.test(m);
}

function isSingleFieldQueryPattern(m) {
  const s = String(m || "").trim();
  if (s.length > 170) {
    return false;
  }

  if (/какие\s+условия\s+эксплуатации/i.test(s)) {
    return false;
  }
  if (
    /как(?:ое|ая|ой|ие)\s+(?:допустим(?:ое|ая|ый|ые)\s+|номинальн(?:ое|ая|ый|ые)\s+|максимальн(?:ое|ая|ый|ые)\s+|минимальн(?:ое|ая|ый|ые)\s+)?(?:напряжен|частот|питани|температур|давлен|влажност|нагрузк|диапазон|сопротивлен|объём|объем|масса\b|габарит|условия\s+эксплуатации)/i.test(
      s
    )
  ) {
    return true;
  }
  if (/^\s*сопротивлен(?:ие|ия)\s+заземляющ(?:его|ий)\s+контур[а-яё]*/i.test(s)) {
    return true;
  }
  if (/какой\s+(?:класс\s+защиты|степень\s+защиты|\bIP\b)/i.test(s)) {
    return true;
  }
  if (/\bкакая\s+частот/i.test(s)) {
    return true;
  }
  if (/частот[ауеы]?\s+(?:питающ|сети|сетевого)/i.test(s)) {
    return true;
  }
  if (/напряжени[ея]\s+(?:питающ|сети|сетевого)/i.test(s)) {
    return true;
  }
  if (/сколько\s+(?:весит|вес\b|масса)|каков\s+вес|масса\s+шкафа/i.test(s)) {
    return true;
  }
  if (/какой\s+шаг\s+(?:установк|настройк).*влажност|шаг\s+установк.*влажност/i.test(s)) {
    return true;
  }
  if (/^\s*(?:какое|какая|какой)\s+[а-яёa-z]{3,25}\s*\?\s*$/i.test(s) && s.length < 80) {
    return true;
  }

  return false;
}

function isQuickFactQueryPattern(m, singleFieldMatched) {
  if (singleFieldMatched) {
    return false;
  }
  const s = String(m || "").trim();
  if (s.length > 150) {
    return false;
  }
  if (/почему|как\s+работает/i.test(s)) {
    return false;
  }
  if (/^(?:какой|какая|какое)\s+(?:диапазон|ресурс|объём|объем)\b/i.test(s)) {
    return true;
  }
  if (/^\s*(?:дайте|дай)\s+(?:кратко\s+)?(?:данные|ТТХ|характеристик)/i.test(s)) {
    return true;
  }
  return false;
}

function isGettingStartedQuery(m) {
  return (
    /как\s+начать(?:\s+работу)?|как\s+пользоваться|как\s+работать|как\s+использовать|перв(?:ый|ого)\s+запуск|запуск\s+шкафа|подготовк[аи]\s+к\s+работе|как\s+подготовить(?:\s+шкаф)?\s+к\s+работе|начал[оа]\s+эксплуатации|порядок\s+работы|эксплуатаци[яи]\s+шкафа|как\s+эксплуатировать|как\s+включить(?:\s+шкаф)?|как\s+запустить(?:\s+шкаф)?|с\s+чего\s+начать|инструкция\s+по\s+запуску/i.test(
      m
    )
  );
}

/** Симптомы и формулировки диагностики (приоритетнее FACT / QUICK_FACT при конфликте). Флаг u — корректные границы слов для кириллицы. */
function isTroubleshootingQuery(m) {
  const s = String(m || "").trim();

  if (
    /(?:не\s+выходит|не\s+набирает|не\s+достигает|не\s+держит|не\s+поддерживает|не\s+может\s+выйти|не\s+сушит|не\s+осушает)(?:\s+на\s+(?:режим|влажност|температур))?/iu.test(
      s
    )
  ) {
    return true;
  }
  if (/не\s+выходит\s+на\s+(?:режим|влажност|температур)/iu.test(s)) {
    return true;
  }
  if (
    /слишком\s+высокая\s+влажность|влажность\s+не\s+падает|не\s+падает\s+влажность|влажность\s+не\s+снижается|не\s+снижается\s+влажность|rh\s*не\s*падает|не\s+держит\s+влажность|не\s+набирает\s+влажность/iu.test(
      s
    )
  ) {
    return true;
  }
  if (/пищит|писк\s|звуков(?:ой|\s+сигнал)|сигнализац/iu.test(s)) {
    return true;
  }
  if (
    /\bнеисправ|ошибк[аи]|сбой|поломк|диагностик|\bремонт\b|устранени[ея]\s+(?:неисправност|поломок)|пропал[аи]\s/iu.test(
      s
    )
  ) {
    return true;
  }
  if (/не\s+(?:включается|работает|выходит)/iu.test(s)) {
    return true;
  }
  if (/почему\s+не/iu.test(s)) {
    return true;
  }
  if (
    /\bпочему\b/iu.test(s) &&
    /(?:шкаф|влажност|осуш|режим|температур|питани|датчик|сенсор|панел|дверц|уплотнит)/iu.test(s)
  ) {
    return true;
  }
  if (/\b(?:ошибка|неисправ)\b/iu.test(s)) {
    return true;
  }

  return false;
}

/**
 * Один доминирующий параметр для SINGLE_FIELD / валидации ответа.
 */
function detectFocusParameter(message) {
  const m = String(message || "").toLowerCase();

  if (
    /сопротивлен(?:ие|ия)\s+заземлен|заземляющ(?:его|ий)\s+контур|сопротивлен(?:ие|ия)\s+заземляющего/i.test(
      m
    )
  ) {
    return "grounding_resistance";
  }

  if (/частот|\bгц\b|\bhz\b/i.test(m)) {
    return "frequency";
  }
  if (/питани/i.test(m)) {
    return "voltage";
  }
  if (/напряжен|питающ.*сет|\b220\b.*в\b/i.test(m)) {
    return "voltage";
  }
  if (
    /\bip\b|\bип\b|\bip\s*\d{1,3}\b|ip65|класс\s+защиты|степень\s+защиты/i.test(m)
  ) {
    return "protection";
  }
  if (/шаг.*влажност|влажност.*шаг|установк.*влажност|настройк.*влажност/i.test(m)) {
    return "humidity";
  }
  if (/влажност|rh%|диапазон.*влаж/i.test(m)) {
    return "humidity";
  }
  if (/давлен|кпа|мм\s*рт/i.test(m)) {
    return "pressure";
  }
  if (/температур|градус|°\s*[сc]/i.test(m)) {
    return "temperature";
  }
  if (/нагрузк|полк|кг\b/i.test(m)) {
    return "load";
  }
  if (/габарит|размер|ширин|высот|глубин/i.test(m)) {
    return "dimensions";
  }
  if (/заземлен/i.test(m)) {
    return "grounding";
  }
  if (/азот/i.test(m)) {
    return "nitrogen";
  }

  return null;
}

function detectSymptomDomain(message, intentType) {
  if (intentType !== INTENT_TYPES.TROUBLESHOOTING_QUERY) {
    return null;
  }
  const s = String(message || "");
  if (
    /влажность\s+не\s+снижается|не\s+выходит\s+на\s+влажност|не\s+держит\s+влажност|не\s+набирает\s+влажност|не\s+сушит|высокая\s+влажност|rh\s*не\s*падает|влажность\s+не\s+падает|не\s+падает\s+влажность/iu.test(
      s
    )
  ) {
    return "humidity";
  }
  return null;
}

function classifyIntentType(message, opts = {}) {
  const m = String(message || "").trim();
  const forceSafety = Boolean(opts.forceSafety);

  if (forceSafety) {
    return INTENT_TYPES.SAFETY_QUERY;
  }

  if (
    /что\s+проверить|чек-?лист|безопасн|риск|охран[ае]\s+труда|аварийн|ч\s*п\.|п\s*т\.|дым|огонь|пожар|искрен|гарь|коротк|замыкан|угроз[аы]\s+жизни|эвакуац/i.test(
      m
    )
  ) {
    return INTENT_TYPES.SAFETY_QUERY;
  }

  if (/сравни|разниц|чем\s+отлича|versus|\bvs\b/i.test(m)) {
    return INTENT_TYPES.COMPARISON_QUERY;
  }

  const troubleshooting = isTroubleshootingQuery(m);
  const gettingStarted = !troubleshooting && isGettingStartedQuery(m);

  if (troubleshooting) {
    return INTENT_TYPES.TROUBLESHOOTING_QUERY;
  }

  if (gettingStarted) {
    return INTENT_TYPES.GETTING_STARTED_QUERY;
  }

  const singleFieldOk =
    isSingleFieldQueryPattern(m) &&
    !looksLikeExplanationSeeking(m) &&
    !troubleshooting;
  if (singleFieldOk) {
    return INTENT_TYPES.SINGLE_FIELD_QUERY;
  }

  if (isQuickFactQueryPattern(m, false)) {
    return INTENT_TYPES.QUICK_FACT_QUERY;
  }

  if (
    /настрой|параметр|установк|конфиг|меню|\bSET\b|\bUI\b|интерфейс|индикатор|индикац|светодиод|LCD|\bдиспле|\bэкран/i.test(
      m
    )
  ) {
    return INTENT_TYPES.CONFIGURATION_QUERY;
  }

  if (
    /инструкц|подготовк|порядок|алгоритм|последовательност|этап|процесс|пошагов|как\s+настро|что\s+сначала|что\s+потом/i.test(
      m
    )
  ) {
    return INTENT_TYPES.PROCEDURE_QUERY;
  }

  return INTENT_TYPES.FACT_QUERY;
}

/** Предпочтительные виды чанков под тип запроса (для rerank kindPreferenceScore). */
function preferredChunkKindsForIntent(intentType) {
  switch (intentType) {
    case INTENT_TYPES.SAFETY_QUERY:
      return new Set(["safety", "procedure", "general"]);
    case INTENT_TYPES.GETTING_STARTED_QUERY:
      return new Set(["procedure"]);
    case INTENT_TYPES.SINGLE_FIELD_QUERY:
    case INTENT_TYPES.QUICK_FACT_QUERY:
      return new Set(["spec", "table"]);
    case INTENT_TYPES.TROUBLESHOOTING_QUERY:
      return new Set(["procedure", "general", "table"]);
    case INTENT_TYPES.PROCEDURE_QUERY:
      return new Set(["procedure", "general", "table"]);
    case INTENT_TYPES.COMPARISON_QUERY:
      return new Set(["table", "spec", "general"]);
    case INTENT_TYPES.CONFIGURATION_QUERY:
      return new Set(["general", "procedure", "spec", "table"]);
    case INTENT_TYPES.FACT_QUERY:
    default:
      return new Set(["spec", "table", "general", "procedure", "safety"]);
  }
}

function equipmentModelAliases(equipment) {
  const aliases = new Set();
  if (!equipment) {
    return aliases;
  }
  const name = String(equipment.name || "").trim();
  const id = String(equipment.id || "").trim();
  if (name) {
    aliases.add(name);
    aliases.add(name.replace(/\s+/g, ""));
    aliases.add(name.replace(/\s+/g, "-"));
  }
  if (id) {
    aliases.add(id);
    aliases.add(id.replace(/-/g, ""));
    aliases.add(id.replace(/-/g, " ").toUpperCase());
  }
  if (/sdb1106/i.test(name) || /sdb1106/i.test(id)) {
    aliases.add("SDB1106NM");
    aliases.add("SDB1106 NM");
    aliases.add("sdb1106nm");
    aliases.add("SDB1106-NM");
  }
  return aliases;
}

function detectRetrievalMode(intentType) {
  if (intentType === INTENT_TYPES.GETTING_STARTED_QUERY) {
    return "onboarding_focused";
  }
  return null;
}

/**
 * @param {string} message
 * @param {object|null} equipment — карточка из каталога
 * @param {{ forceSafety?: boolean }} options
 */
function classifyQueryIntent(message, equipment, options = {}) {
  const intentType = classifyIntentType(message, options);
  let queryOperatingModes = detectQueryOperatingModes(message);
  if (CLEAR_MODES_INTENTS.has(intentType)) {
    queryOperatingModes = [];
  }
  const configHints = detectConfigurationHints(message);

  let focusParameter = null;
  if (
    intentType === INTENT_TYPES.SINGLE_FIELD_QUERY ||
    intentType === INTENT_TYPES.QUICK_FACT_QUERY
  ) {
    focusParameter = detectFocusParameter(message);
  }

  const queryScope = inferQueryScope(intentType, focusParameter);
  const queryRisk = inferQueryRisk(intentType);
  const retrievalMode = detectRetrievalMode(intentType);
  const symptomDomain = detectSymptomDomain(message, intentType);

  return {
    intentType,
    queryScope,
    queryRisk,
    retrievalMode,
    symptomDomain,
    queryOperatingModes,
    focusParameter,
    /** Человекочитаемая подпись фокуса для LLM (или null). */
    focusParameterLabel:
      focusParameter && FOCUS_PARAMETER_LABELS[focusParameter]
        ? FOCUS_PARAMETER_LABELS[focusParameter]
        : focusParameter,
    preferredChunkKinds: [...preferredChunkKindsForIntent(intentType)],
    equipmentAliases: [...equipmentModelAliases(equipment)],
    configHints,
    originalQuery: String(message || "").trim(),
    embeddingAugmentation: "",
  };
}

module.exports = {
  INTENT_TYPES,
  QUERY_SCOPE,
  QUERY_RISK,
  FOCUS_PARAMETER_LABELS,
  classifyQueryIntent,
  detectQueryOperatingModes,
  detectFocusParameter,
  inferQueryScope,
  inferQueryRisk,
  detectRetrievalMode,
  detectSymptomDomain,
  preferredChunkKindsForIntent,
  equipmentModelAliases,
};
