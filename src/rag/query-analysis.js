const {
  INTENT_TYPES,
  classifyQueryIntent,
  detectFocusParameter,
  detectQueryOperatingModes,
} = require("./query-intent");

const QUERY_TYPES = Object.freeze({
  DETERMINISTIC_PARAMETER: "DETERMINISTIC_PARAMETER",
  PROCEDURAL_QA: "PROCEDURAL_QA",
  TROUBLESHOOTING_QA: "TROUBLESHOOTING_QA",
  REASONING_QA: "REASONING_QA",
  UNKNOWN: "UNKNOWN",
});

const PARAMETER_QUERY_RE =
  /(?:како(?:е|й|ая|ие)|сколько|каков[ао]?|чему\s+равн|укажи|дай)\s+.{0,80}(?:напряжен|частот|ip|степень\s+защиты|сопротивлен|нагрузк|влажност|rh|размер|габарит|масса|вес|температур|давлен|ом\b|кг\b|гц\b|вольт|в\b)/iu;

const PROCEDURE_RE =
  /(?:(?:^|[^\p{L}\p{N}])как(?:[^\p{L}\p{N}]|$)|каким\s+образом|порядок|алгоритм|последовательност|шаги|что\s+делать|перед\s+запуском|подготовить|включить|запустить|настроить|установить|подключить)/iu;

const TROUBLESHOOTING_RE =
  /(?:не\s+работ|не\s+запуска|не\s+включ|не\s+суш|не\s+осуш|не\s+держ|не\s+падает|пищит|сигнал|ошибк|сбой|авари|неисправ|нет\s+связ|ethernet|пропал|горит|мигает)/iu;

const REASONING_RE =
  /(?:почему|зачем|из-за\s+чего|что\s+(?:будет|произойдет)|что\s+случится|если|при\s+|после\s+|во\s+время|влияет|приводит|может\s+ли)/iu;

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function extractSymptoms(query) {
  const s = String(query || "").toLowerCase();
  const symptoms = [];
  const rules = [
    ["beep", /пищит|звуков(?:ой|\s+сигнал)|сигнализац/iu],
    ["ethernet", /ethernet|нет\s+связ|сеть|локальн/iu],
    ["power", /не\s+включ|не\s+запуска|питани|напряжен/iu],
    ["humidity", /влажност|rh|осуш|суш|не\s+падает|не\s+держ/iu],
    ["indicator", /индикатор|индикац|светодиод|мигает|горит/iu],
    ["door", /двер|открыт|закрыт/iu],
  ];
  for (const [name, re] of rules) {
    if (re.test(s)) {
      symptoms.push(name);
    }
  }
  return unique(symptoms);
}

function extractEntities(query) {
  const s = String(query || "");
  const entities = [];
  const rules = [
    ["door", /двер/iu],
    ["fan", /вентилятор/iu],
    ["dryer", /осушител|осушени/iu],
    ["indicator", /индикатор|индикац|светодиод/iu],
    ["ethernet", /ethernet|сеть/iu],
    ["shelf", /полк/iu],
    ["grounding", /заземл/iu],
  ];
  for (const [name, re] of rules) {
    if (re.test(s)) {
      entities.push(name);
    }
  }
  return unique(entities);
}

function extractParameters(query) {
  const focusParameter = detectFocusParameter(query);
  if (focusParameter) {
    return [focusParameter];
  }
  const s = String(query || "");
  if (/\bом\b|сопротивлен/iu.test(s)) {
    return ["grounding_resistance"];
  }
  if (/\bкг\b|нагрузк|масса|вес/iu.test(s)) {
    return ["load"];
  }
  if (/\bгц\b|частот/iu.test(s)) {
    return ["frequency"];
  }
  if (/\bв\b|вольт|напряжен|питани/iu.test(s)) {
    return ["voltage"];
  }
  return [];
}

