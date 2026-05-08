/**
 * Пост-проверка ответа относительно контекста retrieval (эвристики, без второго LLM).
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

/** Числа с единицами (%, °C, мм, кг, В) — должны встречаться в контексте. */
function extractNumericClaims(text) {
  const s = String(text || "");
  const out = new Set();
  const patterns = [
    /[+-]?\d+[.,]\d+\s*%/gi,
    /[+-]?\d+\s*%/gi,
    /[+-]?\d+[.,]\d+\s*(?:°\s*[СC]|град\.?\s*цельс)/gi,
    /[+-]?\d+\s*(?:мм|кг|ч\b|мин\.?\b|с\b)\b/gi,
    /[+-]?\d+[.,]?\d*\s*(?:В|вольт)\b/gi,
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
  // Типичные поломки: пробел между RH и %
  if (/RH\s+%\s*[tp]/i.test(a)) {
    return true;
  }
  if (/RH%\s*[tp]\b/i.test(a) && !/(RH%t|RH%p)/i.test(a)) {
    return true;
  }
  return false;
}

/**
 * @param {string} answer
 * @param {string} context — объединённый retrieval context
 * @param {{ queryOperatingModes?: string[], intentType?: string }} intent
 */
function validateAnswerAgainstContext(answer, context, intent = {}) {
  const warnings = [];
  const answerStr = String(answer || "");
  const ctxNorm = normalizeForMatch(context);

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

  if (intent.intentType !== "FACT_QUERY") {
    const claims = extractNumericClaims(answerStr);
    const suspiciousNumbers = [];
    const ctxLoose = normalizeLooseNumericClaim(ctxNorm);
    for (const c of claims) {
      const loose = normalizeLooseNumericClaim(c);
      if (!ctxLoose.includes(loose)) {
        suspiciousNumbers.push(c);
      }
    }
    if (suspiciousNumbers.length) {
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

  return {
    ok: warnings.length === 0,
    warnings,
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
