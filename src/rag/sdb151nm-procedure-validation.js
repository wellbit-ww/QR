const { MODEL_PARAM_NOT_SPECIFIED } = require("./sdb151nm-unsupported-spec");

const STRICT_ABSTAIN = "Информация отсутствует в документации.";

const PROCEDURE_INTENTS = new Set([
  "PROCEDURE_QUERY",
  "GETTING_STARTED_QUERY",
  "MAINTENANCE_QUERY",
  "SAFETY_QUERY",
]);

const FOREIGN_NUMERIC_LEAKS = [
  { re: /\b70\s*кг(?![\p{L}\d])/iu, claim: "70 кг" },
  { re: /\b90\s*кг(?![\p{L}\d])/iu, claim: "90 кг" },
  { re: /\b180\s*кг(?![\p{L}\d])/iu, claim: "180 кг" },
  { re: /\b1358\b/u, claim: "1358" },
  { re: /\b1952\b/u, claim: "1952" },
  { re: /\b1204\b/u, claim: "1204" },
  { re: /\b500\s*(?:л|l)(?![\p{L}\d])/iu, claim: "500 л" },
  { re: /\b546\s*(?:л|l)(?![\p{L}\d])/iu, claim: "546 л" },
  { re: /\b743(?:\s*(?:л|l))?(?![\p{L}\d])/iu, claim: "743 л" },
  { re: /\b770(?:\s*(?:л|l))?(?![\p{L}\d])/iu, claim: "770 л" },
  { re: /\b1028(?:\s*(?:л|l))?(?![\p{L}\d])/iu, claim: "1028 л" },
  { re: /\b540\s*(?:вт|w)(?![\p{L}\d])/iu, claim: "540 Вт" },
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
  const answer = String(answerStr || "");
  if (!answer.trim() || answer.trim() === STRICT_ABSTAIN || answer.includes(MODEL_PARAM_NOT_SPECIFIED)) {
    return [];
  }

  const failures = [];
  const query = String(intent.originalQuery || "");
  if (/\bSDB(?:302|702|1106)(?:\s*NM|-NM|NM)?\b/iu.test(answer) && !/\bSDB(?:302|702|1106)/iu.test(query)) {
    failures.push({ code: "parameter_leakage", severity: "fail", detail: "foreign_model_mention_other_sdb" });
  }

  const context = normalizeForCheck(contextStr);
  for (const { re, claim } of FOREIGN_NUMERIC_LEAKS) {
    if (re.test(answer) && !re.test(context)) {
      failures.push({ code: "parameter_leakage", severity: "fail", detail: "foreign_model_numeric_leak", claim });
      break;
    }
  }

  if (
    /(?:внутренн[\p{L}]*|полн[\p{L}]*)\s+объ[её]м\s*(?:—|:|составляет)?\s*\d/iu.test(answer) ||
    /(?:количеств[\p{L}]*\s+двер|у\s+шкафа\s+\d+\s+двер)/iu.test(answer)
  ) {
    failures.push({ code: "parameter_leakage", severity: "fail", detail: "unconfirmed_sdb151_model_parameter" });
  }

  return failures;
}

function sdb151InventedProcedureFailures(answerStr, contextStr, intent = {}) {
  const answer = String(answerStr || "");
  const context = String(contextStr || "");
  if (!answer.trim() || answer.trim() === STRICT_ABSTAIN || answer.includes(MODEL_PARAM_NOT_SPECIFIED)) {
    return [];
  }
  const failures = [];
  const query = String(intent.originalQuery || "");

  if (/(?:wi[\-\s]?fi|mqtt|modbus(?:\s*tcp)?|управл[\p{L}]*\s+через\s+интернет)/iu.test(answer)) {
    failures.push({ code: "parameter_leakage", severity: "fail", detail: "unsupported_spec_in_answer" });
  }
  if (/(?:3\s+осушител|три\s+осушител|запасн[\p{L}]*\s+замк)/iu.test(answer)) {
    failures.push({ code: "parameter_leakage", severity: "fail", detail: "invented_base_delivery_item" });
  }
  if (
    /(?:\d+|четыре)\s+(?:транспортн[\p{L}]*\s+)?кол[её]с/iu.test(answer) &&
    !/(?:не\s+вход|не\s+комплект|отсутств)/iu.test(answer)
  ) {
    failures.push({ code: "parameter_leakage", severity: "fail", detail: "invented_sdb151_base_wheels" });
  }
  const deniesHeatingOption = /(?:не\s+привед|не\s+указан|табл(?:иц[аеы])?\s*1\.4)/iu.test(answer);
  if (
    /подогрев/iu.test(answer) &&
    /(?:\+?\s*40\s*°?\s*[cс]|окружающ[\p{L}]*\s*\+?\s*5)/iu.test(answer) &&
    !deniesHeatingOption
  ) {
    failures.push({ code: "parameter_leakage", severity: "fail", detail: "invented_sdb151_heating_option" });
  }
  if (
    /(?:опци[\p{L}]*\s+подогрев|подогрев\s+(?:воздуха\s+)?(?:доступ|предусмотр|входит|имеется|есть))/iu.test(
      answer
    ) &&
    !deniesHeatingOption &&
    !/(?:не\s+вход)/iu.test(answer)
  ) {
    failures.push({ code: "parameter_leakage", severity: "fail", detail: "invented_sdb151_heating_option" });
  }
  if (/тестов(?:ый|ого|ом)\s+режим/iu.test(answer) && !/тестов(?:ый|ого|ом)\s+режим/iu.test(context)) {
    failures.push({ code: "invented_procedure_step", severity: "fail", detail: "test_mode_not_in_manual" });
  }
  if (
    /(?:нажм(?:ите|ите)|комбинац(?:ия|ии)|кнопк(?:у|а)\s+.*открыт)/iu.test(answer) &&
    /открыт[\p{L}]*\s+двер|как\s+открыть\s+двер/iu.test(query) &&
    !/(?:нажм(?:ите|ите)|комбинац(?:ия|ии)).*(?:открыт|двер)/iu.test(context)
  ) {
    failures.push({ code: "invented_procedure_step", severity: "fail", detail: "invented_door_opening_procedure" });
  }
  if (isProcedureIntent(intent)) {
    const numberedSteps = answer.match(/^\s*\d+[\.)]\s+/gm) || [];
    if (numberedSteps.length >= 3 && !contextHasProceduralSteps(context)) {
      failures.push({ code: "invented_procedure_steps", severity: "fail", detail: "numbered_steps_without_procedural_context" });
    }
  }

  return failures;
}

module.exports = {
  FOREIGN_NUMERIC_LEAKS,
  sdb151ForeignModelLeakFailures,
  sdb151InventedProcedureFailures,
  isProcedureIntent,
};
