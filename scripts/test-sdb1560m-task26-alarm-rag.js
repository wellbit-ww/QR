/**
 * Task 26 — alarm / troubleshooting contextual extract + off-topic reground signals.
 */
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  tryHonestContextualNumericFact,
  resolveExtractKind,
} = require("../src/rag/honest-contextual-extract");
const {
  ragPureSdb1560AnswerOffTopic,
  isSpuriousModelAbstainAnswer,
} = require("../src/rag/honest-rag-mode");

const cardsDir = path.join(__dirname, "..", "knowledge", "sdb1560m", "retrieval-cards");
const redCard = fs.readFileSync(path.join(cardsDir, "red-lamp.md"), "utf8");
const wCard = fs.readFileSync(path.join(cardsDir, "yellow-and-w.md"), "utf8");
const doorCard = fs.readFileSync(path.join(cardsDir, "door-close-dry.md"), "utf8");
const goldenPath = path.join(__dirname, "..", "knowledge", "sdb1560m", "golden-facts-sdb1560m.md");
const golden = fs.readFileSync(goldenPath, "utf8");

const honestEnv = process.env.RAG_HONEST_EQUIPMENT;
process.env.RAG_HONEST_EQUIPMENT = "sdb1560m";

function extract(message, corpusExtra, prior = "wrong LLM answer") {
  const corpus = `${golden}\n${corpusExtra}`;
  return tryHonestContextualNumericFact({
    equipmentId: "sdb1560m",
    message,
    intent: {},
    promptChunks: [{ sourceDoc: "golden-facts-sdb1560m.md", content: golden }],
    retrievalContext: corpus,
    parameterFactLlm: true,
    priorAnswer: prior,
  });
}

const redMsg = "Красная лампа мигает — что означает?";
assert.equal(resolveExtractKind(redMsg, {}), "indicator_drying");
const redAns = String(extract(redMsg, redCard, "В предоставленном контексте нет информации") || "");
assert.match(redAns, /Осушен/i);
assert.match(redAns, /1\.1\.4\.3\.3/);

const loadMsg = "После загрузки влажность выросла — это нормально?";
assert.equal(resolveExtractKind(loadMsg, {}), "load_humidity");
const loadAns = String(extract(loadMsg, doorCard, "Да, это нормально. Шкаф поддерживает влажность ±1RH%.") || "");
assert.match(loadAns, /1\.1\.4\.4\.1/);
assert.match(loadAns, /вентилятор/i);
assert.match(loadAns, /открыт/i);
assert.match(loadAns, /60\s*±/);

const wMsg = "На дисплее W — это ошибка?";
assert.equal(resolveExtractKind(wMsg, {}), "w_symbol");
const wAns = String(
  extract(wMsg, wCard, 'На дисплее символ "W" не является ошибкой, но для точного определения нужно руководство.') || "",
);
assert.match(wAns, /подогрев/i);
assert.match(wAns, /1\.1\.4\.3\.2/);
assert.doesNotMatch(wAns, /\b810\b/);

const powerMsg = "Сколько ватт в режиме хранения?";
assert.notEqual(resolveExtractKind(powerMsg, {}), "w_symbol");
const powerCorpus = `${golden}\n810 Вт с опциями\n8 Вт хранение`;
const powerExtract = extract(powerMsg, powerCorpus, "810 Вт");
assert.doesNotMatch(String(powerExtract || ""), /подогрев.*W.*ошибк/i);

assert.equal(
  ragPureSdb1560AnswerOffTopic(loadMsg, "Да, это нормально. Точность ±1 RH%."),
  true,
);
assert.equal(
  ragPureSdb1560AnswerOffTopic(redMsg, "В предоставленном контексте нет информации о красной лампе."),
  true,
);
assert.equal(
  isSpuriousModelAbstainAnswer('Вероятнее всего, это индикатор режима, но для точного определения нужно руководство.'),
  true,
);

if (honestEnv === undefined) {
  delete process.env.RAG_HONEST_EQUIPMENT;
} else {
  process.env.RAG_HONEST_EQUIPMENT = honestEnv;
}

console.log("test-sdb1560m-task26-alarm-rag: ok");
