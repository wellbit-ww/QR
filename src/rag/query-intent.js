/**
 * Классификация запроса до retrieval: тип намерения + режимы работы + уточняющие маркеры (азот/датчик).
 */

const INTENT_TYPES = Object.freeze({
  FACT_QUERY: "FACT_QUERY",
  PROCEDURE_QUERY: "PROCEDURE_QUERY",
  COMPARISON_QUERY: "COMPARISON_QUERY",
  SAFETY_QUERY: "SAFETY_QUERY",
  CONFIGURATION_QUERY: "CONFIGURATION_QUERY",
});

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

function classifyIntentType(message, opts = {}) {
  const m = String(message || "");
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

  if (
    /инструкц|подготовк|порядок|алгоритм|последовательност|этап|процесс|пошагов|как\s+включ|как\s+запуст|как\s+настро|что\s+сначала|что\s+потом/i.test(
      m
    )
  ) {
    return INTENT_TYPES.PROCEDURE_QUERY;
  }

  if (/настрой|параметр|установк|конфиг|меню|\bSET\b|\bUI\b|интерфейс/i.test(m)) {
    return INTENT_TYPES.CONFIGURATION_QUERY;
  }

  return INTENT_TYPES.FACT_QUERY;
}

/** Предпочтительные виды чанков под тип запроса (для rerank). */
function preferredChunkKindsForIntent(intentType) {
  switch (intentType) {
    case INTENT_TYPES.SAFETY_QUERY:
      return new Set(["safety", "procedure", "general"]);
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
  // Типичные написания SDB1106
  if (/sdb1106/i.test(name) || /sdb1106/i.test(id)) {
    aliases.add("SDB1106NM");
    aliases.add("SDB1106 NM");
    aliases.add("sdb1106nm");
    aliases.add("SDB1106-NM");
  }
  return aliases;
}

/**
 * @param {string} message
 * @param {object|null} equipment — карточка из каталога
 * @param {{ forceSafety?: boolean }} options
 */
function classifyQueryIntent(message, equipment, options = {}) {
  const intentType = classifyIntentType(message, options);
  let queryOperatingModes = detectQueryOperatingModes(message);
  if (intentType === INTENT_TYPES.FACT_QUERY) {
    queryOperatingModes = [];
  }
  const configHints = detectConfigurationHints(message);

  return {
    intentType,
    queryOperatingModes,
    preferredChunkKinds: [...preferredChunkKindsForIntent(intentType)],
    equipmentAliases: [...equipmentModelAliases(equipment)],
    configHints,
    /** Строка для усиления embedding (без изменения пользовательского текста в логах UI). */
    embeddingAugmentation: buildEmbeddingAugmentation(intentType, queryOperatingModes, equipment),
  };
}

function buildEmbeddingAugmentation(intentType, modes, equipment) {
  const parts = [`intent:${intentType}`];
  if (modes.length) {
    parts.push(`modes:${modes.join("+")}`);
  }
  if (equipment?.name) {
    parts.push(`model:${equipment.name}`);
  }
  return parts.join(" ");
}

module.exports = {
  INTENT_TYPES,
  classifyQueryIntent,
  detectQueryOperatingModes,
  preferredChunkKindsForIntent,
  equipmentModelAliases,
};
