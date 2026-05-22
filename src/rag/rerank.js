/**
 * Детерминированный rerank: взвешенная формула + жёсткие штрафы/бонусы + объяснимые компоненты.
 */

const { chunkKindToBlockType, BLOCK_TYPES } = require("./chunking");
const { chunkIsPossibleFaultsList, isHumidityNotDroppingQuery } = require("./troubleshooting-scope");

function normalizeForMatch(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeQueryKeywords(query) {
  const q = normalizeForMatch(query);
  const parts = q.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 3);
  return [...new Set(parts)];
}

function hasGroundingContourSignals(text) {
  return /(?:не\s+более\s*)?4\s*ом|заземляющ(?:его|ий)\s+контур|сопротивлен(?:ие|ия)\s+заземлен/i.test(
    String(text || "")
  );
}

function hasIpClassSignal(text) {
  return /\bIP\s?\d{2}\b/i.test(String(text || ""));
}

function hasFocusSignal(text, focusParameter) {
  const s = String(text || "");
  switch (focusParameter) {
    case "grounding_resistance":
      return hasGroundingContourSignals(s);
    case "protection":
      return hasIpClassSignal(s) || /класс\s+защиты|степень\s+защиты/i.test(s);
    case "frequency":
      return /гц|hz|частот/i.test(s);
    case "voltage":
      return /(?:в|вольт|напряжен|питани)/iu.test(s);
    case "humidity":
      return /влажност|rh%/i.test(s);
    default:
      return false;
  }
}

/** Ключевые совпадения с текстом чанка [0..1] (если retrieval не проставил keywordScore). */
function computeKeywordOverlapScore(query, chunk) {
  const tokens = tokenizeQueryKeywords(query);
  if (!tokens.length) {
    return 0;
  }
  const hay = normalizeForMatch(`${chunk.content || ""} ${chunk.section || ""}`);
  let hits = 0;
  for (const t of tokens) {
    if (hay.includes(t)) {
      hits += 1;
    }
  }
  return hits / tokens.length;
}

function chunkModes(chunk) {
  const m = chunk?.metadata?.operatingModes;
  return Array.isArray(m) ? m : [];
}

function resolveBlockType(chunk) {
  const meta = chunk?.metadata || {};
  if (meta.blockType && typeof meta.blockType === "string") {
    return meta.blockType;
  }
  return chunkKindToBlockType(meta.chunkKind || "general");
}

function parameterAlignmentScore(chunk, intent) {
  const fp = intent?.focusParameter;
  const meta = chunk.metadata || {};
  const pts = Array.isArray(meta.parameterTypes) ? meta.parameterTypes : [];
  const prim = meta.primaryParameter || null;
  const sec = meta.secondaryParameter || null;

  if (!fp || intent?.intentType !== "SINGLE_FIELD_QUERY") {
    if (!pts.length && !prim) {
      return 0.55;
    }
    return 0.65;
  }

  if (pts.includes(fp) || prim === fp) {
    if (pts.length <= 1 || (prim === fp && !sec)) {
      return 1;
    }
    return 0.72;
  }

  if (!pts.length && !prim) {
    return 0.45;
  }

  return 0.08;
}

function blockTypeAlignmentScore(intentType, blockType) {
  switch (intentType) {
    case "GETTING_STARTED_QUERY":
      if (blockType === BLOCK_TYPES.PROCEDURE_BLOCK) {
        return 1;
      }
      if (blockType === BLOCK_TYPES.GENERAL_BLOCK) {
        return 0.6;
      }
      if (blockType === BLOCK_TYPES.SPEC_BLOCK || blockType === BLOCK_TYPES.TABLE_BLOCK) {
        return 0.48;
      }
      return 0.38;
    case "TROUBLESHOOTING_QUERY":
      if (blockType === BLOCK_TYPES.WARNING_BLOCK || blockType === BLOCK_TYPES.PROCEDURE_BLOCK) {
        return 1;
      }
      if (blockType === BLOCK_TYPES.TABLE_BLOCK) {
        return 0.6;
      }
      if (blockType === BLOCK_TYPES.SPEC_BLOCK) {
        return 0.32;
      }
      return 0.5;
    case "SINGLE_FIELD_QUERY":
    case "QUICK_FACT_QUERY":
      if (blockType === BLOCK_TYPES.TABLE_BLOCK || blockType === BLOCK_TYPES.SPEC_BLOCK) {
        return 1;
      }
      return 0.25;
    case "COMPARISON_QUERY":
      if (blockType === BLOCK_TYPES.TABLE_BLOCK || blockType === BLOCK_TYPES.SPEC_BLOCK) {
        return 1;
      }
      return 0.5;
    default:
      return 0.7;
  }
}

