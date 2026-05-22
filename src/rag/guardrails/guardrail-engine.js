const { validateAnswerAgainstContext } = require("../answer-validation");
const { validateGrounding } = require("../synthesis/grounding-validation");
const { STRICT_ABSTAIN } = require("../prompts");
const { ragInfo, ragWarn } = require("../rag-log");

/** Контекст с именем материала + общеинженерный термин в ответе — не считаем «галлюцинацией» по слову. */
function isDocBackedMaterialParaphraseToken(wordLower, ctxLower) {
  if (!wordLower || wordLower.length < 4) {
    return false;
  }
  const docNamesMaterial =
    /цеолит|силикагел|zeolite|adsorb|молекулярн(?:ое|ого)\s+сито|поглощает\s+влагу|влагу\s+из\s+воздух/i.test(
      ctxLower
    );
  if (!docNamesMaterial) {
    return false;
  }
  return /абсорбент|адсорбент|сорбент|наполнител|химическ|веществ/i.test(wordLower);
}

function detectHallucinations(answer, retrievalContext) {
  const answerWords = String(answer || "")
    .toLowerCase()
    .match(/\p{L}{4,}/gu);
  if (!answerWords || answerWords.length === 0) {
    return { flagged: false, suspiciousTokens: [], ratio: 0 };
  }
  const ctxLower = String(retrievalContext || "").toLowerCase();
  const contextSet = new Set(
    (String(retrievalContext || "").toLowerCase().match(/\p{L}{4,}/gu) || []).map((w) => w.trim())
  );
  const uniqueAnswer = [...new Set(answerWords)];
  const suspicious = uniqueAnswer.filter((w) => {
    if (contextSet.has(w)) {
      return false;
    }
    return !isDocBackedMaterialParaphraseToken(w, ctxLower);
  });
  const ratio = suspicious.length / Math.max(1, uniqueAnswer.length);
  return {
    flagged: suspicious.length >= 14 && ratio > 0.28,
    suspiciousTokens: suspicious.slice(0, 25),
    ratio: Number(ratio.toFixed(3)),
  };
}

function isEffectivelyEmptyContext(retrievalContext) {
  const t = String(retrievalContext || "").trim();
  if (!t) {
    return true;
  }
  if (t === "Релевантный контекст не найден.") {
    return true;
  }
  if (t.length < 80) {
    return true;
  }
  return false;
}

function allowShapeFromModelText(text, reason, extras = {}) {
  const outputText = String(text ?? "");
  return {
    passed: true,
    success: true,
    outputText,
    action: "ALLOW",
    reason,
    preserveOriginalText: true,
    hallucination: { flagged: false, suspiciousTokens: [], ratio: 0 },
    base: { ok: true, warnings: [], failures: [] },
    grounding: { ok: true, warnings: [], failures: [] },
    ...extras,
  };
}

function abstainShape(reason, hallucination, base, grounding, extras = {}) {
  return {
    passed: false,
    success: false,
    outputText: null,
    action: "ABSTAIN",
    reason,
    preserveOriginalText: false,
    hallucination,
    base,
    grounding,
    ...extras,
  };
}

/**
 * @param {{
 *   answer: string,
 *   retrievalContext: string,
 *   intent?: object,
 *   hints?: {
 *     deliveryMethod?: string,
 *     semanticSimilarity?: number,
 *     semanticRescueThreshold?: number,
 *   },
 * }} params
 */