function routeQueryType(query, baseIntent, extractedParameters, extractedSymptoms) {
  const s = String(query || "").trim();

  if (extractedParameters.length && (baseIntent.intentType === INTENT_TYPES.SINGLE_FIELD_QUERY || PARAMETER_QUERY_RE.test(s))) {
    return { queryType: QUERY_TYPES.DETERMINISTIC_PARAMETER, confidence: 0.95 };
  }

  if (baseIntent.intentType === INTENT_TYPES.TROUBLESHOOTING_QUERY || TROUBLESHOOTING_RE.test(s)) {
    return {
      queryType: QUERY_TYPES.TROUBLESHOOTING_QA,
      confidence: extractedSymptoms.length ? 0.88 : 0.72,
    };
  }

  if (
    baseIntent.intentType === INTENT_TYPES.GETTING_STARTED_QUERY ||
    baseIntent.intentType === INTENT_TYPES.PROCEDURE_QUERY ||
    PROCEDURE_RE.test(s)
  ) {
    return { queryType: QUERY_TYPES.PROCEDURAL_QA, confidence: 0.84 };
  }

  if (REASONING_RE.test(s)) {
    return { queryType: QUERY_TYPES.REASONING_QA, confidence: 0.82 };
  }

  if (!s || s.length < 4) {
    return { queryType: QUERY_TYPES.UNKNOWN, confidence: 0.2 };
  }

  return { queryType: QUERY_TYPES.REASONING_QA, confidence: 0.55 };
}

function intentForRoute(baseIntent, queryType, extractedParameters) {
  const routed = { ...baseIntent };

  if (queryType === QUERY_TYPES.DETERMINISTIC_PARAMETER) {
    routed.intentType = INTENT_TYPES.SINGLE_FIELD_QUERY;
    routed.focusParameter = extractedParameters[0] || routed.focusParameter || null;
    routed.queryScope = "narrow";
    routed.queryRisk = "medium";
    routed.preferredChunkKinds = ["spec", "table"];
  }

  if (queryType === QUERY_TYPES.PROCEDURAL_QA) {
    routed.intentType =
      baseIntent.intentType === INTENT_TYPES.GETTING_STARTED_QUERY
        ? INTENT_TYPES.GETTING_STARTED_QUERY
        : INTENT_TYPES.PROCEDURE_QUERY;
    routed.queryScope = "medium";
    routed.preferredChunkKinds = ["procedure", "general", "table"];
    routed.retrievalMode = routed.retrievalMode || "procedural_focused";
  }

  if (queryType === QUERY_TYPES.TROUBLESHOOTING_QA) {
    routed.intentType = INTENT_TYPES.TROUBLESHOOTING_QUERY;
    routed.queryScope = "medium";
    routed.queryRisk = "high";
    routed.preferredChunkKinds = ["procedure", "general", "table", "safety"];
    routed.retrievalMode = "troubleshooting_focused";
  }

  if (queryType === QUERY_TYPES.REASONING_QA) {
    routed.intentType = INTENT_TYPES.FACT_QUERY;
    routed.queryScope = "broad";
    routed.queryRisk = "medium";
    routed.preferredChunkKinds = ["general", "procedure", "table", "spec"];
    routed.retrievalMode = "reasoning_causal";
  }

  return routed;
}

function analyzeQuery(query, equipment = null, options = {}) {
  const baseIntent =
    options.baseIntent || classifyQueryIntent(query, equipment, { forceSafety: Boolean(options.forceSafety) });
  const extractedParameters = extractParameters(query);
  const extractedSymptoms = extractSymptoms(query);
  const extractedEntities = extractEntities(query);
  const routed = routeQueryType(query, baseIntent, extractedParameters, extractedSymptoms);
  const intent = intentForRoute(baseIntent, routed.queryType, extractedParameters);

  return {
    intentType: intent.intentType,
    queryType: routed.queryType,
    requiresReasoning: routed.queryType === QUERY_TYPES.REASONING_QA,
    requiresProcedure: routed.queryType === QUERY_TYPES.PROCEDURAL_QA,
    requiresTroubleshooting: routed.queryType === QUERY_TYPES.TROUBLESHOOTING_QA,
    requiresDeterministic: routed.queryType === QUERY_TYPES.DETERMINISTIC_PARAMETER,
    confidence: routed.confidence,
    extractedEntities,
    extractedSymptoms,
    extractedParameters,
    queryOperatingModes: detectQueryOperatingModes(query),
    intent,
  };
}

module.exports = {
  QUERY_TYPES,
  analyzeQuery,
  extractEntities,
  extractSymptoms,
  extractParameters,
};
