const { QUERY_TYPES } = require("../query-analysis");

const PROCEDURAL_SIGNAL_RE =
  /(?:^\s*\d+[\).]|необходимо|следует|перед|после|выполнить|подключить|установить|включить|проверить|убедиться|нажать|перевести|разместить)/imu;

function proceduralSignalScore(chunk) {
  const text = `${chunk?.section || ""}\n${chunk?.content || ""}`;
  let score = 0;
  if (PROCEDURAL_SIGNAL_RE.test(text)) {
    score += 0.16;
  }
  if (chunk?.metadata?.chunkKind === "procedure" || chunk?.metadata?.blockType === "PROCEDURE_BLOCK") {
    score += 0.18;
  }
  if (/гаранти|срок\s+хранен|комплект\s+поставк|цветные\s+металлы/iu.test(text)) {
    score -= 0.14;
  }
  return score;
}

function applyProceduralRetrieval(chunks) {
  return [...(chunks || [])]
    .map((chunk) => {
      const boost = proceduralSignalScore(chunk);
      const base = Number(chunk.rerankScore ?? chunk.score ?? 0);
      return {
        ...chunk,
        routedScore: base + boost,
        retrievalStrategyBoost: Number(boost.toFixed(4)),
      };
    })
    .sort((a, b) => (b.routedScore ?? 0) - (a.routedScore ?? 0));
}

function describeProceduralRetrieval() {
  return {
    route: QUERY_TYPES.PROCEDURAL_QA,
    retrievalStrategy: "procedural_boosted",
    answerStrategy: "grounded_procedural_synthesis",
    llmAllowed: true,
    deterministicUsed: false,
  };
}

module.exports = {
  applyProceduralRetrieval,
  describeProceduralRetrieval,
};
