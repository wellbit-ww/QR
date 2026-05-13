/**
 * Пост-проверка ответа относительно контекста retrieval (эвристики, без второго LLM).
 * Возвращает warnings (мягкие) и failures (жёсткие production-FAIL).
 */

const MODE_LABELS = {
  drying: /осушени|осушк|осушител/i,
  storage: /хранени|хранилищ/i,
  regeneration: /регенерац/i,
};

function modesMentioned(text) {
  const found = new Set();
  for (const [key, re] of Object.entries(MODE_LABELS)) {
    if (re.test(text)) {
      found.add(key);
    }
  }
  return found;
}

/** Числа с единицами — проверка опоры на контекст. */
function extractNumericClaims(text) {
  const s = String(text || "");
  const out = new Set();
  const patterns = [
    /[+-]?\d+[.,]\d+\s*%/gi,
    /[+-]?\d+\s*%/gi,
    /[+-]?\d+[.,]\d+\s*(?:°\s*[СC]|град\.?\s*цельс)/gi,
    /[+-]?\d+\s*(?:мм|кг|ч\b|мин\.?\b|с\b)\b/gi,
    /[+-]?\d+[.,]?\d*\s*(?:В|вольт)/giu,
    /[+-]?\d+[.,]?\d*\s*(?:Гц|гц\b)/gi,
    /\bIP\s*\d+/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(s)) !== null) {
      const raw = m[0].replace(/\s+/g, " ").trim();
      const normalized = raw.toLowerCase().replace(",", ".");
      if (normalized.length >= 2) {
        out.add(normalized);
      }
    }
  }
  return [...out];
}

function hasBrokenLatex(answer) {
  return /\\(?:frac|text|approx|infty|downarrow|uparrow|to|Rightarrow)/i.test(
    String(answer || "")
  );
}

function damagedHumiditySymbols(answer) {
  const a = String(answer || "");
  if (/RH\s+%\s*[tp]/i.test(a)) {
    return true;
  }
  if (/RH%\s*[tp]\b/i.test(a) && !/(RH%t|RH%p)/i.test(a)) {
    return true;
  }
  return false;
}

function splitIntoRoughSentences(text) {
  const s = String(text || "").trim();
  if (!s) {
    return [];
  }
  return s.split(/(?<=[.!?])\s+/u).filter((line) => line.length > 0);
}

function countDistinctMetricFamilies(text) {
  const s = String(text || "");
  let n = 0;
  if (/[+-]?\d+[.,]?\d*\s*(?:В|вольт)/iu.test(s)) {
    n += 1;
  }
  if (/[+-]?\d+[.,]?\d*\s*(?:Гц|гц\b)|\d+\s*±?\s*Гц/i.test(s)) {
    n += 1;
  }
  if (/\bRH\s*%|\bRH%|влажност/i.test(s)) {
    n += 1;
  }
  if (/\bIP\s*\d+/i.test(s)) {
    n += 1;
  }
  if (/[+-]?\d+[.,]?\d*\s*(?:кПа|мм\s*рт)/i.test(s)) {
    n += 1;
  }
  if (/[+-]?\d+[.,]?\d*\s*(?:°|℃|град)/i.test(s)) {
    n += 1;
  }
  return n;
}

/** Жёсткие нарушения смешивания параметров / доменов (SINGLE_FIELD и смежное). */
function parameterLeakageFailures(answerStr, intent) {
  const failures = [];
  const it = intent.intentType || "";
  const fp = intent.focusParameter;
  const s = answerStr;

  if (it !== "SINGLE_FIELD_QUERY") {
    return failures;
  }

  if (fp === "frequency") {
    if (/[+-]?\d+[.,]?\d*\s*(?:В|вольт)/iu.test(s)) {
      failures.push({
        code: "parameter_leakage",
        severity: "fail",
        detail: "В ответе про частоту присутствует напряжение.",
      });
    }
    if (/\b(?:ампер|ватт|Вт|кВт|мощност|кВа|кВ·А|ток\s*\d)/i.test(s)) {
      failures.push({
        code: "parameter_leakage",
        severity: "fail",
        detail: "В ответе про частоту присутствуют ток/мощность.",
      });
    }
  }

  if (fp === "voltage") {
    if (/[+-]?\d+[.,]?\d*\s*(?:Гц|гц\b)/i.test(s)) {
      failures.push({
        code: "parameter_leakage",
        severity: "fail",
        detail: "В ответе про напряжение присутствует частота.",
      });
    }
  }

  if (fp === "protection") {
    if (/[+-]?\d+[.,]?\d*\s*(?:В|вольт)/iu.test(s) && !/\bIP\s*\d+/iu.test(s)) {
      failures.push({
        code: "parameter_leakage",
        severity: "fail",
        detail: "В ответе про IP присутствует напряжение без указания IP.",
      });
    }
    if (/[+-]?\d+[.,]?\d*\s*(?:Гц|гц\b)/i.test(s)) {
      failures.push({
        code: "parameter_leakage",
        severity: "fail",
        detail: "В ответе про IP присутствует частота.",
      });
    }
  }

  return failures;
}