function wrongBlockTypePenalty(intentType, blockType) {
  if (intentType === "GETTING_STARTED_QUERY") {
    if (
      blockType === BLOCK_TYPES.WARNING_BLOCK
    ) {
      return -0.18;
    }
  }
  if (
    (intentType === "SINGLE_FIELD_QUERY" || intentType === "QUICK_FACT_QUERY") &&
    blockType === BLOCK_TYPES.WARNING_BLOCK
  ) {
    return -0.3;
  }
  return 0;
}

function wrongParameterPenalty(chunk, intent) {
  if (intent?.intentType !== "SINGLE_FIELD_QUERY" || !intent.focusParameter) {
    return 0;
  }
  const fp = intent.focusParameter;
  const meta = chunk.metadata || {};
  const pts = Array.isArray(meta.parameterTypes) ? meta.parameterTypes : [];
  const prim = meta.primaryParameter;

  if (intent.focusParameter === "grounding_resistance" && pts.includes("antistatic_resistor")) {
    return hasGroundingContourSignals(chunk.content) ? -0.45 : -0.62;
  }

  if (pts.length && !pts.includes(fp)) {
    if (prim && prim !== fp) {
      return -0.4;
    }
    return -0.25;
  }

  return 0;
}

function mixedTroubleshootingPenalty(chunk, intent) {
  if (intent?.intentType !== "SINGLE_FIELD_QUERY") {
    return 0;
  }
  const st = chunk?.metadata?.secondaryTopic;
  if (st === "troubleshooting" || st === "repair") {
    return -0.5;
  }
  return 0;
}

function gettingStartedNoisePenalty(chunk, intentType) {
  if (intentType !== "GETTING_STARTED_QUERY") {
    return 0;
  }
  const st = chunk?.metadata?.secondaryTopic;
  if (!["troubleshooting", "repair", "emergency", "maintenance"].includes(st)) {
    return 0;
  }
  return -0.14;
}

function mixedModesPenalty(chunk, intent) {
  const intentType = intent?.intentType || "FACT_QUERY";
  const queryModes = intent?.queryOperatingModes || [];
  if (
    intentType === "FACT_QUERY" ||
    intentType === "SINGLE_FIELD_QUERY" ||
    intentType === "QUICK_FACT_QUERY" ||
    !queryModes.length
  ) {
    return 0;
  }
  const cm = chunkModes(chunk);
  if (!cm.length || cm.includes("general")) {
    return 0;
  }
  let hits = 0;
  for (const q of queryModes) {
    if (cm.includes(q)) {
      hits += 1;
    }
  }
  if (hits === 0) {
    return -0.2;
  }
  return 0;
}

function exactParameterBoost(chunk, intent) {
  if (!intent?.focusParameter) {
    return 0;
  }
  const fp = intent.focusParameter;
  const meta = chunk.metadata || {};
  if (meta.primaryParameter === fp && !meta.secondaryParameter) {
    return 0.4;
  }
  const pts = meta.parameterTypes || [];
  if (pts.length === 1 && pts[0] === fp) {
    return 0.4;
  }
  return 0;
}

function tableSpecBoost(chunk, intentType, intent) {
  const bt = resolveBlockType(chunk);
  const fp = intent?.focusParameter;
  const pts = Array.isArray(chunk?.metadata?.parameterTypes) ? chunk.metadata.parameterTypes : [];
  const hasFocus =
    !fp || pts.includes(fp) || chunk?.metadata?.primaryParameter === fp || hasFocusSignal(chunk.content, fp);
  if (
    (intentType === "FACT_QUERY" ||
      intentType === "SINGLE_FIELD_QUERY" ||
      intentType === "QUICK_FACT_QUERY" ||
      intentType === "COMPARISON_QUERY") &&
    (bt === BLOCK_TYPES.TABLE_BLOCK || bt === BLOCK_TYPES.SPEC_BLOCK) &&
    hasFocus
  ) {
    return 0.3;
  }
  return 0;
}

