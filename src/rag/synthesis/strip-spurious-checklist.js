/**
 * LLM sometimes copies the safety/troubleshooting heading «Что проверить:»
 * onto ordinary facts (TTX, условия эксплуатации). Keep it only for diagnostics.
 * It also hedges with «параметр не указан» and then continues with the real answer.
 */

const MODEL_PARAM_NOT_SPECIFIED =
  "В документации на данную модель этот параметр не указан.";
const STRICT_ABSTAIN = "Информация отсутствует в документации.";

function shouldKeepWhatToCheckHeading(route, message) {
  const q = String(message || "");
  if (route === "TROUBLESHOOTING_QA") {
    return true;
  }
  return /что\s+проверить|чек-?лист/iu.test(q);
}

function stripSpuriousWhatToCheckHeading(answer, { route, message } = {}) {
  const text = String(answer || "").trim();
  if (!/^что\s+проверить(?=\s|:|$)/iu.test(text)) {
    return text;
  }
  if (shouldKeepWhatToCheckHeading(route, message)) {
    return text;
  }
  let rest = text.replace(/^что\s+проверить(?:\s*\([^)]*\))?\s*:?\s*/iu, "").trim();
  if (/^1\.\s+/.test(rest) && !/\n\s*2\.\s+/.test(rest)) {
    rest = rest.replace(/^1\.\s+/, "").trim();
  }
  return rest || text;
}

function stripHedgedAbstainPrefix(answer) {
  const text = String(answer || "").trim();
  const prefixes = [MODEL_PARAM_NOT_SPECIFIED, STRICT_ABSTAIN];
  for (const prefix of prefixes) {
    if (text.length <= prefix.length) {
      continue;
    }
    if (text.slice(0, prefix.length).toLowerCase() !== prefix.toLowerCase()) {
      continue;
    }
    const rest = text
      .slice(prefix.length)
      .replace(/^\s*(?:однако|но|тем\s+не\s+менее|вместе\s+с\s+тем)[,.]?\s*/iu, "")
      .trim();
    if (rest.length > 40) {
      return rest;
    }
  }
  return text;
}

function sanitizeLlmAnswerArtifacts(answer, opts = {}) {
  return stripHedgedAbstainPrefix(stripSpuriousWhatToCheckHeading(answer, opts));
}

module.exports = {
  shouldKeepWhatToCheckHeading,
  stripSpuriousWhatToCheckHeading,
  stripHedgedAbstainPrefix,
  sanitizeLlmAnswerArtifacts,
};
