const assert = require("node:assert/strict");
const { classifySdb1560mMessage } = require("../src/rag/sdb1560m-chat-gate");
const {
  isUnverifiedVolumeLiterQuery,
  isUnsupportedSdb1560mSpecQuery,
  answerAssertsUnverifiedVolumeLiters,
} = require("../src/rag/sdb1560m-unsupported-spec");
const {
  resolveExtractKind,
  tryHonestContextualNumericFact,
} = require("../src/rag/honest-contextual-extract");
const { applySdb1560mPostGate } = require("../src/rag/sdb1560m-post-gate");

const goldenTable =
  "| Масса | 260 кг | Таблица 1.1 |\n| Внутренний объём | 1 896 л | Таблица 1.1 |\n| Полный объём | 2 070 л | Таблица 1.1 |\n| 220 В ±10 %, 50 Гц ±0,4 Гц |";

assert.equal(
  isUnsupportedSdb1560mSpecQuery("Точный внутренний объём SDB1560M в литрах по PDF?"),
  true,
);
assert.equal(isUnsupportedSdb1560mSpecQuery("Полный объём шкафа в литрах по руководству?"), true);
assert.equal(
  classifySdb1560mMessage("Точный внутренний объём SDB1560M в литрах по PDF?").action,
  "UNSUPPORTED_SPEC",
);

const volumeExtract = tryHonestContextualNumericFact({
  equipmentId: "sdb1560m",
  message: "Точный внутренний объём SDB1560M в литрах по PDF?",
  intent: { focusParameter: "internal_volume" },
  promptChunks: [{ sourceDoc: "golden-facts-sdb1560m.md", content: goldenTable }],
  retrievalContext: "",
  priorAnswer: "**Внутренний объём** SDB1560NM — **1 896 л**.",
});
assert.equal(volumeExtract, null);

assert.equal(resolveExtractKind("Какова масса базового исполнения SDB1560М?", {}), "mass");
const massExtract = tryHonestContextualNumericFact({
  equipmentId: "sdb1560m",
  message: "Какова масса базового исполнения SDB1560М?",
  intent: {},
  promptChunks: [{ sourceDoc: "golden-facts-sdb1560m.md", content: goldenTable }],
  retrievalContext: "",
  priorAnswer: "В предоставленном контексте не указано конкретное значение массы.",
});
assert.match(String(massExtract || ""), /\b260\b/);

assert.equal(resolveExtractKind("От какого напряжения сети питается шкаф?", {}), "mains_power");
const voltageExtract = tryHonestContextualNumericFact({
  equipmentId: "sdb1560m",
  message: "От какого напряжения сети питается шкаф?",
  intent: {},
  promptChunks: [{ sourceDoc: "golden-facts-sdb1560m.md", content: goldenTable }],
  retrievalContext: "",
  priorAnswer: "В контексте нет данных.",
});
assert.match(String(voltageExtract || ""), /\b220\b/);
assert.doesNotMatch(String(voltageExtract || ""), /\b50\s*Гц/i);

const freqExtract = tryHonestContextualNumericFact({
  equipmentId: "sdb1560m",
  message: "Какая частота питающей сети указана в РЭ?",
  intent: {},
  promptChunks: [{ sourceDoc: "golden-facts-sdb1560m.md", content: goldenTable }],
  retrievalContext: "",
  priorAnswer: "Не указано.",
});
assert.match(String(freqExtract || ""), /\b50\b/);
assert.doesNotMatch(String(freqExtract || ""), /\b220\b/);

assert.equal(isUnverifiedVolumeLiterQuery("Какова масса базового исполнения SDB1560М?"), false);
assert.equal(answerAssertsUnverifiedVolumeLiters("**Внутренний объём** — **1 896 л**."), true);

const post = applySdb1560mPostGate({
  answer: "**Внутренний объём** SDB1560NM — **1 896 л**.",
  context: goldenTable,
  message: "Точный внутренний объём SDB1560M в литрах по PDF?",
  equipment: { id: "sdb1560m" },
});
assert.match(post.answer, /не указан/u);
assert.equal(answerAssertsUnverifiedVolumeLiters(post.answer), false);

console.log("test-sdb1560m-task35-hallucination-grounding: OK");