function missingFocusSignalPenalty(chunk, intent) {
  if (intent?.intentType !== "SINGLE_FIELD_QUERY" || !intent.focusParameter) {
    return 0;
  }
  const meta = chunk.metadata || {};
  const pts = Array.isArray(meta.parameterTypes) ? meta.parameterTypes : [];
  if (pts.includes(intent.focusParameter) || meta.primaryParameter === intent.focusParameter) {
    return 0;
  }
  if (hasFocusSignal(`${chunk.content || ""} ${chunk.section || ""}`, intent.focusParameter)) {
    return 0;
  }
  return -0.26;
}

function groundingContourBoost(chunk, intent) {
  if (!intent || intent.focusParameter !== "grounding_resistance") {
    return 0;
  }
  const text = `${chunk.content || ""} ${chunk.section || ""}`;
  if (hasGroundingContourSignals(text)) {
    return 0.45;
  }
  return 0;
}

function ipSignalBoost(chunk, intent, queryText) {
  const isIpFocused =
    intent?.focusParameter === "protection" || /\bip\b|\bип\b|класс\s+защиты|степень\s+защиты/i.test(queryText);
  if (!isIpFocused) {
    return 0;
  }
  const text = `${chunk.content || ""} ${chunk.section || ""}`;
  if (hasIpClassSignal(text)) {
    return 0.28;
  }
  return 0;
}

function gettingStartedKeywordBoost(chunk, intentType, queryText) {
  if (intentType !== "GETTING_STARTED_QUERY") {
    return 0;
  }
  const trigger = /startup|first\s+launch|включени|подготовк|подключени|тумблер|питани|перв(?:ый|ого)\s+запуск|запуск/i;
  if (!trigger.test(queryText)) {
    return 0;
  }
  const hay = normalizeForMatch(`${chunk.content || ""} ${chunk.section || ""}`);
  const hints = [
    "включ",
    "подготов",
    "подключ",
    "питани",
    "тумблер",
    "запуск",
    "индикатор",
    "ethernet",
    "вилка",
  ];
  let hits = 0;
  for (const hint of hints) {
    if (hay.includes(hint)) {
      hits += 1;
    }
  }
  return Math.min(0.05 * hits, 0.2);
}

function gettingStartedNoStepPenalty(chunk, intentType) {
  if (intentType !== "GETTING_STARTED_QUERY") {
    return 0;
  }
  const hay = normalizeForMatch(`${chunk.content || ""} ${chunk.section || ""}`);
  if (/включ|подключ|тумблер|кабель|питани|индикатор|вилка|запуск|подготов/.test(hay)) {
    return 0;
  }
  const bt = resolveBlockType(chunk);
  if (bt === BLOCK_TYPES.SPEC_BLOCK || bt === BLOCK_TYPES.TABLE_BLOCK || bt === BLOCK_TYPES.GENERAL_BLOCK) {
    return -0.2;
  }
  return 0;
}

function onboardingFocusedBoost(chunk, intent, queryText) {
  if (intent?.retrievalMode !== "onboarding_focused" || intent?.intentType !== "GETTING_STARTED_QUERY") {
    return 0;
  }
  const hay = normalizeForMatch(`${chunk.content || ""} ${chunk.section || ""}`);
  const q = normalizeForMatch(queryText);
  const onboardingWords = [
    "onboarding",
    "startup",
    "first launch",
    "power on",
    "preparation",
    "setup",
    "включ",
    "подготов",
    "подключ",
    "тумблер",
    "питани",
    "запуск",
  ];
  let hits = 0;
  for (const w of onboardingWords) {
    if (hay.includes(w)) {
      hits += 1;
    }
  }
  if (/как\s+включ|как\s+подготов|перв(?:ый|ого)\s+запуск|с\s+чего\s+начать/.test(q)) {
    hits += 1;
  }
  return Math.min(0.04 * hits, 0.24);
}

