const assert = require("node:assert/strict");
const {
  stripSpuriousWhatToCheckHeading,
  stripHedgedAbstainPrefix,
} = require("../src/rag/synthesis/strip-spurious-checklist");
const { overlayLlmRoute, ROUTES } = require("../src/rag/router/query-router");
const { classifyQueryIntent } = require("../src/rag/query-intent");

const leaked = stripSpuriousWhatToCheckHeading(
  "Что проверить:\n1. Шкаф SDB302NM предназначен для круглосуточной эксплуатации при соблюдении условий температуры окружающего воздуха от +15 °C до +35 °C.",
  { route: "UNKNOWN", message: "Какой режим работы шкафа?" }
);
assert.equal(
  leaked,
  "Шкаф SDB302NM предназначен для круглосуточной эксплуатации при соблюдении условий температуры окружающего воздуха от +15 °C до +35 °C."
);
assert.doesNotMatch(leaked, /Что проверить/iu);

const keptTs = stripSpuriousWhatToCheckHeading("Что проверить:\n1. Уплотнитель дверей.", {
  route: "TROUBLESHOOTING_QA",
  message: "Влажность не падает",
});
assert.match(keptTs, /Что проверить/u);

const keptAsk = stripSpuriousWhatToCheckHeading("Что проверить:\n1. Внешний осмотр.", {
  route: "PROCEDURAL_QA",
  message: "Что проверить перед включением?",
});
assert.match(keptAsk, /Что проверить/u);

const factBase = {
  route: ROUTES.UNKNOWN,
  intent: "FACT_QUERY",
  originalQuery: "Можно ли эксплуатировать шкаф круглосуточно при +20?",
  confidence: 0.5,
  retrievalMode: "hybrid",
};
const demoted = overlayLlmRoute(factBase, ROUTES.SAFETY_QA);
assert.equal(demoted.route, ROUTES.UNKNOWN);
assert.notEqual(demoted.safetyAnswerMode, "safety_checklist");

const smokeBase = {
  ...factBase,
  originalQuery: "Пошёл дым из шкафа, что делать?",
};
const keptSafety = overlayLlmRoute(smokeBase, ROUTES.SAFETY_QA);
assert.equal(keptSafety.route, ROUTES.SAFETY_QA);
assert.equal(keptSafety.safetyAnswerMode, "grounded_text");

const powerOnIntent = classifyQueryIntent("Что проверить перед включением?");
assert.notEqual(powerOnIntent.intentType, "SAFETY_QUERY");

const hedged = stripHedgedAbstainPrefix(
  "В документации на данную модель этот параметр не указан. Однако, согласно информации из фрагмента 5, шкаф SDB302NM поддерживает влажность рабочего объёма с шагом 0,1% и точностью ±1 RH%."
);
assert.doesNotMatch(hedged, /параметр не указан/iu);
assert.match(hedged, /0,1%/u);
assert.equal(
  stripHedgedAbstainPrefix("В документации на данную модель этот параметр не указан."),
  "В документации на данную модель этот параметр не указан."
);

console.log("strip-spurious-checklist checks passed");