function runGuardrails({ answer, retrievalContext, intent, hints = {} }) {
  const deliveryMethod = hints.deliveryMethod || "standard";
  const semanticSimilarity = Math.max(
    0,
    Math.min(
      1,
      Number.isFinite(Number(hints.semanticSimilarity)) ? Number(hints.semanticSimilarity) : 0,
    ),
  );
  const semanticRescueThreshold = Math.max(
    0,
    Math.min(1, Number(hints.semanticRescueThreshold ?? 0.75)),
  );

  const trimmed = String(answer || "").trim();
  const textPresent = Boolean(trimmed) && trimmed !== STRICT_ABSTAIN;

  ragInfo("guardrails.enter", {
    deliveryMethod,
    semanticSimilarity,
    semanticRescueThreshold,
    textPresent,
    textLen: trimmed.length,
  });

  if (deliveryMethod === "safety_fallback") {
    ragInfo("guardrails.bypass", { method: "safety_plain_text_trust", deliveryMethod });
    return allowShapeFromModelText(answer, "safety_plain_text_bypass", {
      deliveryMethod,
      guardrailBypass: "safety_plain_text",
    });
  }

  if (deliveryMethod === "direct_deterministic" || deliveryMethod === "rag_deterministic") {
    ragInfo("guardrails.bypass", { method: "deterministic_trust", deliveryMethod });
    return allowShapeFromModelText(answer, "deterministic_bypass", {
      deliveryMethod,
      guardrailBypass: "deterministic",
    });
  }

  const hallucination = detectHallucinations(answer, retrievalContext);
  const base = validateAnswerAgainstContext(answer, retrievalContext, intent || {});
  const grounding = validateGrounding(answer, retrievalContext, intent || {});

  const hardFailureCodes = new Set([
    "parameter_leakage",
    "grounding_antistatic_confusion",
    "safety_extra_reasoning",
    "golden_numeric_mismatch",
  ]);
  const regenerationHard = (base.failures || []).some((f) => f.code === "regeneration_forbidden_missing");
  const baseHard = (base.failures || []).filter((f) => hardFailureCodes.has(f.code));
  const groundingHard = (grounding.failures || []).filter((f) => hardFailureCodes.has(f.code));
  const hasHardFailure = baseHard.length > 0 || groundingHard.length > 0;

  const softFailed = base.ok === false || grounding.ok === false;

  if (textPresent && base.ok !== false && grounding.ok !== false && !hallucination.flagged) {
    ragInfo("guardrails.pass_strict", { deliveryMethod, reason: "validation_ok" });
    return allowShapeFromModelText(answer, "guardrails_passed", { deliveryMethod, hallucination, base, grounding });
  }

  if (hasHardFailure) {
    const numHall = [...(base.failures || []), ...(grounding.failures || [])].some(
      (f) => f.code === "parameter_leakage" && f.detail === "numerical_hallucination_detected",
    );
    if (numHall) {
      ragWarn("guardrails.hard_fail", {
        reason: "numerical_hallucination_detected",
        deliveryMethod,
        claims: [...(base.failures || []), ...(grounding.failures || [])]
          .filter((f) => f.detail === "numerical_hallucination_detected")
          .map((f) => f.claim)
          .filter(Boolean),
      });
    } else {
      ragWarn("guardrails.hard_fail", {
        deliveryMethod,
        codes: [...baseHard, ...groundingHard].map((f) => f.code),
      });
    }
    return abstainShape("grounding_failed_hard", hallucination, base, grounding, { deliveryMethod });
  }

  const looksLikeAbstain =
    /информац(?:ия|ии)\s+.*отсутств|не\s+найден|недостаточно\s+данных/i.test(trimmed);
  const substantiveAnswer = trimmed.length >= 48 && !looksLikeAbstain;
  const semanticRescue =
    substantiveAnswer &&
    textPresent &&
    semanticSimilarity >= semanticRescueThreshold &&
    softFailed;

  if (semanticRescue) {
    const goldenFail = (base.failures || []).some((f) => f.code === "golden_numeric_mismatch");
    if (goldenFail) {
      ragWarn("guardrails.block_semantic_rescue", { reason: "golden_numeric_mismatch", deliveryMethod });
      return abstainShape("golden_numeric_mismatch", hallucination, base, grounding, { deliveryMethod });
    }
    ragInfo("guardrails.semantic_rescue", {
      deliveryMethod,
      semanticSimilarity,
      threshold: semanticRescueThreshold,
      softFailed,
    });
    return allowShapeFromModelText(answer, "semantic_rescue_retrieval_similarity", {
      deliveryMethod,
      hallucination,
      base,
      grounding,
      semanticRescue: true,
    });
  }

  if (isEffectivelyEmptyContext(retrievalContext) && softFailed) {
    ragWarn("guardrails.abstain_empty_context", { deliveryMethod, softFailed });
    return abstainShape("grounding_failed_empty_context", hallucination, base, grounding, { deliveryMethod });
  }

  if (base.ok === false || grounding.ok === false) {
    ragInfo("guardrails.soft_relaxed", { deliveryMethod, baseOk: base.ok, groundingOk: grounding.ok });
    return allowShapeFromModelText(answer, "grounding_soft_relaxed", {
      deliveryMethod,
      hallucination,
      base,
      grounding,
    });
  }

  if (hallucination.flagged) {
    ragInfo("guardrails.hallucination_soft", { deliveryMethod, ratio: hallucination.ratio });
    return allowShapeFromModelText(answer, "hallucination_heuristic_soft_warning", {
      deliveryMethod,
      hallucination,
      base,
      grounding,
    });
  }

  ragInfo("guardrails.pass_default", { deliveryMethod });
  return allowShapeFromModelText(answer, "guardrails_passed", { deliveryMethod, hallucination, base, grounding });
}

module.exports = {
  runGuardrails,
};