function onboardingNoisePenalty(chunk, intent) {
  if (intent?.retrievalMode !== "onboarding_focused" || intent?.intentType !== "GETTING_STARTED_QUERY") {
    return 0;
  }
  const bt = resolveBlockType(chunk);
  const hay = normalizeForMatch(`${chunk.content || ""} ${chunk.section || ""}`);
  let penalty = 0;
  if (bt === BLOCK_TYPES.GENERAL_BLOCK || bt === BLOCK_TYPES.SPEC_BLOCK) {
    penalty -= 0.07;
  }
  if (
    /услови[яе]\s+хранен|хранени|гаранти|транспорт|коррози|климатическ|окружающ|влажност[ьи]\s+окружающ|нагрузк[аи]\s+полк|мощност|диапазон\s+влажност/.test(
      hay
    )
  ) {
    penalty -= 0.23;
  }
  if ((chunk.content || "").length > 4500) {
    penalty -= 0.1;
  }
  return penalty;
}

function troubleshootingKeywordBoost(chunk, intentType, queryText) {
  if (intentType !== "TROUBLESHOOTING_QUERY") {
    return 0;
  }
  const hay = normalizeForMatch(`${chunk.content || ""} ${chunk.section || ""}`);
  const q = normalizeForMatch(queryText);
  const tokens = ["неисправ", "провер", "не работает", "не выходит", "не снижается", "уплотнит", "осушител", "ресурс"];
  let hits = 0;
  for (const t of tokens) {
    if (hay.includes(t)) {
      hits += 1;
    }
  }
  if (/не\s+выходит|не\s+держит|не\s+набирает|не\s+снижается/.test(q)) {
    hits += 1;
  }
  return Math.min(0.05 * hits, 0.24);
}

function troubleshootingSpecHumidityPenalty(chunk, intentType, queryText) {
  if (intentType !== "TROUBLESHOOTING_QUERY") {
    return 0;
  }
  if (!/не\s+выходит|не\s+держит|не\s+набирает|не\s+снижается/.test(normalizeForMatch(queryText))) {
    return 0;
  }
  const blockType = resolveBlockType(chunk);
  const meta = chunk.metadata || {};
  const pts = Array.isArray(meta.parameterTypes) ? meta.parameterTypes : [];
  if (blockType === BLOCK_TYPES.SPEC_BLOCK && pts.length === 1 && pts[0] === "humidity") {
    return -0.24;
  }
  return 0;
}

function possibleFaultsListBoost(chunk, intent, queryText) {
  if (intent?.intentType !== "TROUBLESHOOTING_QUERY") {
    return 0;
  }
  let boost = 0;
  if (chunkIsPossibleFaultsList(chunk)) {
    boost += 0.34;
  }
  const hay = normalizeForMatch(`${chunk.content || ""} ${chunk.section || ""}`);
  if (/перечень\s+возможных|типов(?:ые|ых)\s+неисправ|таблиц[аы]\s*3\.2/.test(hay)) {
    boost += 0.2;
  }
  if (isHumidityNotDroppingQuery(queryText) && /2\.2\.2\.2|уплотнител|плотность.{0,30}закрыт|2\.2\.2\.3/.test(hay)) {
    boost += 0.22;
  }
  if (isHumidityNotDroppingQuery(queryText) && /2\.2\.2\.1|кожух|осушител|механическ.{0,20}поврежден/.test(hay)) {
    boost += 0.18;
  }
  return Math.min(boost, 0.55);
}

function humiditySymptomBoost(chunk, intent) {
  if (intent?.intentType !== "TROUBLESHOOTING_QUERY" || intent?.symptomDomain !== "humidity") {
    return 0;
  }
  const hay = normalizeForMatch(`${chunk.content || ""} ${chunk.section || ""}`);
  const tokens = [
    "dehumidifier",
    "drying",
    "уплотнит",
    "осушител",
    "влажност",
    "rh",
    "регенерац",
    "desiccant",
    "замк",
    "кожух",
  ];
  let hits = 0;
  for (const t of tokens) {
    if (hay.includes(t)) {
      hits += 1;
    }
  }
  return Math.min(0.06 * hits, 0.36);
}

