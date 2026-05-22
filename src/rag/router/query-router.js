const {
  classifyQueryIntent,
  detectFocusParameter,
  isSpatialPhysicalControlsQuery,
} = require("../query-intent");
const {
  detectSymptoms,
  classifyTroubleshootingDomain,
} = require("../symptoms/symptom-registry");
const { resolveParameterFromQuery } = require("../parameters/parameter-service");
const { getRagConfig } = require("../config");
const { classifyRouteWithLlm } = require("./llm-route-classifier");

const ROUTES = Object.freeze({
  DETERMINISTIC_PARAMETER: "DETERMINISTIC_PARAMETER",
  PROCEDURAL_QA: "PROCEDURAL_QA",
  TROUBLESHOOTING_QA: "TROUBLESHOOTING_QA",
  REASONING_QA: "REASONING_QA",
  SAFETY_QA: "SAFETY_QA",
  UNKNOWN: "UNKNOWN",
});

const PARAMETER_RE =
  /(?:напряжен|частот|ip|степень\s+защиты|сопротивлен|нагрузк|влажност|rh|температур|ethernet|сеть|шкафов|разъем|разъём|размер|габарит|масса|вес|ом\b|гц\b|вольт|в\b)/iu;
const PARAMETER_QUESTION_RE =
  /(?:како(?:е|й|ая|ие)|сколько|каков[ао]?|чему\s+равн|укажи|дай)\s+.{0,100}(?:напряжен|частот|ip|степень\s+защиты|сопротивлен|нагрузк|влажност|rh|температур|ethernet|сеть|шкафов|разъем|разъём|размер|габарит|масса|вес|ом\b|гц\b|вольт|в\b)/iu;
const PROCEDURAL_RE =
  /(?:как\s+включ|как\s+запуст|подготов|порядок|алгоритм|последовательност|перед\s+запуском|что\s+делать)/iu;
const TROUBLESHOOTING_RE =
  /(?:не\s+работ|не\s+запуска|не\s+включ|не\s+осуш|не\s+выходит|не\s+достигает|не\s+держ|нет\s+связ|пропада(?:ет|ть)|ошибк|сбой|неисправ|пищит|сигнал|мигает|горит)/iu;
const REASONING_RE =
  /(?:почему|что\s+произойдет|что\s+будет|если|при|после|вследствие|приводит)/iu;
const SAFETY_RE =
  /(?:авар|дым|огонь|пожар|эваку|угроз|коротк|замыкан|чп|тб|безопасност|задымлен|вспышк)/iu;
const EMERGENCY_SMOKE_RE = /дым|задымлен|вспышк|искр[аы]\s+в\s+шкаф|появил[а-яё]*\s+дым/i;
const REGENERATION_SHUTDOWN_RE =
  /(?:выключ|отключ|обесточ|снять\s+питан|выруб|отключить\s+питан|можно\s+ли\s+выключ)/iu;

const {
  isEmergencySmokeQuery,
  isRegenerationShutdownQuery,
  sectionHintsForQuery,
} = require("../safety-query-scope");
const { troubleshootingSectionHintsForQuery } = require("../troubleshooting-scope");
const { isMaintenanceQuery, maintenanceSectionHintsForQuery } = require("../maintenance-scope");
const { resolveNormalIndicatorMode } = require("../indicator-scope");

