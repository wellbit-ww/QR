/**
 * Убирает внутренний формат чанков «Модель / Параметр / Значение» из ответа пользователю.
 */

const GOLDEN_TRIPLET_RE =
  /Модель:\s*SDB1106NM,\s*Параметр:\s*([^,]+),\s*Значение:\s*(.+)/giu;

function isProceduralGoldenValue(value) {
  const v = String(value || "").trim();
  return v.length > 55 || /должн|следует|запрещ|не\s+менее|не\s+более|размещ/i.test(v);
}

function formatDeGoldenized(paramLabel, value) {
  const p = String(paramLabel || "").trim();
  let v = String(value || "").trim().replace(/\s+/g, " ");
  if (!v) {
    return "";
  }
  if (isProceduralGoldenValue(v)) {
    return v.endsWith(".") ? v : `${v}.`;
  }
  return `**${p}** шкафа SDB1106NM: **${v.replace(/\.\s*$/, "")}**.`;
}

/**
 * @param {string} answer
 * @returns {string}
 */
function deGoldenizeUserFacingAnswer(answer) {
  const t = String(answer || "").trim();
  if (!t || !/Модель:\s*SDB1106NM,\s*Параметр:/iu.test(t)) {
    return answer;
  }

  const single = t.match(/^Модель:\s*SDB1106NM,\s*Параметр:\s*([^,]+),\s*Значение:\s*(.+)$/isu);
  if (single) {
    return formatDeGoldenized(single[1], single[2]);
  }

  let out = t;
  let m;
  const re = new RegExp(GOLDEN_TRIPLET_RE.source, "giu");
  while ((m = re.exec(t)) !== null) {
    out = out.replace(m[0], formatDeGoldenized(m[1], m[2]));
  }
  return out.replace(/\s+/g, " ").trim();
}

/** CJK / корейский / японский — типичный «языковой дрейф» Qwen. */
function containsForeignScript(text) {
  return /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(String(text || ""));
}

/**
 * @param {string} answer
 * @returns {boolean}
 */
function answerHasForeignScriptLeak(answer) {
  return containsForeignScript(answer);
}

module.exports = {
  deGoldenizeUserFacingAnswer,
  formatDeGoldenized,
  containsForeignScript,
  answerHasForeignScriptLeak,
};