function humidityPowerPenalty(chunk, intent) {
  if (intent?.intentType !== "TROUBLESHOOTING_QUERY" || intent?.symptomDomain !== "humidity") {
    return 0;
  }
  const hay = normalizeForMatch(`${chunk.content || ""} ${chunk.section || ""}`);
  if (/предохран|кабель|no power|не\s+подается\s+питание|питани[ея]|напряжен|fuse|power/.test(hay)) {
    return -0.35;
  }
  return 0;
}

function oversizedChunkPenalty(chunk, intent) {
  const scope = intent?.queryScope;
  if (scope !== "narrow" && scope !== "medium") {
    return 0;
  }
  const precomputed = Number(chunk?.oversizedPenaltyScore);
  if (Number.isFinite(precomputed) && precomputed > 0) {
    return -precomputed;
  }
  return 0;
}

function nitrogenConsistencyScore(chunk, hints) {
  if (!hints) {
    return 0;
  }
  const text = String(chunk.content || "");
  const hasSensorPhrase = /азот.*датчик|датчик.*азот/i.test(text);
  const hasNoSensorPhrase = /азот.*без\s+датчик|без\s+датчик.*азот/i.test(text);

  let s = 0;
  if (hints.nitrogenSensor && hasSensorPhrase) {
    s += 0.06;
  }
  if (hints.nitrogenNoSensor && hasNoSensorPhrase) {
    s += 0.06;
  }
  if (hints.nitrogenSensor && hasNoSensorPhrase && !hasSensorPhrase) {
    s -= 0.07;
  }
  if (hints.nitrogenNoSensor && hasSensorPhrase && !hasNoSensorPhrase) {
    s -= 0.07;
  }
  return s;
}

function desiccantMaterialQueryBoost(chunk, queryText) {
  const q = normalizeForMatch(queryText);
  const hay = normalizeForMatch(`${chunk.content || ""} ${chunk.section || ""}`);
  const asksMaterial =
    /абсорбент|адсорбент|химическ(?:ое|ий)\s+веществ|сорбент|наполнител|поглощен|влаг.*из\s+воздух|карман.*осушител|осушител.*карман/.test(q);
  if (!asksMaterial) {
    return 0;
  }
  const docSignals =
    /цеолит|силикагел|молекулярн(?:ое|ого)\s+сито|adsorb|zeolite|адсорб|осушител|поглощ.*влаг|влагу\s+из\s+воздух/.test(hay);
  return docSignals ? 0.12 : 0;
}

function modelAliasBoost(chunk, aliases, intentType) {
  if (
    intentType === "FACT_QUERY" ||
    intentType === "SINGLE_FIELD_QUERY" ||
    intentType === "QUICK_FACT_QUERY"
  ) {
    return 0;
  }
  if (!aliases.length) {
    return 0;
  }
  const hay = normalizeForMatch(`${chunk.content || ""} ${chunk.section || ""}`);
  let bonus = 0;
  for (const a of aliases) {
    const t = normalizeForMatch(a);
    if (t.length >= 4 && hay.includes(t)) {
      bonus += 0.05;
    }
  }
  return Math.min(bonus, 0.1);
}

function secondaryParameterDominancePenalty(chunk, intent) {
  if (intent?.intentType !== "SINGLE_FIELD_QUERY" || !intent.focusParameter) {
    return 0;
  }
  const meta = chunk.metadata || {};
  if (
    meta.secondaryParameter &&
    meta.primaryParameter &&
    meta.primaryParameter !== intent.focusParameter &&
    meta.secondaryParameter !== intent.focusParameter
  ) {
    return -0.15;
  }
  if (
    meta.secondaryParameter &&
    meta.primaryParameter === intent.focusParameter &&
    meta.secondaryParameter !== intent.focusParameter
  ) {
    return -0.08;
  }
  return 0;
}

/**
 * @param {object[]} chunks — поле score = similarity [0..1]
 * @param {object} intent — classifyQueryIntent
 * @param {{ query?: string }} [opts]
 */