function singleFieldStructuralFailures(answerStr, intent) {
  const failures = [];
  if (intent.intentType !== "SINGLE_FIELD_QUERY") {
    return failures;
  }

  const sentences = splitIntoRoughSentences(answerStr);
  if (sentences.length > 2) {
    failures.push({
      code: "over_generation_sentences",
      severity: "fail",
      detail: `Ожидалось не более 2 предложений для SINGLE_FIELD, получено ${sentences.length}.`,
    });
  }

  const fp = intent.focusParameter;
  const freqVoltageBleed =
    (fp === "frequency" && /[+-]?\d+[.,]?\d*\s*(?:В|вольт)/iu.test(answerStr)) ||
    (fp === "voltage" && /[+-]?\d+[.,]?\d*\s*(?:Гц|гц\b)/i.test(answerStr));

  if (countDistinctMetricFamilies(answerStr) >= 2 && !freqVoltageBleed) {
    failures.push({
      code: "multiple_numeric_domains",
      severity: "fail",
      detail: "Несколько различных числовых доменов при SINGLE_FIELD.",
    });
  }

  return failures;
}

function groundingAntistaticConfusionFailures(answerStr, intent) {
  if (
    intent.intentType !== "SINGLE_FIELD_QUERY" ||
    intent.focusParameter !== "grounding_resistance"
  ) {
    return [];
  }
  if (
    /м(?:е)?гом|м\s*ом\b|антистат|браслет|functional\s+grounding\s+resistor/i.test(answerStr)
  ) {
    return [
      {
        code: "grounding_antistatic_confusion",
        severity: "fail",
        detail:
          "В ответе про сопротивление заземляющего контура обнаружены признаки антистатического сопротивления.",
      },
    ];
  }
  return [];
}

function singleFieldSubsystemFailures(answerStr, intent) {
  if (intent.intentType !== "SINGLE_FIELD_QUERY") {
    return [];
  }
  const mentioned = modesMentioned(answerStr);
  if (mentioned.size >= 2) {
    return [
      {
        code: "mixed_subsystem_modes",
        severity: "fail",
        detail: `В ответе смешаны режимы: ${[...mentioned].join(", ")}.`,
      },
    ];
  }
  return [];
}

function possibleMetaAnswerWarning(answerStr, intent) {
  const intents = new Set(["FACT_QUERY", "CONFIGURATION_QUERY", "QUICK_FACT_QUERY"]);
  if (!intents.has(intent.intentType || "") || !intent.contextHasSpecOrTableChunks) {
    return null;
  }
  if (
    /указан(?:о|ы)?\s+в\s+таблиц|представлен(?:ы|о)?\s+в\s+таблиц|содерж(?:ится|атся)\s+в\s+документ|см\.?\s*руководств|смотр(?:и|ите)\s+руководств|обратитесь\s+к\s+руководств/i.test(
      answerStr
    )
  ) {
    return {
      code: "possible_meta_answer",
      detail:
        "Ответ отсылает к таблице/документации при наличии spec/table во фрагментах retrieval — ожидались конкретные значения.",
    };
  }
  return null;
}

function gettingStartedScopeBleedWarning(answerStr, intent) {
  if (intent.intentType !== "GETTING_STARTED_QUERY") {
    return null;
  }
  const q = String(intent.originalQuery || "").toLowerCase();
  const checks = [
    { answerRe: /ремонт|неисправност|диагностик/i, queryNeed: /ремонт|неисправност|диагностик/i },
    { answerRe: /авари/i, queryNeed: /авари/i },
    { answerRe: /\bазот/i, queryNeed: /азот/i },
    { answerRe: /подогрев/i, queryNeed: /подогрев/i },
    {
      answerRe: /техническ(?:ое|ого)\s+обслуживани|техобслуживани|ежегодн/i,
      queryNeed: /обслуживани|техобслуживани|ежегодн/i,
    },
  ];
  for (const { answerRe, queryNeed } of checks) {
    if (answerRe.test(answerStr) && !queryNeed.test(q)) {
      return {
        code: "possible_scope_bleed",
        detail: "В ответе про запуск упомянуты темы вне стартового сценария.",
      };
    }
  }
  return null;
}

