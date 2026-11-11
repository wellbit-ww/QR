const { getRagConfig } = require("./config");
const { runGuardrails } = require("./guardrails/guardrail-engine");
const {
  shouldUseHonestRag,
  isNumericTtxRetrievalQuery,
  shouldUseRagPure,
  contextHasSdb1560AnswerableData,
  isSpuriousModelAbstainAnswer,
  ragPureSdb1560AnswerLooksOnTopic,
} = require("./honest-rag-mode");
const {
  buildValidationIntent,
  resolveAbstainAnswer,
} = require("./sdb1106nm-post-gate");
const { validateSdb1560mAnswerAgainstContext } = require("./sdb1560m-answer-validation");
const { resolveEffectiveUserQuestion } = require("./query-rewriting");
const { STRICT_ABSTAIN } = require("./prompts");

const ragConfig = getRagConfig();

/**
 * Post-gate для honest RAG: guardrails + validation, без deterministic recovery / подмены ТТХ.
 */
function applyHonestRagPostGate({
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
  validationProfile = "sdb1560",
}) {
  void history;
  const effectiveMessage = resolveEffectiveUserQuestion(message, history);
  const answerText = String(answer || "").trim();
  if (deliveryMethod === "rag_deterministic" || deliveryMethod === "direct_deterministic") {
    return {
      answer: answerText || STRICT_ABSTAIN,
      guardrails: { action: "ALLOW", passed: true, reason: "honest_whitelist_deterministic" },
      validation: { ok: true, failures: [], warnings: [] },
      postGateTrace: {
        postGate: "honest_rag",
        honestMode: true,
        guardrailsAction: "ALLOW",
        validationOk: true,
        deterministicTrusted: true,
        skippedDeterministicRecovery: true,
      },
    };
  }

  const intent = buildValidationIntent({
    message: effectiveMessage,
    equipment,
    gateAction,
    routerDecision,
    retrieval,
  });

  const equipmentId = equipment?.id || "sdb1560m";
  const honestRag = shouldUseHonestRag(equipmentId);
  const ragPure = shouldUseRagPure(equipmentId);
  const guardrails = runGuardrails({
    answer,
    retrievalContext: context,
    intent,
    hints: {
      deliveryMethod,
      semanticSimilarity,
      semanticRescueThreshold: ragConfig.semanticRescueThreshold,
      originalQuery: effectiveMessage,
      validationProfile,
      equipmentId,
      honestRag,
      skipGoldenFacts:
        ragPure || (honestRag && isNumericTtxRetrievalQuery(effectiveMessage, intent)),
      ragPure,
    },
  });

  const rawAnswer = String(answer || "").trim();
  let candidate =
    guardrails.action === "ALLOW" && guardrails.passed
      ? String(guardrails.outputText || answer || "").trim()
      : resolveAbstainAnswer(message, intent, equipment, history);

  if (
    ragPure &&
    contextHasSdb1560AnswerableData(context) &&
    guardrails.action !== "ALLOW" &&
    rawAnswer.length >= 16 &&
    !isSpuriousModelAbstainAnswer(rawAnswer) &&
    ragPureSdb1560AnswerLooksOnTopic(effectiveMessage, rawAnswer)
  ) {
    candidate = rawAnswer;
  }

  const validation =
    validationProfile === "sdb1560"
      ? validateSdb1560mAnswerAgainstContext(candidate, context, intent)
      : { ok: true, failures: [], warnings: [] };

  let finalAnswer = validation.ok ? candidate : resolveAbstainAnswer(message, intent, equipment, history);

  if (
    ragPure &&
    contextHasSdb1560AnswerableData(context) &&
    !validation.ok &&
    !isSpuriousModelAbstainAnswer(candidate) &&
    ragPureSdb1560AnswerLooksOnTopic(effectiveMessage, candidate)
  ) {
    finalAnswer = candidate;
  }

  if (
    ragPure &&
    !contextHasSdb1560AnswerableData(context) &&
    isSpuriousModelAbstainAnswer(finalAnswer)
  ) {
    finalAnswer = STRICT_ABSTAIN;
  }

  return {
    answer: finalAnswer,
    guardrails,
    validation,
    intent,
    postGateTrace: {
      postGate: "honest_rag",
      honestMode: true,
      postGateApplied: true,
      guardrailsAction: guardrails.action,
      guardrailReason: guardrails.reason,
      semanticRescue: Boolean(guardrails.semanticRescue),
      validationOk: validation.ok,
      validationFailureCodes: (validation.failures || []).map((f) => f.code).filter(Boolean),
      skippedDeterministicRecovery: true,
      ragPure,
    },
  };
}

module.exports = {
  applyHonestRagPostGate,
};
