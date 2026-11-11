/**
 * Task 25 — offline checks for seven control queries (honest contextual extract + off-topic).
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
  ragPureSdb1560NeedsFactRetry,
} = require("../src/rag/honest-rag-mode");
const { isSdb1560mHumidityWaitQuery } = require("../src/rag/sdb1560m-rag-priority");
const { tryDeterministicSdb1560mAnswer } = require("../src/rag/sdb1560m-direct-facts");

const goldenPath = path.join(__dirname, "..", "knowledge", "sdb1560m", "golden-facts-sdb1560m.md");
const golden = fs.readFileSync(goldenPath, "utf8");
const corpus = `${golden}\nРуководство SDB1560NM.pdf п. 1.1.2.7 не более 8 Вт хранение\n810 Вт SDB1560М с опциями\n1.1.2.12 температура окружающего воздуха от +15 до +35 °C\n1.1.4.3.3 зеленый световой сигнал и мигающий красный режим Осушения\n1.1.4.3.2 символ W подогрев воздуха\n1.1.4.4.1 вентилятор осушителя открытой двери 60 мин\n`;

const honestEnv = process.env.RAG_HONEST_EQUIPMENT;
process.env.RAG_HONEST_EQUIPMENT = "sdb1560m";

function extract(message, prior = "wrong LLM answer") {
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

assert.equal(resolveExtractKind("Сколько ватт в режиме хранения?", {}), "power_storage");
assert.match(String(extract("Сколько ватт в режиме хранения?", "не более 810 Вт") || ""), /\b8\s*Вт/u);
assert.doesNotMatch(String(extract("Сколько ватт в режиме хранения?", "не более 810 Вт") || ""), /\b810\b/u);

assert.equal(resolveExtractKind("Какой диапазон влажности поддерживает шкаф?", {}), "rh_range");
assert.match(String(extract("Какой диапазон влажности поддерживает шкаф?", "30%") || ""), /0.*80/u);

assert.ok(isSdb1560mHumidityWaitQuery("Долго выходит на влажность после включения?"));
assert.equal(resolveExtractKind("Долго выходит на влажность после включения?", {}), "warmup");
assert.match(String(extract("Долго выходит на влажность после включения?", "не указано") || ""), /180/u);

assert.equal(
  resolveExtractKind("При какой температуре помещения можно эксплуатировать шкаф?", {}),
  "ambient_temp",
);
assert.match(
  String(
    extract("При какой температуре помещения можно эксплуатировать шкаф?", "+15 только") || "",
  ),
  /35/u,
);

assert.match(
  String(extract("Красная лампа мигает — что означает?", "нет информации") || ""),
  /Осушен|осушен/i,
);
assert.match(String(extract("На дисплее W — это ошибка?", "не ошибка") || ""), /подогрев/i);
assert.match(
  String(extract("После загрузки влажность выросла — это нормально?", "да") || ""),
  /1\.1\.4\.4\.1|вентилятор/i,
);

assert.equal(
  ragPureSdb1560AnswerOffTopic("Сколько ватт в режиме хранения?", "не более 810 Вт"),
  true,
);
assert.equal(
  ragPureSdb1560NeedsFactRetry(
    "Сколько ватт в режиме хранения?",
    "не более 810 Вт",
    {},
    corpus,
  ),
  true,
);

const det = tryDeterministicSdb1560mAnswer("Сколько ватт в режиме хранения?", {});
assert.match(String(det || ""), /\b8\s*Вт/u);

if (honestEnv === undefined) {
  delete process.env.RAG_HONEST_EQUIPMENT;
} else {
  process.env.RAG_HONEST_EQUIPMENT = honestEnv;
}

console.log("test-sdb1560m-task25-rag-control: ok");
