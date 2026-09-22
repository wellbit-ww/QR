const MODEL_PARAM_NOT_SPECIFIED =
  "В документации на данную модель этот параметр не указан.";
const STRICT_ABSTAIN = "Информация отсутствует в документации.";

const PROCEDURE_INTENTS = new Set([
  "PROCEDURE_QUERY",
  "GETTING_STARTED_QUERY",
  "MAINTENANCE_QUERY",
  "SAFETY_QUERY",
]);

/** Типичные утечки ТТХ SDB1106NM в ответах по SDB151NM. */
const FOREIGN_NUMERIC_LEAKS = [
  { re: /\b70\s*кг(?![\p{L}\d])/iu, claim: "70 кг" },
  { re: /\b90\s*кг(?![\p{L}\d])/iu, claim: "90 кг" },
  { re: /\b1358\b/u, claim: "1358" },
  { re: /\b1952\b/u, claim: "1952" },
  { re: /\b500\s*(?:л|l)(?![\p{L}\d])/iu, claim: "500 л" },
  { re: /\b546\s*(?:л|l)(?![\p{L}\d])/iu, claim: "546 л" },
  { re: /\b743(?:\s*(?:л|l))?(?![\p{L}\d])/iu, claim: "743 л" },
  { re: /\b770(?:\s*(?:л|l))?(?![\p{L}\d])/iu, claim: "770 л" },

  { re: /\b46\s*кг\b/i, claim: "46 кг" },
  { re: /\b655\b/i, claim: "655" },
  { re: /\b90\s*кг\b/i, claim: "90 кг" },
  { re: /\b743\b/i, claim: "743" },
  { re: /\b1952\b/i, claim: "1952" },

  { re: /\b180\s*кг\b/i, claim: "180 кг" },
  { re: /\b1028\b/i, claim: "1028" },
  { re: /\b540\s*Вт\b/i, claim: "540 Вт" },
  { re: /\b1204\b/i, claim: "1204" },
];

function normalizeForCheck(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isProcedureIntent(intent = {}) {
  return PROCEDURE_INTENTS.has(intent.intentType || "");
}

function contextHasProceduralSteps(contextStr) {
  const ctx = String(contextStr || "");
  if (ctx.length < 80) {
    return false;
  }
  return (
    /(?:^\s*\d+[\.)]\s+|нажм(?:ите|ите)|перечислен|шаг\s+\d|согласно\s+п\.|в\s+меню)/im.test(ctx) ||
    /(?:выполн(?:ите|ить)|провер(?:ьте|ить)|подключ(?:ите|ить)|включ(?:ите|ить))/iu.test(ctx)
  );
}

function sdb151ForeignModelLeakFailures(answerStr, contextStr, intent = {}) {
  const a = String(answerStr || "");
  const ctx = String(contextStr || "");
  if (!a.trim() || a.trim() === STRICT_ABSTAIN || a.includes(MODEL_PARAM_NOT_SPECIFIED)) {
    return [];
  }
  const failures = [];
  const query = String(intent.originalQuery || "");

  if (/\bSDB(?:302|702|1106)(?:\s*NM|-NM|NM)?\b/i.test(a) && !/\bSDB(?:302|702|1106)/i.test(query)) {
    failures.push({
      code: "parameter_leakage",
      severity: "fail",
      detail: "foreign_model_mention_other_sdb",
    });
  }

  const ctxNorm = normalizeForCheck(ctx);
  for (const { re, claim } of FOREIGN_NUMERIC_LEAKS) {
    if (re.test(a) && !re.test(ctxNorm)) {
      failures.push({
        code: "parameter_leakage",
        severity: "fail",
        detail: "foreign_model_numeric_leak",
        claim,
      });
      break;
    }
  }
  return failures;
}

function sdb151InventedProcedureFailures(answerStr, contextStr, intent = {}) {
  const a = String(answerStr || "");
  const ctx = String(contextStr || "");
  if (!a.trim() || a.trim() === STRICT_ABSTAIN || a.includes(MODEL_PARAM_NOT_SPECIFIED)) {
    return [];
  }
  const failures = [];
  const query = String(intent.originalQuery || "");

  if (/(?:wi[\-\s]?fi|mqtt|modbus(?:\s*tcp)?|управл[\p{L}]*\s+через\s+интернет)/iu.test(a)) {
    failures.push({
      code: "parameter_leakage",
      severity: "fail",
      detail: "unsupported_spec_in_answer",
    });
  }

  
  if (/(?:3\s+осушител|три\s+осушител|запасн[\p{L}]*\s+замк)/iu.test(a)) {
    failures.push({ code: "parameter_leakage", severity: "fail", detail: "invented_base_delivery_item" });
  }
  if (/(?:\d+|четыре)\s+(?:транспортн[\p{L}]*\s+)?кол[её]с/iu.test(a) &&
      !/(?:не\s+вход|не\s+комплект|отсутств)/iu.test(a)) {
    failures.push({ code: "parameter_leakage", severity: "fail", detail: "invented_sdb151_base_wheels" });
  }
  if (/(?:внутренн[\p{L}]*|полн[\p{L}]*)s+объ[её]м\s*(?:—|:|составляет)?\s*\d/iu.test(a) ||
      /(?:количеств[\p{L}]*\s+двер|у\s+шкафа\s+\d+\s+двер)/iu.test(a)) {
    failures.push({ code: "parameter_leakage", severity: "fail", detail: "unconfirmed_sdb151_model_parameter" });
  }

  if (/тестов(?:ый|ого|ом)\s+режим/i.test(a) && !/тестов(?:ый|ого|ом)\s+режим/i.test(ctx)) {
    failures.push({
      code: "invented_procedure_step",
      severity: "fail",
      detail: "test_mode_not_in_manual",
    });
  }

  if (
    /(?:нажм(?:ите|ите)|комбинац(?:ия|ии)|кнопк(?:у|а)\s+.*открыт)/iu.test(a) &&
    /открыт[\p{L}]*\s+двер|как\s+открыть\s+двер/i.test(query) &&
    !/(?:нажм(?:ите|ите)|комбинац(?:ия|ии)).*(?:открыт|двер)/iu.test(ctx)
  ) {
    failures.push({
      code: "invented_procedure_step",
      severity: "fail",
      detail: "invented_door_opening_procedure",
    });
  }

  if (isProcedureIntent(intent)) {
    const numberedSteps = a.match(/^\s*\d+[\.)]\s+/gm) || [];
    if (numberedSteps.length >= 3 && !contextHasProceduralSteps(ctx)) {
      failures.push({
        code: "invented_procedure_steps",
        severity: "fail",
        detail: "numbered_steps_without_procedural_context",
      });
    }
  }

  return failures;
}

module.exports = {
  sdb151ForeignModelLeakFailures,
  sdb151InventedProcedureFailures,
  isProcedureIntent,
};
