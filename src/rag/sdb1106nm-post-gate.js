const { getRagConfig } = require("./config");
const { runGuardrails } = require("./guardrails/guardrail-engine");
const { validateAnswerAgainstContext } = require("./answer-validation");
const {
  classifyQueryIntent,
  isTechnicalNumericQuery,
} = require("./query-intent");
const { STRICT_ABSTAIN, MODEL_PARAM_NOT_SPECIFIED } = require("./prompts");
const { tryDeterministicSdb1106nmAnswer } = require("./sdb1106nm-direct-facts");
const { resolveGoldenFactKey } = require("./sdb1106nm-golden-facts");
const {
  deGoldenizeUserFacingAnswer,
  answerHasForeignScriptLeak,
} = require("./sdb1106nm-answer-format");
const {
  isUnsupportedReplacementQuery,
  buildUnsupportedReplacementAnswer,
  modelNameFromEquipment,
} = require("./unsupported-replacement-scope");

const ragConfig = getRagConfig();

function resolveDeliveryMethodFromLlmTrace(llmTrace) {
  const t = llmTrace || {};
  if (t.safetyPlainTextFallback === true || t.safetyPlainTextAfterTransportError === true) {
    return "safety_fallback";
  }
  if (t.contextualFactModelAliasRetry === true) {
    return "alias_retry";
  }
  if (t.deterministicTroubleshootingFallback === true) {
    return "troubleshooting_fallback";
  }
  if (
    t.mode === "CONTEXTUAL_FACT_LLM" ||
    t.mode === "CONTEXTUAL_FACT_FALLBACK" ||
    t.deterministicParseFallback === true
  ) {
    return "contextual_fact_fallback";
  }
  return "standard";
}

function buildValidationIntent({ message, equipment, gateAction, routerDecision, retrieval }) {
  if (routerDecision && retrieval?.intent) {
    if (routerDecision.route === "SAFETY_QA" || routerDecision.intent === "SAFETY_QUERY") {
      return {
        intentType: "SAFETY_QUERY",
        focusParameter: retrieval.intent.focusParameter || routerDecision.focusParameter,
        queryScope: retrieval.intent.queryScope,
        queryOperatingModes: retrieval.intent.queryOperatingModes || [],
        originalQuery: message,
      };
    }
    return {
      intentType:
        routerDecision.intent === "SINGLE_FIELD_QUERY"
          ? "SINGLE_FIELD_QUERY"
          : retrieval.intent.intentType,
      focusParameter: retrieval.intent.focusParameter || routerDecision.focusParameter,
      queryScope: retrieval.intent.queryScope,
      queryOperatingModes: retrieval.intent.queryOperatingModes || [],
      originalQuery: message,
    };
  }

  const classified = classifyQueryIntent(message, equipment);
  const intentType =
    gateAction === "SAFETY" ? "SAFETY_QUERY" : classified.intentType;

  return {
    intentType,
    focusParameter: classified.focusParameter,
    queryScope: classified.queryScope,
    queryOperatingModes: classified.queryOperatingModes || [],
    originalQuery: message,
  };
}

function resolveAbstainAnswer(message, intent, equipment = null, history = []) {
  if (isUnsupportedReplacementQuery(message, history)) {
    return buildUnsupportedReplacementAnswer(
      modelNameFromEquipment(equipment),
      message,
      history,
    );
  }
  if (
    intent.intentType === "SINGLE_FIELD_QUERY" ||
    intent.intentType === "QUICK_FACT_QUERY" ||
    isTechnicalNumericQuery(message)
  ) {
    return MODEL_PARAM_NOT_SPECIFIED;
  }
  return STRICT_ABSTAIN;
}

function outboundFromGuardrails(guardrails, fallbackAnswer, message, intent, equipment, history) {
  if (guardrails.action === "ALLOW" && guardrails.passed) {
    const ot = guardrails.outputText;
    if (ot != null && String(ot).trim() !== "") {
      return String(ot);
    }
    return String(fallbackAnswer || "").trim() || resolveAbstainAnswer(message, intent, equipment, history);
  }
  if (guardrails.action === "ABSTAIN") {
    return resolveAbstainAnswer(message, intent, equipment, history);
  }
  return resolveAbstainAnswer(message, intent, equipment, history);
}

