const { getRagConfig } = require("./config");
const { runGuardrails } = require("./guardrails/guardrail-engine");
const { validateSdb702nmAnswerAgainstContext } = require("./sdb702nm-answer-validation");
const { tryDeterministicSdb702nmAnswer } = require("./sdb702nm-direct-facts");
const {
  buildValidationIntent,
  resolveAbstainAnswer,
} = require("./sdb1106nm-post-gate");
const { STRICT_ABSTAIN } = require("./prompts");

const ragConfig = getRagConfig();
const RECOVERY_FAILURE_CODES = new Set([
  "foreign_model_mention_other_sdb",
  "foreign_model_mention_sdb1106",
  "foreign_model_numeric_leak",
  "invented_procedure_step",
  "invented_procedure_steps",
  "unsupported_spec_in_answer",
]);

function hasRecoverableValidationFailure(validation) {
  return (validation.failures || []).some((f) => RECOVERY_FAILURE_CODES.has(f.detail));
}

function applyDeterministicRecovery(message, context, intent, history = []) {
  const det = tryDeterministicSdb702nmAnswer(message, { history });
  if (!det) {
    return null;
  }
  const validation = validateSdb702nmAnswerAgainstContext(det, context, intent);
  if (!validation.ok) {
    return null;
  }
  return { answer: det, validation };
}

function applySdb702nmPostGate({
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
  const answerText = String(answer || "").trim();
  if (deliveryMethod === "rag_deterministic" || deliveryMethod === "direct_deterministic") {
    return {
      answer: answerText || STRICT_ABSTAIN,
      guardrails: { action: "ALLOW", passed: true, reason: "trusted_sdb702_deterministic_fact" },
      validation: { ok: true, failures: [], warnings: [] },
      postGateTrace: {
        postGate: "sdb702-nm",
        guardrailsAction: "ALLOW",
        validationOk: true,
        deterministicTrusted: true,
      },
    };
  }

  const intent = buildValidationIntent({
    message,
    equipment,
    gateAction,
    routerDecision,
    retrieval,
  });

  const originalValidation = validateSdb702nmAnswerAgainstContext(answerText, context, intent);
  if (hasRecoverableValidationFailure(originalValidation)) {
    const recovery = applyDeterministicRecovery(message, context, intent, history);
    if (recovery) {
      return {
        answer: recovery.answer,
        guardrails: {
          action: "ALLOW",
          passed: true,
          reason: "sdb702_deterministic_recovery_pre_guardrails",
        },
        validation: recovery.validation,
        intent,
        postGateTrace: {
          postGate: "sdb702-nm",
          postGateApplied: true,
          guardrailsAction: "ALLOW",
          validationOk: true,
          deterministicRecovery: true,
          mode: "RAG_DETERMINISTIC_RECOVERY",
        },
      };
    }
  }

  const guardrails = runGuardrails({
    answer,
    retrievalContext: context,
    intent,
    hints: {
      deliveryMethod,
      semanticSimilarity,
      semanticRescueThreshold: ragConfig.semanticRescueThreshold,
      originalQuery: message,
      validationProfile: "sdb702",
    },
  });

  const candidate =
    guardrails.action === "ALLOW" && guardrails.passed
      ? String(guardrails.outputText || answer || "").trim()
      : resolveAbstainAnswer(message, intent, equipment, history);

  const validation = validateSdb702nmAnswerAgainstContext(candidate, context, intent);
  let finalAnswer = validation.ok ? candidate : resolveAbstainAnswer(message, intent, equipment, history);
  let recoveryApplied = false;

  if (!validation.ok && hasRecoverableValidationFailure(validation)) {
    const recovery = applyDeterministicRecovery(message, context, intent, history);
    if (recovery) {
      finalAnswer = recovery.answer;
      recoveryApplied = true;
      return {
        answer: finalAnswer,
        guardrails,
        validation: recovery.validation,
        intent,
        postGateTrace: {
          postGate: "sdb702-nm",
          postGateApplied: true,
          guardrailsAction: guardrails.action,
          guardrailReason: guardrails.reason,
          semanticRescue: Boolean(guardrails.semanticRescue),
          validationOk: true,
          deterministicRecovery: true,
          mode: "RAG_DETERMINISTIC_RECOVERY",
        },
      };
    }
  }

  return {
    answer: finalAnswer,
    guardrails,
    validation,
    intent,
    postGateTrace: {
      postGate: "sdb702-nm",
      postGateApplied: true,
      guardrailsAction: guardrails.action,
      guardrailReason: guardrails.reason,
      semanticRescue: Boolean(guardrails.semanticRescue),
      validationOk: validation.ok,
      validationFailureCodes: (validation.failures || []).map((f) => f.code).filter(Boolean),
      deterministicRecovery: recoveryApplied,
    },
  };
}

module.exports = { applySdb702nmPostGate };
