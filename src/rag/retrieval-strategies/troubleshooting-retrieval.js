const { QUERY_TYPES, extractSymptoms } = require("../query-analysis");
const { chunkIsPossibleFaultsList } = require("../troubleshooting-scope");

const TROUBLESHOOTING_SIGNAL_RE =
  /(?:неисправ|провер|замен|причин|авари|сигнал|ошибк|звуков|предохран|нет\s+связ|ethernet|не\s+работ|не\s+включ|не\s+запуска|не\s+осуш|уплотнит|датчик)/iu;

function troubleshootingSignalScore(chunk, symptoms = []) {
  const text = `${chunk?.section || ""}\n${chunk?.content || ""}`.toLowerCase();
  let score = 0;
  if (TROUBLESHOOTING_SIGNAL_RE.test(text)) {
    score += 0.18;
  }
  if (chunk?.metadata?.chunkKind === "procedure" || chunk?.metadata?.blockType === "PROCEDURE_BLOCK") {
    score += 0.08;
  }
  if (chunk?.metadata?.chunkKind === "safety" || chunk?.metadata?.blockType === "WARNING_BLOCK") {
    score += 0.06;
  }
  if (symptoms.includes("door") && /двер|открыт|закрыт|сигнализац/.test(text)) {
    score += 0.22;
  }
  if (symptoms.includes("humidity") && /влажност|rh|осуш|осушител|регенерац/.test(text)) {
    score += 0.16;
  }
  if (chunkIsPossibleFaultsList(chunk)) {
    score += 0.32;
  }
  if (symptoms.includes("humidity") && /уплотнител|замк|кожух|2\.2\.2\.[123]/.test(text)) {
    score += 0.24;
  }
  if (symptoms.includes("ethernet") && /ethernet|локальн|сеть/.test(text)) {
    score += 0.2;
    if (/нет\s+связ[иь]\s+шкафа\s+по\s+сети\s+ethernet|плохой\s+контакт\s+ethernet\s+кабеля|неисправен\s+ethernet\s+кабель|заменить\s+кабель\s+ethernet|заменить\s+разъ[её]м\s+ethernet/.test(text)) {
      score += 0.38;
    }
  }
  if (symptoms.includes("indicator") && /индикатор|индикац|светодиод|панел/.test(text)) {
    score += 0.18;
  }
  if (/титул|общие\s+указания|комплект\s+поставк|драгоценных\s+материалов/.test(text)) {
    score -= 0.14;
  }
  return score;
}

function applyTroubleshootingRetrieval(chunks, queryAnalysis) {
  const symptoms = queryAnalysis?.extractedSymptoms?.length
    ? queryAnalysis.extractedSymptoms
    : extractSymptoms(queryAnalysis?.intent?.originalQuery || "");
  return [...(chunks || [])]
    .map((chunk) => {
      const boost = troubleshootingSignalScore(chunk, symptoms);
      const base = Number(chunk.rerankScore ?? chunk.score ?? 0);
      return {
        ...chunk,
        routedScore: base + boost,
        retrievalStrategyBoost: Number(boost.toFixed(4)),
      };
    })
    .sort((a, b) => (b.routedScore ?? 0) - (a.routedScore ?? 0));
}

function shouldAskDiagnosticClarification(queryAnalysis, chunks) {
  const q = String(queryAnalysis?.intent?.originalQuery || "").trim();
  const generic = q.length < 40 && /^(шкаф\s+)?(?:пищит|не\s+работает|не\s+запускается|ошибка|сигнал)$/iu.test(q);
  if (!generic) {
    return false;
  }
  const best = chunks?.[0]?.routedScore ?? chunks?.[0]?.rerankScore ?? chunks?.[0]?.score ?? 0;
  return Number(best) < 0.62;
}

function describeTroubleshootingRetrieval(queryAnalysis) {
  return {
    route: QUERY_TYPES.TROUBLESHOOTING_QA,
    retrievalStrategy: "troubleshooting_symptom_boosted",
    answerStrategy: "grounded_troubleshooting_synthesis",
    llmAllowed: true,
    deterministicUsed: false,
    symptoms: queryAnalysis?.extractedSymptoms || [],
  };
}

module.exports = {
  applyTroubleshootingRetrieval,
  shouldAskDiagnosticClarification,
  describeTroubleshootingRetrieval,
};
