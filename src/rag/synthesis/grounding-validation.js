const { STRICT_ABSTAIN } = require("../prompts");
const { validateAnswerAgainstContext } = require("../answer-validation");

const REPAIR_RE =
  /(?:разобрать|ремонт|заменить|починить|вскрыть|снять\s+крышк|перепаять|проверить\s+мультиметр|подать\s+напряжение)/iu;

function validateGrounding(answer, context, options = {}) {
  const base = validateAnswerAgainstContext(answer, context, options);
  const failures = [...(base.failures || [])];
  const warnings = [...(base.warnings || [])];
  const answerText = String(answer || "");
  const contextText = String(context || "");

  if (
    REPAIR_RE.test(answerText) &&
    !REPAIR_RE.test(contextText) &&
    !/(?:типов|неисправност|устранени|диагностик|ремонт|техническ|обслуживани|Ethernet|ТЭН|предохранит|замен)/iu.test(
      contextText
    )
  ) {
    warnings.push({
      code: "unsupported_repair_instruction_soft",
      severity: "warn",
      detail: "Ответ содержит формулировки ремонта; проверьте соответствие контексту.",
    });
  }

  const ok = failures.length === 0 && base.ok !== false;
  return {
    ...base,
    ok,
    warnings,
    failures,
    abstainAnswer: STRICT_ABSTAIN,
  };
}

module.exports = {
  validateGrounding,
};
