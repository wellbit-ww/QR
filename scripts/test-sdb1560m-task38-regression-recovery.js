/**
 * Task 38 — base vs optional drying power, storage, Priority B extracts, eval-safe numerics.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("path");

const {
  tryHonestContextualNumericFact,
  resolveExtractKind,
  extractSatisfiesQuery,
  shouldReplaceWithExtract,
  dryingPowerWithOptions,
  isDryingPowerBaseQuery,
  dryingConfigurationIsOptional,
} = require("../src/rag/honest-contextual-extract");

const { evaluateRequiredFact } = require("./sdb1560m-eval-runner-lib");

const root = path.join(__dirname, "..");
const golden = fs.readFileSync(path.join(root, "knowledge", "sdb1560m", "golden-facts-sdb1560m.md"), "utf8");
const tableTtx = fs.readFileSync(
  path.join(root, "knowledge", "sdb1560m", "retrieval-cards", "table-1.1-ttx.md"),
  "utf8",
);
const setpointCard = fs.readFileSync(
  path.join(root, "knowledge", "sdb1560m", "retrieval-cards", "setpoint-vs-ambient.md"),
  "utf8",
);

const manualPower = `
SDB1560M SDB1560NM
1.1.2.7 в) режим осушения не более 40 Вт
1.1.2.7 г) с азотом и подогревом осушение не более 810 Вт
1.1.2.7 д) регенерации осушителя не более 540 Вт
1.1.2.7 а) хранение не более 8 Вт
1.1.2.12 от +15 до +35 °C окружающего воздуха не более 80 %RH
`;

const kitManual =
  "Регулируемые по высоте ножки, max. высота 50 мм — 4 шт. SDB1560M";

const n2Corpus = `
SDB1560NM опция азота
диапазон установки времени подачи азота от 0 до 99,9 минут
расход азота 3–30 л/мин
порогового значения концентрации азота 78–98,0 % ±1 %
`;

const honestEnv = process.env.RAG_HONEST_EQUIPMENT;
process.env.RAG_HONEST_EQUIPMENT = "sdb1560m";

function run(message, corpusExtra, prior = "") {
  const corpus = `${golden}\n${tableTtx}\n${manualPower}\n${kitManual}\n${n2Corpus}\n${setpointCard}\n${corpusExtra || ""}`;
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

const expBaseDry = "Мощность в режиме осушения без опций?";
const genOpt810 =
  "Максимальная мощность в режиме осушения с опциями азота и подогрева для SDB1560М?";
const storageBase = "Сколько ватт в режиме хранения?";

// --- P0: «без опций» must not trigger optional 810 W routing ---
assert.equal(dryingConfigurationIsOptional(expBaseDry), false);
assert.equal(dryingPowerWithOptions(expBaseDry), false);
assert.equal(isDryingPowerBaseQuery(expBaseDry), true);
assert.equal(resolveExtractKind(expBaseDry, {}), "power_drying");
const baseDryAns = String(run(expBaseDry, "", "810 Вт с опциями") || "");
assert.match(baseDryAns, /40/);
assert.match(baseDryAns, /Вт/);
assert.doesNotMatch(baseDryAns, /\b810\b/);
assert.equal(
  evaluateRequiredFact({ claimPattern: "40", unit: "W" }, baseDryAns, { forbiddenClaims: [{ pattern: "810" }] })
    .status,
  "pass",
);

// Explicit optional drying: 810 W still routed and satisfied
assert.equal(dryingConfigurationIsOptional(genOpt810), true);
assert.equal(resolveExtractKind(genOpt810, {}), "power_drying_opt");
const opt810 = String(run(genOpt810, "", "Система подачи азота не входит в базовый состав") || "");
assert.match(opt810, /\b810\b/);
assert.match(opt810, /осуш/i);
assert.equal(evaluateRequiredFact({ claimPattern: "810", unit: "W" }, opt810, {}).status, "pass");

// Base dry must not be replaced by a prior that only states 810 W
assert.equal(shouldReplaceWithExtract("power_drying", expBaseDry, "не более 810 Вт", baseDryAns), true);

// Storage base 8 W unchanged; optional storage line uses existing path
assert.equal(resolveExtractKind(storageBase, {}), "power_storage");
const stor8 = String(run(storageBase, "", "не указано") || "");
assert.match(stor8, /\b8\s*Вт/i);
assert.doesNotMatch(stor8, /\b810\b/);

// --- P1: dry + regen extract (deterministic evaluator: two distinct W claims in one answer always contradict) ---
const dryRegenMsg = "Максимальная мощность в осушении и в регенерации для SDB1560М?";
assert.equal(resolveExtractKind(dryRegenMsg, {}), "power_dry_regen");
const dryRegenAns = String(run(dryRegenMsg, "", "не более 540 Вт") || "");
assert.match(dryRegenAns, /40/);
assert.match(dryRegenAns, /540/);

// --- N2 sensor max: assert standalone 98 for max-focused question ---
const n2MaxMsg = "Максимальный порог концентрации азота с датчиком?";
const n2MaxAns = String(run(n2MaxMsg, "", "") || "");
assert.match(n2MaxAns, /\b98\b/);
assert.equal(evaluateRequiredFact({ claimPattern: "98" }, n2MaxAns, {}).status, "pass");

// --- RH rule above 30: standalone 20 ---
const rhAboveMsg = "Для уставки от 30 RH% и выше — не более RH окружающей минус сколько?";
const rhAboveAns = String(run(rhAboveMsg, "", "не более 80 %RH") || "");
assert.match(rhAboveAns, /\b20\b/);
assert.equal(evaluateRequiredFact({ claimPattern: "20" }, rhAboveAns, {}).status, "pass");

// --- Height table note: card + extract ---
const heightMsg = "Учитывается ли светосигнальная колонна «Светофор» в высоте из Таблицы 1.1?";
assert.equal(resolveExtractKind(heightMsg, {}), "height_table_note");
const heightAns = String(run(heightMsg, "", "неизвестно") || "");
assert.match(heightAns, /без\s+учета/i);
assert.equal(
  evaluateRequiredFact({ claimPattern: "без\\s+учета|не\\s+учитыва" }, heightAns, {}).status,
  "pass",
);

// --- Task 37 preserved cases (smoke via satisfaction + one run each) ---
const t37Cases = [
  ["С какой погрешностью указаны габариты в Таблице 1.1?", "dim_tolerance", /±\s*5|5\s*мм/],
  ["Максимальная высота регулируемых ножек?", "kit_feet", /\b50\b/],
  ["Верхний предел установки времени подачи азота без датчика (мин)?", "n2_option", /99[,.]9/],
  ["Допустимые температура и RH окружающего воздуха при эксплуатации?", "ambient_temp_rh", /\b80\b/],
  ["Диапазон расхода азота для опции (л/мин)?", "n2_option", /\b3\b.*\b30\b|\b30\b.*\b3\b/s],
];
for (const [msg, kind, re] of t37Cases) {
  assert.equal(resolveExtractKind(msg, {}), kind);
  const out = String(run(msg, "", "см. документацию") || "");
  assert.match(out, re);
}

if (honestEnv === undefined) {
  delete process.env.RAG_HONEST_EQUIPMENT;
} else {
  process.env.RAG_HONEST_EQUIPMENT = honestEnv;
}
console.log("OK scripts/test-sdb1560m-task38-regression-recovery.js");