function computeRegexRouteDecision({ query, history, equipmentId, equipment }) {
  void history;
  void equipmentId;
  const q = String(query || "").trim();
  const baseIntent = classifyQueryIntent(q, equipment, { forceSafety: false });
  const focusParameter = detectFocusParameter(q);
  const symptoms = detectSymptoms(q);
  const symptom = classifyTroubleshootingDomain(symptoms);
  const parameterResolved = resolveParameterFromQuery(q, focusParameter);

  const explicitSafety = SAFETY_RE.test(q) || isEmergencySmokeQuery(q);
  const emergencySmoke = isEmergencySmokeQuery(q);
  const regenerationShutdown = isRegenerationShutdownQuery(q);
  const reasoningLike = REASONING_RE.test(q) && !regenerationShutdown;
  const symptomTroubleshootingLike =
    symptoms.length > 0 &&
    /почему|причин|провер|пропада|не\s+|нет\s+/iu.test(q) &&
    !emergencySmoke &&
    !regenerationShutdown;
  const normalIndicator = resolveNormalIndicatorMode(q);

  const troubleshootingLike =
    !normalIndicator &&
    !emergencySmoke &&
    !regenerationShutdown &&
    (baseIntent.intentType === "TROUBLESHOOTING_QUERY" ||
      TROUBLESHOOTING_RE.test(q) ||
      symptomTroubleshootingLike ||
      (/что\s+делать/i.test(q) && !explicitSafety));
  const pureParameterQuestion =
    baseIntent.intentType === "SINGLE_FIELD_QUERY" ||
    PARAMETER_QUESTION_RE.test(q) ||
    (/^(?:напряжен|частот|ip|сопротивлен|нагрузк|влажност|rh|температур|масса|вес)\b/iu.test(q) &&
      q.length < 90);

  if (emergencySmoke || regenerationShutdown || (explicitSafety && !troubleshootingLike)) {
    const hints = sectionHintsForQuery(q);
    return {
      intent: "SAFETY_QUERY",
      route: ROUTES.SAFETY_QA,
      focusParameter,
      symptom: emergencySmoke ? "emergency" : symptom,
      confidence: 0.94,
      retrievalMode: emergencySmoke ? "emergency_section_24" : "safety_grounded",
      safetyAnswerMode: "grounded_text",
      sectionHints: hints,
      symptoms,
      parameterResolved,
      originalQuery: q,
    };
  }

  if (isSpatialPhysicalControlsQuery(q)) {
    return {
      intent: "FACT_QUERY",
      route: ROUTES.UNKNOWN,
      focusParameter: null,
      symptom,
      confidence: 0.78,
      retrievalMode: "hybrid_wide",
      symptoms,
      parameterResolved: null,
      originalQuery: q,
    };
  }

  const maintenanceLike =
    !emergencySmoke &&
    !regenerationShutdown &&
    (baseIntent.intentType === "MAINTENANCE_QUERY" || isMaintenanceQuery(q));

  if (normalIndicator && !emergencySmoke && !regenerationShutdown) {
    const setupLike = /установ|задать|как\s+(?:установ|задать)|меню|кнопк/i.test(q);
    return {
      intent: setupLike ? "PROCEDURE_QUERY" : "FACT_QUERY",
      route: setupLike ? ROUTES.PROCEDURAL_QA : ROUTES.UNKNOWN,
      focusParameter: null,
      symptom: null,
      confidence: 0.9,
      retrievalMode: "hybrid_wide",
      indicatorNormalMode: normalIndicator.mode,
      indicatorNormalLabel: normalIndicator.labelRu,
      sectionHints: normalIndicator.sectionHints,
      symptoms: [],
      parameterResolved,
      originalQuery: q,
    };
  }

  if (maintenanceLike && !troubleshootingLike) {
    return {
      intent: "MAINTENANCE_QUERY",
      route: ROUTES.UNKNOWN,
      focusParameter,
      symptom,
      confidence: 0.86,
      retrievalMode: "maintenance_focused",
      sectionHints: maintenanceSectionHintsForQuery(),
      symptoms,
      parameterResolved,
      originalQuery: q,
    };
  }

  if (parameterResolved && pureParameterQuestion && !troubleshootingLike && !reasoningLike) {
    return {
      intent: "SINGLE_FIELD_QUERY",
      route: ROUTES.UNKNOWN,
      focusParameter,
      symptom,
      confidence: 0.92,
      retrievalMode: "hybrid_wide",
      symptoms,
      parameterResolved,
      originalQuery: q,
    };
  }

  if (troubleshootingLike) {
    const tsHints = troubleshootingSectionHintsForQuery(q);
    return {
      intent: "TROUBLESHOOTING_QUERY",
      route: ROUTES.TROUBLESHOOTING_QA,
      focusParameter,
      symptom,
      confidence: symptoms.length ? 0.87 : 0.68,
      retrievalMode: "troubleshooting_focused",
      symptoms,
      parameterResolved,
      originalQuery: q,
      ...(tsHints.length ? { sectionHints: tsHints } : {}),
    };
  }

  if (
    baseIntent.intentType === "GETTING_STARTED_QUERY" ||
    baseIntent.intentType === "PROCEDURE_QUERY" ||
    PROCEDURAL_RE.test(q)
  ) {
    return {
      intent: baseIntent.intentType === "GETTING_STARTED_QUERY" ? "GETTING_STARTED_QUERY" : "PROCEDURE_QUERY",
      route: ROUTES.PROCEDURAL_QA,
      focusParameter,
      symptom,
      confidence: 0.84,
      retrievalMode: "procedural_focused",
      symptoms,
      parameterResolved,
      originalQuery: q,
    };
  }

  if (baseIntent.intentType === "COMPARISON_QUERY") {
    return {
      intent: "COMPARISON_QUERY",
      route: ROUTES.UNKNOWN,
      focusParameter,
      symptom,
      confidence: 0.84,
      retrievalMode: "hybrid_wide",
      sectionHints: ["1.1.3", "1.1.2", "условия", "эксплуатац"],
      symptoms,
      parameterResolved,
      originalQuery: q,
    };
  }

  if (reasoningLike) {
    return {
      intent: "FACT_QUERY",
      route: ROUTES.REASONING_QA,
      focusParameter,
      symptom,
      confidence: 0.82,
      retrievalMode: "reasoning_causal",
      symptoms,
      parameterResolved,
      originalQuery: q,
    };
  }

  return {
    intent: baseIntent.intentType || "FACT_QUERY",
    route: ROUTES.UNKNOWN,
    focusParameter,
    symptom,
    confidence: 0.5,
    retrievalMode: "hybrid",
    symptoms,
    parameterResolved,
    originalQuery: q,
  };
}