function scopeOverGenerationFailures(answerStr, intent) {
  const scope = intent.queryScope;
  if (scope !== "narrow" && scope !== "medium") {
    return [];
  }
  if (!["FACT_QUERY", "QUICK_FACT_QUERY", "SINGLE_FIELD_QUERY"].includes(intent.intentType || "")) {
    return [];
  }
  if (/гаранти|хранени|коррози|транспортиров/i.test(answerStr)) {
    return [
      {
        code: "scope_over_generation",
        severity: "fail",
        detail:
          "В ответе присутствуют нерелевантные разделы (гарантия/хранение/коррозия/транспортировка).",
      },
    ];
  }
  return [];
}

function factLengthFailures(answerStr, intent) {
  if (intent.intentType !== "FACT_QUERY") {
    return [];
  }
  const sentences = splitIntoRoughSentences(answerStr);
  if (sentences.length > 5) {
    return [
      {
        code: "fact_over_generation_sentences",
        severity: "fail",
        detail: `Ожидалось не более 5 предложений для FACT_QUERY, получено ${sentences.length}.`,
      },
    ];
  }
  return [];
}

/**
 * @param {string} answer
 * @param {string} context — объединённый retrieval context
 * @param {{
 *   queryOperatingModes?: string[],
 *   intentType?: string,
 *   focusParameter?: string|null,
 *   queryScope?: string|null,
 *   originalQuery?: string,
 *   contextHasSpecOrTableChunks?: boolean,
 * }} intent
 */
function validateAnswerAgainstContext(answer, context, intent = {}) {
  const warnings = [];
  const failures = [];
  const answerStr = String(answer || "");
  const ctxNorm = normalizeForMatch(context);

  failures.push(...parameterLeakageFailures(answerStr, intent));
  failures.push(...singleFieldStructuralFailures(answerStr, intent));
  failures.push(...singleFieldSubsystemFailures(answerStr, intent));
  failures.push(...groundingAntistaticConfusionFailures(answerStr, intent));
  failures.push(...scopeOverGenerationFailures(answerStr, intent));
  failures.push(...factLengthFailures(answerStr, intent));

  const gsBleed = gettingStartedScopeBleedWarning(answerStr, intent);
  if (gsBleed) {
    warnings.push(gsBleed);
  }

  const metaAns = possibleMetaAnswerWarning(answerStr, intent);
  if (metaAns) {
    warnings.push(metaAns);
  }

  const queryModes = intent.queryOperatingModes || [];
  if (queryModes.length === 1) {
    const mentioned = modesMentioned(answerStr);
    for (const m of mentioned) {
      if (!queryModes.includes(m)) {
        warnings.push({
          code: "possible_mode_mixing",
          detail: `В ответе упомянут режим «${m}», тогда как запрос сфокусирован на ${queryModes.join(", ")}.`,
        });
        break;
      }
    }
  }

  const strictGroundingIntents = new Set(["SINGLE_FIELD_QUERY", "FACT_QUERY", "QUICK_FACT_QUERY"]);
  const claims = extractNumericClaims(answerStr);
  const ctxLoose = normalizeLooseNumericClaim(ctxNorm);
  const suspiciousNumbers = [];
  for (const c of claims) {
    const loose = normalizeLooseNumericClaim(c);
    if (!ctxLoose.includes(loose)) {
      suspiciousNumbers.push(c);
    }
  }
  if (suspiciousNumbers.length) {
    if (strictGroundingIntents.has(intent.intentType || "")) {
      failures.push({
        code: "grounding_numeric_fail",
        severity: "fail",
        detail: suspiciousNumbers.slice(0, 12),
      });
    } else {
      warnings.push({
        code: "numbers_not_in_context",
        detail: suspiciousNumbers.slice(0, 12),
      });
    }
  }

  if (hasBrokenLatex(answerStr)) {
    warnings.push({ code: "latex_detected", detail: "Ответ содержит LaTeX-последовательности." });
  }

  if (damagedHumiditySymbols(answerStr)) {
    warnings.push({
      code: "humidity_symbol_damage",
      detail: "Возможное искажение обозначений RH%t / RH%p.",
    });
  }

  const ok = failures.length === 0 && warnings.length === 0;

  return {
    ok,
    warnings,
    failures,
  };
}

function normalizeForMatch(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLooseNumericClaim(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/,/g, ".")
    .replace(/rh%/g, "%");
}

module.exports = {
  validateAnswerAgainstContext,
  modesMentioned,
  extractNumericClaims,
  normalizeLooseNumericClaim,
};
