/**
 * Task 37 — contextual extract routing, satisfaction, replacement (Priority B cases).
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  tryHonestContextualNumericFact,
  resolveExtractKind,
  shouldReplaceWithExtract,
  extractSatisfiesQuery,
  priorAnswerFullyAnswersQuery,
} = require("../src/rag/honest-contextual-extract");

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
регенерации осушителя не более 540 Вт
1.1.2.12 от +15 до +35 °C окружающего воздуха не более 80 %RH
`;

const kitManual = "Регулируемые по высоте ножки, max. высота 50 мм — 4 шт. SDB1560M";
const heightNote =
  "Размеры даны с погрешностью ± 5мм. Размер высоты без учета светосигнальной колонны типа «Светофор» (опция);";

const n2Corpus = `
SDB1560NM опция азота
диапазон установки времени подачи азота от 0 до 99,9 минут
расход азота 3–30 л/мин
порогового значения концентрации азота 78–98,0 % ±1 %
`;

const honestEnv = process.env.RAG_HONEST_EQUIPMENT;
process.env.RAG_HONEST_EQUIPMENT = "sdb1560m";

function run(message, corpusExtra, prior = "") {
  const corpus = `${golden}\n${tableTtx}\n${manualPower}\n${kitManual}\n${heightNote}\n${n2Corpus}\n${setpointCard}\n${corpusExtra || ""}`;
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

// --- Routing ---
assert.equal(resolveExtractKind("С какой погрешностью указаны габариты в Таблице 1.1?", {}), "dim_tolerance");
assert.equal(
  resolveExtractKind("Максимальная высота регулируемых ножек?", {}),
  "kit_feet",
);
assert.equal(
  resolveExtractKind(
    "Учитывается ли светосигнальная колонна «Светофор» в высоте из Таблицы 1.1?",
    {},
  ),
  "height_table_note",
);
assert.equal(
  resolveExtractKind(
    "Максимальная мощность в режиме осушения с опциями азота и подогрева для SDB1560М?",
    {},
  ),
  "power_drying_opt",
);
assert.equal(
  resolveExtractKind("Максимальная мощность в осушении и в регенерации для SDB1560М?", {}),
  "power_dry_regen",
);
assert.equal(
  resolveExtractKind("Допустимые температура и RH окружающего воздуха при эксплуатации?", {}),
  "ambient_temp_rh",
);
assert.equal(
  resolveExtractKind("Диапазон расхода азота для опции (л/мин)?", {}),
  "n2_option",
);
assert.equal(
  resolveExtractKind("Для уставки от 30 RH% и выше — не более RH окружающей минус сколько?", {}),
  "rh_setpoint_rule",
);

// --- Replacement: wrong prior dimensions must not block tolerance extract ---
const dimPrior = "**Габариты** SDB1560NM (Ш×В×Г) — **1202 × 1693 × 1028 мм** (табл. 1.1).";
assert.equal(
  priorAnswerFullyAnswersQuery("С какой погрешностью указаны габариты в Таблице 1.1?", "dimensions", dimPrior),
  false,
);
const tol = String(run("С какой погрешностью указаны габариты в Таблице 1.1?", "", dimPrior) || "");
assert.match(tol, /±\s*5|5\s*мм/);

// --- Feet height ---
const feet = String(run("Максимальная высота регулируемых ножек?", "", dimPrior) || "");
assert.match(feet, /\b50\b/);

// --- Height signal note ---
const hNote = String(
  run("Учитывается ли светосигнальная колонна «Светофор» в высоте из Таблицы 1.1?", "", dimPrior) || "",
);
assert.match(hNote, /без\s+учета/i);

// --- Power drying opt810 ---
const pwrDry = String(
  run(
    "Максимальная мощность в режиме осушения с опциями азота и подогрева для SDB1560М?",
    "",
    "Система подачи азота не входит в базовый состав",
  ) || "",
);
assert.match(pwrDry, /\b810\b/);
assert.match(pwrDry, /осуш/i);

// --- Dry + regen multi ---
const pwrMulti = String(
  run("Максимальная мощность в осушении и в регенерации для SDB1560М?", "", "не более 540 Вт") || "",
);
assert.match(pwrMulti, /\b40\b/);
assert.match(pwrMulti, /\b540\b/);

// --- Ambient temp + RH ---
const amb = String(
  run("Допустимые температура и RH окружающего воздуха при эксплуатации?", "", "от +15 до +35 °C") || "",
);
assert.match(amb, /\b80\b/);

// --- N2 timer (без датчика must not satisfy sensor branch) ---
const timerMsg = "Верхний предел установки времени подачи азота без датчика (мин)?";
assert.equal(
  extractSatisfiesQuery(timerMsg, "n2_option", "от 0 до 99 минут без датчика"),
  false,
);
const timerAns = String(run(timerMsg, "", "от 0 до 99 минут") || "");
assert.match(timerAns, /99[,.]9/);

// --- N2 sensor max ---
const sensMsg = "Максимальный порог концентрации азота с датчиком (%)";
const sensPrior = "С датчиком азота порог — 78–98,0 %";
assert.equal(
  shouldReplaceWithExtract("n2_option", sensMsg, sensPrior, "78–98,0 % with 98 max focus"),
  false,
);
assert.equal(extractSatisfiesQuery(sensMsg, "n2_option", sensPrior), true);

// --- N2 flow range ---
const flow = String(run("Диапазон расхода азота для опции (л/мин)?", "", "азот опция") || "");
assert.match(flow, /\b3\b/);
assert.match(flow, /\b30\b/);

// --- RH setpoint rule above 30 ---
const rhRule = String(
  run("Для уставки от 30 RH% и выше — не более RH окружающей минус сколько?", "", "не более 80 %RH") || "",
);
assert.match(rhRule, /\b20\b/);

// --- Mains regression (Task 36) ---
const mains = String(run("От какого напряжения сети питается шкаф?", "", "не указан") || "");
assert.match(mains, /\b220\b/);

process.env.RAG_HONEST_EQUIPMENT = honestEnv;
console.log("OK scripts/test-sdb1560m-task37-contextual-extract.js");
