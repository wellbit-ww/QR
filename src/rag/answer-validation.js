/**
 * Пост-проверка ответа относительно контекста retrieval (эвристики, без второго LLM).
 * Возвращает warnings (мягкие) и failures (жёсткие production-FAIL).
 */

const { STRICT_ABSTAIN, MODEL_PARAM_NOT_SPECIFIED } = require("./prompts");
const { goldenNumericMismatchFailures, deterministicTopicMismatchFailures } = require("./sdb1106nm-golden-facts");

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

/**
 * ТТХ-чувствительные числа (мощность, наработка в часах, IP, комплектация): должны буквально
 * опираться на контекст — иначе parameter_leakage (блокирует в т.ч. semantic rescue).
 */
function extractCriticalTtxNumericClaims(text) {
  const s = String(text || "");
  const out = new Set();
  const patterns = [
    /\b[+-]?\d{1,3}(?:[\s\u00A0\u202F]\d{3})+(?:[.,]\d+)?\s*(?:часов|часа|час)(?=\s|$|[,;.!?:])/giu,
    /\b[+-]?\d{1,3}(?:[\s\u00A0\u202F]\d{3})+(?:[.,]\d+)?\s+ч(?=\s|$|[,;.!?:])/giu,
    /\b[+-]?\d{1,3}(?:[\s\u00A0\u202F]\d{3})*(?:[.,]\d+)?\s*(?:Вт|ватт)(?=\s|$|[,;.!?:])/giu,
    /\b[+-]?\d{1,4}(?:[.,]\d+)?\s*(?:Вт|ватт)(?=\s|$|[,;.!?:])/giu,
    /\b[+-]?\d{1,4}(?:[.,]\d+)?\s+W(?=\s|$|[,;.!?:])/g,
    /[+-]?\d{2,4}(?:[.,]\d+)?\s*мм(?=\s|$|[,;.!?:])/giu,
    /\bIP\s*6?\d{1,2}\b/gi,
    /\b\d{1,3}\s*(?:полок|штук|шт\.)(?=\s|$|[,;.!?:])/giu,
    /(?:наработк|ресурс\s+на\s+отказ|MTBF|MTTF)[^\d\n]{0,100}?(\d{1,3}(?:[\s\u00A0\u202F]\d{3})+(?:[.,]\d+)?)/giu,
  ];
  for (const re of patterns) {
    const r = new RegExp(re.source, re.flags);
    let m;
    while ((m = r.exec(s)) !== null) {
      const raw = String(m[1] != null ? m[1] : m[0])
        .replace(/\s+/g, " ")
        .trim();
      const normalized = raw.toLowerCase().replace(",", ".");
      if (normalized.length >= 2) {
        out.add(normalized);
      }
    }
  }
  return [...out];
}