function overlayLlmRoute(base, llmRoute) {
  if (!llmRoute || llmRoute === ROUTES.UNKNOWN) {
    return base;
  }
  if (llmRoute === ROUTES.DETERMINISTIC_PARAMETER) {
    return {
      ...base,
      route: ROUTES.UNKNOWN,
      intent: "SINGLE_FIELD_QUERY",
      confidence: Math.max(Number(base.confidence) || 0.5, 0.78),
      retrievalMode: "hybrid_wide",
    };
  }
  const retrievalModeMap = {
    [ROUTES.PROCEDURAL_QA]: "procedural_focused",
    [ROUTES.TROUBLESHOOTING_QA]: "troubleshooting_focused",
    [ROUTES.REASONING_QA]: "reasoning_causal",
    [ROUTES.SAFETY_QA]: "safety_checklist",
  };
  const intentMap = {
    [ROUTES.PROCEDURAL_QA]: "PROCEDURE_QUERY",
    [ROUTES.TROUBLESHOOTING_QA]: "TROUBLESHOOTING_QUERY",
    [ROUTES.REASONING_QA]: "FACT_QUERY",
    [ROUTES.SAFETY_QA]: "SAFETY_QUERY",
  };
  return {
    ...base,
    route: llmRoute,
    intent: intentMap[llmRoute] || base.intent,
    confidence: Math.max(Number(base.confidence) || 0.5, 0.78),
    retrievalMode: retrievalModeMap[llmRoute] || base.retrievalMode || "hybrid",
  };
}

async function routeQuery(args) {
  const decision = computeRegexRouteDecision(args);
  const cfg = getRagConfig();
  if (decision.route !== ROUTES.UNKNOWN || !cfg.routerLlmFallback) {
    return decision;
  }
  try {
    const llmRoute = await classifyRouteWithLlm(args.query, args.equipment);
    if (llmRoute) {
      return overlayLlmRoute(decision, llmRoute);
    }
  } catch (_e) {
    /* keep regex UNKNOWN */
  }
  return decision;
}

module.exports = {
  ROUTES,
  routeQuery,
  computeRegexRouteDecision,
};
