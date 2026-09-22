const { validateAnswerAgainstContext } = require("./answer-validation");
const {
  sdb702ForeignModelLeakFailures,
  sdb702InventedProcedureFailures,
} = require("./sdb702nm-procedure-validation");

const STRICT_NUMERIC_INTENTS = new Set(["SINGLE_FIELD_QUERY", "FACT_QUERY", "QUICK_FACT_QUERY"]);

function isStrictSdb302ValidationIntent(intent = {}) {
  return STRICT_NUMERIC_INTENTS.has(intent.intentType || "");
}

/**
 * Валидация ответов SDB702NM: без golden-facts SDB1106; для обзорных/процедурных
 * вопросов числовая проверка мягче, для точечных ТТХ — как у 1106.
 */
function validateSdb702nmAnswerAgainstContext(answer, context, intent = {}) {
  const base = validateAnswerAgainstContext(answer, context, intent, {
    skipGoldenFacts: true,
    skipCriticalNumericLeakage: !isStrictSdb302ValidationIntent(intent),
  });
  const extraFailures = [
    ...sdb702ForeignModelLeakFailures(answer, context, intent),
    ...sdb702InventedProcedureFailures(answer, context, intent),
  ];
  const failures = [...(base.failures || []), ...extraFailures];
  return {
    ...base,
    failures,
    ok: failures.length === 0,
  };
}

module.exports = {
  validateSdb702nmAnswerAgainstContext,
  isStrictSdb302ValidationIntent,
};
