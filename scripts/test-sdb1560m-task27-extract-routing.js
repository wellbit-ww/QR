/**
 * Task 27 — extract kind routing, scope guards, safe replacement (RAG_PURE).
 */
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  tryHonestContextualNumericFact,
  resolveExtractKind,
  shouldReplaceWithExtract,
} = require("../src/rag/honest-contextual-extract");

const root = path.join(__dirname, "..");
const golden = fs.readFileSync(path.join(root, "knowledge", "sdb1560m", "golden-facts-sdb1560m.md"), "utf8");
const cardsDir = path.join(root, "knowledge", "sdb1560m", "retrieval-cards");
const redCard = fs.readFileSync(path.join(cardsDir, "red-lamp.md"), "utf8");
const wCard = fs.readFileSync(path.join(cardsDir, "yellow-and-w.md"), "utf8");
const doorCard = fs.readFileSync(path.join(cardsDir, "door-close-dry.md"), "utf8");
const ambientCard = fs.readFileSync(path.join(cardsDir, "ambient-temp.md"), "utf8");

const manualRh = `
SDB1560NM таблица 1.1
Шаг установки влажности 0,1 RH% п. 1.1.2.2
1.1.2.4 выход на влажность не более 180 минут
1.1.2.12 относительная влажность окружающего воздуха не более 80 %RH
1.1.2.7 а) хранение не более 8 Вт
1.1.2.7 b) с азотом и подогревом 810 Вт хранение
1202 x 1693 x 1028 масса 260 кг
`;

const honestEnv = process.env.RAG_HONEST_EQUIPMENT;
process.env.RAG_HONEST_EQUIPMENT = "sdb1560m";

function run(message, corpusExtra, prior) {
  const corpus = `${golden}\n${manualRh}\n${corpusExtra || ""}`;
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

// --- Task 26 regressions ---
assert.equal(resolveExtractKind("С каким шагом можно выставить влажность?", {}), "rh_step");
const rhStep = String(run("С каким шагом можно выставить влажность?", "", "параметр не указан") || "");
assert.match(rhStep, /0[,.]1/);

assert.equal(resolveExtractKind("Масса и ширина шкафа SDB1560M?", {}), "mass_and_dimensions");
const multi = String(
  run("Масса и ширина шкафа SDB1560M?", "", "**Габариты** SDB1560NM — **1202 × 1693 × 1028 мм**.") || "",
);
assert.match(multi, /\b260\b/);
assert.match(multi, /\b1202\b/);
assert.equal(
  shouldReplaceWithExtract(
    "dimensions",
    "Масса и ширина шкафа SDB1560M?",
    "Масса 260 кг, ширина 1202 мм",
    "**Габариты** only",
  ),
  false,
);

const rhAmbMsg = "Какая максимальная относительная влажность окружающего воздуха допускается?";
assert.equal(resolveExtractKind(rhAmbMsg, {}), "rh_ambient_max");
assert.notEqual(resolveExtractKind(rhAmbMsg, {}), "ambient_temp");
const rhAmb = String(run(rhAmbMsg, ambientCard, "от +15 до +35 °C") || "");
assert.match(rhAmb, /\b80\b/);
assert.doesNotMatch(rhAmb, /\+?\s*15[^\n]{0,8}\+?\s*35/);

const pwrOptMsg = "Мощность в режиме хранения с азотом и подогревом?";
assert.equal(resolveExtractKind(pwrOptMsg, {}), "power_storage_opt");
const pwrOpt = String(run(pwrOptMsg, "", "не более 8 Вт") || "");
assert.match(pwrOpt, /\b810\b/);
assert.doesNotMatch(pwrOpt, /не\s+более\s+8\s*Вт/);

// --- Task 25 controls ---
assert.equal(resolveExtractKind("Сколько ватт в режиме хранения?", {}), "power_storage");
const pwr8 = String(run("Сколько ватт в режиме хранения?", "", "810 Вт") || "");
assert.match(pwr8, /\b8\s*Вт/i);
assert.doesNotMatch(pwr8, /\b810\b/);

assert.equal(resolveExtractKind("Какой диапазон влажности поддерживает шкаф?", {}), "rh_range");
assert.match(String(run("Какой диапазон влажности поддерживает шкаф?", "", "30%") || ""), /0.*80/u);

assert.match(
  String(run("Долго выходит на влажность после включения?", "", "не указано") || ""),
  /180/u,
);
assert.match(
  String(run("При какой температуре помещения можно эксплуатировать шкаф?", ambientCard, "+15 только") || ""),
  /35/u,
);

// --- Task 26 alarms ---
assert.match(
  String(run("Красная лампа мигает — что означает?", redCard, "нет в контексте") || ""),
  /Осушен/i,
);
assert.match(
  String(run("После загрузки влажность выросла — это нормально?", doorCard, "да нормально") || ""),
  /1\.1\.4\.4\.1/,
);
assert.match(
  String(run("На дисплее W — это ошибка?", wCard, "вероятнее всего") || ""),
  /подогрев/i,
);

// Negative: RH step must not get RH range only
assert.doesNotMatch(rhStep, /0\s*[–\-]\s*80/);

if (honestEnv === undefined) {
  delete process.env.RAG_HONEST_EQUIPMENT;
} else {
  process.env.RAG_HONEST_EQUIPMENT = honestEnv;
}

console.log("test-sdb1560m-task27-extract-routing: ok");
