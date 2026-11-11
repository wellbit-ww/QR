/**
 * Task 39 — Priority B: dual W factual, grounding line join, RH extract satisfaction / replacement.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Required for honest contextual extract (same as eval runner / live stack).
process.env.RAG_HONEST_EQUIPMENT = process.env.RAG_HONEST_EQUIPMENT || "sdb1560m";

const {
  tryHonestContextualNumericFact,
  resolveExtractKind,
  extractSatisfiesQuery,
  priorAnswerFullyAnswersQuery,
  shouldReplaceWithExtract,
} = require("../src/rag/honest-contextual-extract");

const {
  evaluateRequiredFact,
  isDualDryRegenWFactPair,
  isRequiredFactGroundedInEvidence,
} = require("./sdb1560m-eval-runner-lib");

const root = path.join(__dirname, "..");
const golden = fs.readFileSync(path.join(root, "knowledge", "sdb1560m", "golden-facts-sdb1560m.md"), "utf8");
const setpointCard = fs.readFileSync(
  path.join(root, "knowledge", "sdb1560m", "retrieval-cards", "setpoint-vs-ambient.md"),
  "utf8",
);

const manualPower = `
SDB1560M SDB1560NM
1.1.2.7 в) режим осушения не более 40 Вт
1.1.2.7 г) с азотом и подогревом осушение не более 810 Вт
регенерации осушителя не более 540 Вт
`;

const dualOpts = { dualDryRegenWPair: true };

// --- P0: evaluator dual 40 + 540 W ---
const dryRegenAns =
  "Максимальная потребляемая мощность: в режиме **осушения** — **не более 40 Вт**, в режиме **регенерации** осушителя — **не более 540 Вт** (п. 1.1.2.7).";
assert.ok(isDualDryRegenWFactPair([{ claimPattern: "40", unit: "W" }, { claimPattern: "540", unit: "W" }]));
assert.equal(evaluateRequiredFact({ claimPattern: "40", unit: "W" }, dryRegenAns, dualOpts).status, "pass");
assert.equal(evaluateRequiredFact({ claimPattern: "540", unit: "W" }, dryRegenAns, dualOpts).status, "pass");

const swapped =
  "В режиме **осушения** — **не более 540 Вт**, в режиме **регенерации** осушителя — **не более 40 Вт**.";
assert.equal(evaluateRequiredFact({ claimPattern: "40", unit: "W" }, swapped, dualOpts).status, "fail");
assert.equal(evaluateRequiredFact({ claimPattern: "540", unit: "W" }, swapped, dualOpts).status, "fail");

const stray =
  "Осушение **40 Вт**, регенерация **540 Вт**, опционально **810 Вт** в осушении с азотом.";
assert.equal(evaluateRequiredFact({ claimPattern: "40", unit: "W" }, stray, dualOpts).status, "fail");

// Single-fact: 40 W vs 810 W must still contradict
assert.equal(
  evaluateRequiredFact({ claimPattern: "40", unit: "W" }, "40 Вт и 810 Вт с опциями").status,
  "fail",
);

// --- P1: grounding adjacent lines (evaluator) ---
const chunk =
  "Таблица 1.1\n" + "Размер высоты без учета светосигнальной колонны типа «Светофор»";
const rfHeight = { claimPattern: "без\\s+учета|не\\s+учитыва" };
const g1 = isRequiredFactGroundedInEvidence(rfHeight, { chunkTexts: [chunk], extractProvenance: null }, "без учета светофор.", true, false);
assert.equal(g1.grounded, true);

// --- P2: RH above 30 ---
const rhMsg = "Для уставки от 30 RH% и выше — не более RH окружающей минус сколько?";
assert.equal(resolveExtractKind(rhMsg, {}), "rh_setpoint_rule");

const rhExtract = String(
  tryHonestContextualNumericFact({
    equipmentId: "sdb1560m",
    message: rhMsg,
    intent: {},
    promptChunks: [{ sourceDoc: "golden-facts-sdb1560m.md", content: golden }],
    retrievalContext: `${golden}\n${setpointCard}`,
    parameterFactLlm: true,
    priorAnswer: "Диапазон 0–80 %RH без конкретики про уставку 30.",
  }) || "",
);
assert.match(rhExtract, /\b20\b/u);
assert.equal(extractSatisfiesQuery(rhMsg, "rh_setpoint_rule", rhExtract), true);

const badPrior =
  "Из контекста нет прямого указания на конкретное значение для уставки от 30 RH% и выше, но известно, что поддержание влажности рабочего объёма осуществляется в диапазоне 0–80 RH%.";
assert.equal(priorAnswerFullyAnswersQuery(rhMsg, "rh_setpoint_rule", badPrior), false);
const rhTemplate = String(
  tryHonestContextualNumericFact({
    equipmentId: "sdb1560m",
    message: rhMsg,
    intent: {},
    promptChunks: [{ sourceDoc: "golden-facts-sdb1560m.md", content: golden }],
    retrievalContext: `${golden}\n${setpointCard}`,
    parameterFactLlm: true,
    priorAnswer: badPrior,
  }) || "",
);
assert.match(rhTemplate, /\b20\b/u);

// Negative: below-30 rule question must not use rh_setpoint_rule extract as satisfying
const belowMsg = "Для уставки 0–30 RH% установка не выше какой величины относительно окружающей?";
assert.notEqual(resolveExtractKind(belowMsg, {}), "rh_setpoint_rule");

console.log("OK scripts/test-sdb1560m-task39-priority-b.js");