function hasDeterministicValidationFailure(validation) {
  return (validation.failures || []).some(
    (f) => f.code === "golden_numeric_mismatch" || f.code === "deterministic_topic_mismatch",
  );
}

function applyDeterministicRecovery(message, context, intent, history = []) {
  const det = tryDeterministicSdb1106nmAnswer(message, { history });
  if (!det) {
    return null;
  }
  const revalidation = validateAnswerAgainstContext(det, context, intent);
  if (!revalidation.ok && hasDeterministicValidationFailure(revalidation)) {
    return null;
  }
  return { answer: det, validation: revalidation, guardrails: null };
}

/**
 * Post-gate for SDB1106NM answers (Direct Context and RAG): guardrails + validation.
 *
 * @param {{
 *   answer: string,
 *   context: string,
 *   message: string,
 *   equipment: object,
 *   deliveryMethod?: string,
 *   semanticSimilarity?: number,
 *   gateAction?: string,
 *   routerDecision?: object,
 *   retrieval?: object,
 *   history?: Array<{ role: string, content: string }>,
 * }} params
 */
function applySdb1106nmPostGate({
  answer,
  context,
  message,
  equipment,
  deliveryMethod = "standard",
  semanticSimilarity = 1,
  gateAction,
  routerDecision,
  retrieval,
  history = [],
}) {
  const intent = buildValidationIntent({
    message,
    equipment,
    gateAction,
    routerDecision,
    retrieval,
  });

  const factKey = resolveGoldenFactKey(message, history);

  const guardrails = runGuardrails({
    answer,
    retrievalContext: context,
    intent,
    hints: {
      deliveryMethod,
      semanticSimilarity,
      semanticRescueThreshold: ragConfig.semanticRescueThreshold,
      originalQuery: message,
      factKey,
    },
  });

  const outboundAnswer = outboundFromGuardrails(
    guardrails,
    answer,
    message,
    intent,
    equipment,
    history,
  );
  let validation = validateAnswerAgainstContext(outboundAnswer, context, intent);
  let finalAnswer = deGoldenizeUserFacingAnswer(String(outboundAnswer || "").trim() || STRICT_ABSTAIN);
  let recoveryApplied = false;
  let recoveryFailed = false;

  const needsRecovery =
    answerHasForeignScriptLeak(finalAnswer) ||
    (!validation.ok &&
      (hasDeterministicValidationFailure(validation) ||
        guardrails.action === "ABSTAIN" ||
        (validation.failures || []).some((f) => f.code === "parameter_leakage")));

  if (needsRecovery) {
    const recovery = applyDeterministicRecovery(message, context, intent, history);
    if (recovery) {
      finalAnswer = deGoldenizeUserFacingAnswer(recovery.answer);
      validation = recovery.validation;
      recoveryApplied = true;
    } else if (hasDeterministicValidationFailure(validation)) {
      finalAnswer = resolveAbstainAnswer(message, intent, equipment, history);
      recoveryFailed = true;
    } else if (answerHasForeignScriptLeak(finalAnswer)) {
      finalAnswer = resolveAbstainAnswer(message, intent, equipment, history);
      recoveryFailed = true;
    }
  }

  return {
    answer: finalAnswer,
    guardrails,
    validation,
    intent,
    postGateTrace: {
      postGateApplied: true,
      guardrailAction: guardrails.action,
      guardrailReason: guardrails.reason,
      semanticRescue: Boolean(guardrails.semanticRescue),
      validationOk: validation.ok,
      validationFailureCodes: (validation.failures || []).map((f) => f.code).filter(Boolean),
      deterministicRecovery: recoveryApplied,
      recoveryFailed,
      ...(recoveryApplied ? { mode: "RAG_DETERMINISTIC_RECOVERY" } : {}),
    },
  };
}

module.exports = {
  applySdb1106nmPostGate,
  buildValidationIntent,
  resolveAbstainAnswer,
  resolveDeliveryMethodFromLlmTrace,
};