function rerankChunks(chunks, intent, opts = {}) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return chunks;
  }

  const intentType = intent?.intentType || "FACT_QUERY";
  const queryText = String(opts.query || intent?.originalQuery || "");
  const aliases = intent?.equipmentAliases || [];
  const hints = intent?.configHints || {};

  const scored = chunks.map((chunk) => {
    const vectorScore = Math.max(0, Math.min(1, Number(chunk.score) || 0));
    const keywordScore =
      typeof chunk.keywordScore === "number"
        ? Math.max(0, Math.min(1, chunk.keywordScore))
        : computeKeywordOverlapScore(queryText, chunk);

    const parameterMatchScore = parameterAlignmentScore(chunk, intent);
    const blockType = resolveBlockType(chunk);
    const blockTypeScore = blockTypeAlignmentScore(intentType, blockType);

    let composed =
      vectorScore * 0.5 +
      keywordScore * 0.2 +
      parameterMatchScore * 0.25 +
      blockTypeScore * 0.05;

    const penalties = [];
    const boosts = [];

    const pushAdj = (label, v) => {
      if (!v) {
        return;
      }
      if (v > 0) {
        boosts.push({ label, value: v });
      } else {
        penalties.push({ label, value: v });
      }
      composed += v;
    };

    pushAdj("wrong_block_type", wrongBlockTypePenalty(intentType, blockType));
    pushAdj("wrong_parameter", wrongParameterPenalty(chunk, intent));
    pushAdj("mixed_troubleshooting_single_field", mixedTroubleshootingPenalty(chunk, intent));
    pushAdj("mixed_modes", mixedModesPenalty(chunk, intent));
    pushAdj("getting_started_noise_topic", gettingStartedNoisePenalty(chunk, intentType));
    pushAdj("secondary_parameter_noise", secondaryParameterDominancePenalty(chunk, intent));
    pushAdj("exact_parameter_match", exactParameterBoost(chunk, intent));
    pushAdj("table_spec_match", tableSpecBoost(chunk, intentType, intent));
    pushAdj("missing_focus_signal", missingFocusSignalPenalty(chunk, intent));
    pushAdj("grounding_contour_signal", groundingContourBoost(chunk, intent));
    pushAdj("ip_signal_match", ipSignalBoost(chunk, intent, queryText));
    pushAdj("getting_started_keywords", gettingStartedKeywordBoost(chunk, intentType, queryText));
    pushAdj("getting_started_no_step", gettingStartedNoStepPenalty(chunk, intentType));
    pushAdj("onboarding_focused_boost", onboardingFocusedBoost(chunk, intent, queryText));
    pushAdj("onboarding_noise", onboardingNoisePenalty(chunk, intent));
    pushAdj("troubleshooting_keywords", troubleshootingKeywordBoost(chunk, intentType, queryText));
    pushAdj("possible_faults_list", possibleFaultsListBoost(chunk, intent, queryText));
    pushAdj(
      "troubleshooting_humidity_spec_only",
      troubleshootingSpecHumidityPenalty(chunk, intentType, queryText)
    );
    pushAdj("troubleshooting_humidity_boost", humiditySymptomBoost(chunk, intent));
    pushAdj("troubleshooting_humidity_power_penalty", humidityPowerPenalty(chunk, intent));
    pushAdj("oversized_chunk_penalty", oversizedChunkPenalty(chunk, intent));
    pushAdj("nitrogen_consistency", nitrogenConsistencyScore(chunk, hints));
    pushAdj("model_alias", modelAliasBoost(chunk, aliases, intentType));
    pushAdj("desiccant_material_query", desiccantMaterialQueryBoost(chunk, queryText));

    const rerankScore = Math.max(0, Math.min(1, composed));

    return {
      ...chunk,
      vectorScore,
      keywordScore,
      rerankScore,
      rerankComponents: {
        vectorScore,
        keywordScore,
        parameterMatchScore,
        blockTypeScore,
        blockType,
        composedBeforeClamp:
          vectorScore * 0.5 +
          keywordScore * 0.2 +
          parameterMatchScore * 0.25 +
          blockTypeScore * 0.05,
        penalties,
        boosts,
        rerankScore,
      },
    };
  });

  scored.sort((a, b) => b.rerankScore - a.rerankScore);
  return scored;
}

module.exports = {
  rerankChunks,
  computeKeywordOverlapScore,
  BLOCK_TYPES,
};