function criticalNumericTokenInContext(claim, ctxNorm, ctxLoose) {
  const c = String(claim || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (/^ip\s*6?\d{1,2}$/i.test(c)) {
    const compact = c.replace(/\s+/g, "");
    const ctxC = String(ctxNorm || "").toLowerCase().replace(/\s+/g, "");
    return ctxC.includes(compact);
  }
  const digitCore = c.replace(/[^\d]/g, "");
  if (digitCore.length >= 3) {
    const loose = normalizeLooseNumericClaim(c);
    if (loose && ctxLoose.includes(loose)) {
      return true;
    }
    if (ctxLoose.includes(digitCore)) {
      return true;
    }
    return false;
  }
  return numericTokenLikelyInContext(claim, ctxNorm, ctxLoose);
}

/** Жёсткие отказы: число из ответа не подтверждается контекстом (галлюцинация ТТХ). */
function criticalNumericLeakageFailures(answerStr, contextStr) {
  if (!answerStr || answerStr.trim() === STRICT_ABSTAIN) {
    return [];
  }
  const ctx = String(contextStr || "").trim();
  if (ctx.length < 24) {
    return [];
  }
  const claims = extractCriticalTtxNumericClaims(answerStr);
  if (!claims.length) {
    return [];
  }
  const ctxNorm = normalizeForMatch(contextStr);
  const ctxLoose = normalizeLooseNumericClaim(contextStr);
  const failures = [];
  const seenDigitKeys = new Set();
  for (const c of claims) {
    if (!criticalNumericTokenInContext(c, ctxNorm, ctxLoose)) {
      const digitKey = c.replace(/[^\d]/g, "") || c;
      if (seenDigitKeys.has(digitKey)) {
        continue;
      }
      seenDigitKeys.add(digitKey);
      failures.push({
        code: "parameter_leakage",
        severity: "fail",
        detail: "numerical_hallucination_detected",
        claim: c,
      });
    }
  }
  return failures;
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

function humidityStepHallucinationFailures(answerStr, contextStr, intent) {
  const q = String(intent.originalQuery || "");
  const fp = intent.focusParameter;
  const aboutStep =
    /шаг.*влажност|влажност.*шаг/i.test(q) || (fp === "humidity" && /шаг/i.test(q));
  if (!aboutStep) {
    return [];
  }
  const a = String(answerStr || "");
  const ctx = String(contextStr || "");
  const wrongStep =
    /\b5\s*%\s*RH\b/i.test(a) ||
    (/\bшаг[\p{L}\s]{0,24}5\b/iu.test(a) && /%|RH/i.test(a));
  const correctInCtx = /0[,.]1\s*%\s*RH|0[,.]1\s*RH%|шаг[\p{L}\s]{0,30}0[,.]1/iu.test(ctx);
  if (wrongStep && (correctInCtx || !/\b5\s*%\s*RH/i.test(ctx))) {
    return [
      {
        code: "parameter_leakage",
        severity: "fail",
        detail: "humidity_step_hallucination: ожидается шаг 0,1 %RH",
      },
    ];
  }
  return [];
}

/** Вопрос про °C — в ответе не должна доминировать мощность (Вт). */
function temperaturePowerConfusionFailures(answerStr, intent) {
  const q = String(intent.originalQuery || "");
  const a = String(answerStr || "");
  if (!a.trim() || a.trim() === STRICT_ABSTAIN) {
    return [];
  }

  const asksTemperature =
    /температур|нагрев|подогрев|градус|°\s*[сc]|º\s*[сc]/iu.test(q) &&
    (/установ|задать|как\s+(?:установ|задать|ое|ая)|можно\s+ли|диапазон|плюс\s*\d|\d+\s*°/iu.test(q) ||
      !/мощност|вт\b|ватт/i.test(q));

  if (!asksTemperature) {
    return [];
  }
  if (/мощност|вт\b|ватт|потребляем/i.test(q)) {
    return [];
  }

  const hasPowerAnswer =
    /\b\d+[\s,.]?\d*\s*(?:вт|ватт)\b/i.test(a) ||
    (/мощност/i.test(a) && /\d/.test(a) && !/°\s*[сc]|º\s*[сc]|градус/i.test(a));

  if (!hasPowerAnswer) {
    return [];
  }

  const hasTempAnswer = /°\s*[сc]|º\s*[сc]|градус|плюс\s*\d{1,2}/iu.test(a);
  if (hasTempAnswer && !/\b\d+[\s,.]?\d*\s*(?:вт|ватт)\b/i.test(a)) {
    return [];
  }

  return [
    {
      code: "parameter_leakage",
      severity: "fail",
      detail: "temperature_answer_contains_power_watts",
    },
  ];
}

function regenerationForbiddenFailures(answerStr, intent, contextStr) {
  const q = String(intent.originalQuery || "");
  if (!/регенерац/i.test(q) || !/выключ|отключ|обесточ|можно\s+ли/i.test(q)) {
    return [];
  }
  const a = String(answerStr || "");
  const ctx = String(contextStr || "");
  if (/информац(?:ия|ии)\s+.*отсутств/i.test(a)) {
    if (/ЗАПРЕЩАЕТСЯ|регенерац/i.test(ctx)) {
      return [
        {
          code: "regeneration_forbidden_missing",
          severity: "fail",
          detail: "abstain_with_forbidden_in_context",
        },
      ];
    }
  }
  if (!/запрещается|запрещено/i.test(a) && /ЗАПРЕЩАЕТСЯ|запрещается/i.test(ctx)) {
    return [
      {
        code: "regeneration_forbidden_missing",
        severity: "fail",
        detail: "В ответе на запрет выключения при регенерации нет «запрещается»",
      },
    ];
  }
  return [];
}

const SAFETY_EXTRA_REASONING_PATTERNS = [
  /из-за\s+риск[а-яё]*/iu,
  /из\s+за\s+риск[а-яё]*/iu,
  /это\s+может\s+привести/iu,
  /может\s+привести\s+к/iu,
  /во\s+избежани[ея]/iu,
  /чтобы\s+избежать/iu,
  /риск\s+пожар/iu,
  /опасност[ьи]\s+пожар/iu,
  /угроз[аы]\s+возгоран/iu,
  /в\s+связи\s+с\s+тем,?\s+что/iu,
  /поскольку\s+это/iu,
];

function isSafetyValidationIntent(intent) {
  if (intent.intentType === "SAFETY_QUERY") {
    return true;
  }
  const q = String(intent.originalQuery || "");
  return /дым|гарь|регенерац|выключ|отключ|аварийн|безопасност|2\.4\b|2\.2\.1\b/i.test(q);
}

function phraseLikelyInContext(phrase, ctxNorm, ctxLoose) {
  const p = String(phrase || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!p || p.length < 8) {
    return true;
  }
  if (ctxNorm.includes(p)) {
    return true;
  }
  const loose = p.replace(/[^\p{L}\p{N}]/gu, "");
  return loose.length >= 10 && ctxLoose.includes(loose);
}

/** Extra Reasoning: выдуманные причины/последствия в SAFETY без опоры на контекст. */
function safetyExtraReasoningFailures(answerStr, contextStr, intent) {
  if (!isSafetyValidationIntent(intent)) {
    return [];
  }
  const a = String(answerStr || "");
  const ctx = String(contextStr || "");
  const ctxNorm = normalizeForMatch(ctx);
  const ctxLoose = normalizeLooseNumericClaim(ctxNorm);
  const failures = [];

  for (const re of SAFETY_EXTRA_REASONING_PATTERNS) {
    const m = a.match(re);
    if (!m) {
      continue;
    }
    const phrase = m[0];
    if (!phraseLikelyInContext(phrase, ctxNorm, ctxLoose)) {
      failures.push({
        code: "safety_extra_reasoning",
        severity: "fail",
        detail: `extra_reasoning_not_in_context: ${phrase.slice(0, 80)}`,
      });
      break;
    }
  }

  if (
    /пожар/iu.test(a) &&
    !/пожар/iu.test(ctx) &&
    !/огонь/iu.test(ctx) &&
    !/возгоран/iu.test(ctx)
  ) {
    failures.push({
      code: "safety_extra_reasoning",
      severity: "fail",
      detail: "fire_risk_not_in_context",
    });
  }

  return failures;
}

function safetyInventionFailures(answerStr, contextStr, intent) {
  if (!isSafetyValidationIntent(intent)) {
    return [];
  }
  const a = String(answerStr || "");
  const ctx = String(contextStr || "");
  const failures = [];
  if (/\b1\s*минут/i.test(a) && !/\b1\s*минут/i.test(ctx)) {
    failures.push({
      code: "parameter_leakage",
      severity: "fail",
      detail: "safety_invention: упомянута 1 минута, в контексте нет",
    });
  }
  if (
    /автоотключ|автоматическ(?:и|ого)\s+отключ/i.test(a) &&
    !/автоотключ|автоматическ(?:и|ого)\s+отключ/i.test(ctx)
  ) {
    failures.push({
      code: "parameter_leakage",
      severity: "fail",
      detail: "safety_invention: автоотключение не в контексте",
    });
  }
  return failures;
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

/** Выдуманные ГОСТы и сроки обслуживания (напр. «36 месяцев») без опоры на контекст. */
function strictFactualityFailures(answerStr, contextStr) {
  const a = String(answerStr || "");
  const ctx = String(contextStr || "");
  if (!a.trim() || a.trim() === STRICT_ABSTAIN || a.includes(MODEL_PARAM_NOT_SPECIFIED)) {
    return [];
  }
  const failures = [];
  const gostMatches = a.match(/\bгост\s*[\d][\d.\s-]*/giu) || [];
  const ctxNorm = normalizeForMatch(ctx);
  for (const g of gostMatches) {
    const token = String(g).replace(/\s+/g, " ").trim().toLowerCase();
    if (token.length >= 5 && !ctxNorm.includes(token)) {
      failures.push({
        code: "parameter_leakage",
        severity: "fail",
        detail: "invented_gost_reference",
        claim: g.trim(),
      });
      break;
    }
  }
  if (
    /(?:\b36\s*месяц|\bтри\s+года|\b3\s*года\b)/iu.test(a) &&
    !/(?:\b36\s*месяц|\bтри\s+года|\b3\s*года\b)/iu.test(ctx)
  ) {
    failures.push({
      code: "parameter_leakage",
      severity: "fail",
      detail: "invented_maintenance_period",
    });
  }
  return failures;
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
 * @param {{
 *   skipGoldenFacts?: boolean,
 *   skipCriticalNumericLeakage?: boolean,
 * }} [options]
 */
function validateAnswerAgainstContext(answer, context, intent = {}, options = {}) {
  const skipGoldenFacts = Boolean(options.skipGoldenFacts);
  const skipCriticalNumericLeakage = Boolean(options.skipCriticalNumericLeakage);
  const warnings = [];
  const failures = [];
  const answerStr = String(answer || "");
  const ctxNorm = normalizeForMatch(context);

  failures.push(...parameterLeakageFailures(answerStr, intent));
  failures.push(...temperaturePowerConfusionFailures(answerStr, intent));
  failures.push(...singleFieldStructuralFailures(answerStr, intent));
  failures.push(...singleFieldSubsystemFailures(answerStr, intent));
  failures.push(...groundingAntistaticConfusionFailures(answerStr, intent));
  failures.push(...scopeOverGenerationFailures(answerStr, intent));
  failures.push(...humidityStepHallucinationFailures(answerStr, context, intent));
  failures.push(...regenerationForbiddenFailures(answerStr, intent, context));
  failures.push(...safetyExtraReasoningFailures(answerStr, context, intent));
  failures.push(...safetyInventionFailures(answerStr, context, intent));
  failures.push(...factLengthFailures(answerStr, intent));
  failures.push(...strictFactualityFailures(answerStr, context));
  if (skipCriticalNumericLeakage) {
    const leakage = criticalNumericLeakageFailures(answerStr, context);
    if (leakage.length) {
      warnings.push({
        code: "numbers_relaxed_critical_leakage",
        detail: leakage.map((f) => f.claim).filter(Boolean).slice(0, 12),
      });
    }
  } else {
    failures.push(...criticalNumericLeakageFailures(answerStr, context));
  }
  if (!skipGoldenFacts) {
    failures.push(...goldenNumericMismatchFailures(answerStr, intent, intent.originalQuery));
    failures.push(...deterministicTopicMismatchFailures(answerStr, intent, intent.originalQuery));
  }

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
    if (!numericTokenLikelyInContext(c, ctxNorm, ctxLoose)) {
      suspiciousNumbers.push(c);
    }
  }
  if (suspiciousNumbers.length) {
    if (strictGroundingIntents.has(intent.intentType || "")) {
      const strictCut = intent.intentType === "SINGLE_FIELD_QUERY" ? 1 : 2;
      if (suspiciousNumbers.length >= strictCut) {
        failures.push({
          code: "grounding_numeric_fail",
          severity: "fail",
          detail: suspiciousNumbers.slice(0, 12),
        });
      } else {
        warnings.push({
          code: "numbers_relaxed_grounding",
          detail: suspiciousNumbers.slice(0, 12),
        });
      }
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

  const ok = failures.length === 0;

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

/** Допускает разный формат числа/единицы между ответом и контекстом. */
function numericTokenLikelyInContext(claim, ctxNorm, ctxLoose) {
  const loose = normalizeLooseNumericClaim(claim);
  if (loose && ctxLoose.includes(loose)) {
    return true;
  }
  const digits = String(claim || "").replace(/[^\d]/g, "");
  if (digits.length >= 2 && ctxLoose.includes(digits)) {
    return true;
  }
  const letters = String(claim || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}]+/gu, "");
  if (letters.length >= 3 && ctxNorm.includes(letters.slice(0, 5))) {
    return true;
  }
  return false;
}

module.exports = {
  validateAnswerAgainstContext,
  modesMentioned,
  extractNumericClaims,
  extractCriticalTtxNumericClaims,
  criticalNumericLeakageFailures,
  normalizeLooseNumericClaim,
  numericTokenLikelyInContext,
};
