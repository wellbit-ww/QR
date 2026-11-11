/**
 * Task 32 — grounding evidence segments, decimal normalization, trace provenance.
 */
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const lib = require("./sdb1560m-eval-runner-lib");

const MASS_CASE = {
  id: "test.mass.ground",
  message: "Какой вес?",
  category: "numeric_spec",
  expectedOutcome: { mode: "must_answer" },
  resolutionStatus: "ready",
  requiredFacts: [{ claimPattern: "260", unit: "kg", factId: "F-MASS" }],
};

function testDecimalNormalization() {
  const pat = lib.buildBoundedNumberPattern("99.9");
  assert.match("99,9 мин", new RegExp(pat, "iu"));
  assert.match("99.9 min", new RegExp(pat, "iu"));
  assert.doesNotMatch("99 мин", new RegExp(pat, "iu"));
  assert.doesNotMatch("199,9", new RegExp(pat, "iu"));
  const eight = lib.buildBoundedNumberPattern("8");
  assert.match("не более 8 Вт", new RegExp(eight, "iu"));
  assert.doesNotMatch("810 Вт", new RegExp(eight, "iu"));
  const rf = { claimPattern: "99.9", unit: "min" };
  assert.equal(lib.evaluateRequiredFact(rf, "максимум 99,9 мин").status, "pass");
  assert.equal(lib.evaluateRequiredFact(rf, "99 мин").status, "fail");
}

function testGoldenFactsMassLineGrounding() {
  const rf = { claimPattern: "260", unit: "kg" };
  const tableLine = "| Масса | 260 кг | Таблица 1.1 |";
  assert.equal(lib.evaluateRequiredFact(rf, tableLine).status, "pass");
}

function testGroundingPerChunkNotJoinedHay() {
  const c = lib.normalizeCase(MASS_CASE);
  const chunkA = "| Масса | 260 кг |";
  const chunkB = "| Нагрузка на полку | 100 кг |";
  const { layers } = lib.evaluateCaseLayers(c, {
    answer: "**260 кг**",
    sources: [
      { sourceDoc: "golden-facts-sdb1560m.md", content: chunkA },
      { sourceDoc: "golden-facts-sdb1560m.md", content: chunkB },
    ],
  });
  assert.equal(layers.factual.status, "pass");
  assert.equal(layers.grounding.status, "pass");
}

function testUnsupportedNumericNotGrounded() {
  const c = lib.normalizeCase({
    ...MASS_CASE,
    forbiddenClaims: [{ pattern: "180", leakageModel: "sdb1106-nm" }],
  });
  const { layers } = lib.evaluateCaseLayers(c, {
    answer: "Масса 180 кг",
    sources: [{ sourceDoc: "x.pdf", content: "| Масса | 260 кг |" }],
  });
  assert.equal(layers.factual.status, "fail");
  assert.equal(layers.grounding.status, "pass");
}

function testExtractProvenanceGrounding() {
  const c = lib.normalizeCase(MASS_CASE);
  const { layers } = lib.evaluateCaseLayers(c, {
    answer: "Масса 260 кг",
    sources: [{ sourceDoc: "card.md", content: "общие сведения без числа" }],
    ragTrace: {
      llm: {
        contextualExtract: {
          applied: true,
          kind: "mass",
          extractPreview: "Масса шкафа — 260 кг (табл. 1.1).",
          groundingCorpusExcerpt: "| Масса | 260 кг | Таблица 1.1 |",
          corpusSourceDocs: ["Руководство SDB1560NM.pdf"],
        },
      },
    },
  });
  assert.equal(layers.factual.status, "pass");
  assert.equal(layers.grounding.status, "pass");
}

function testMissingProvenanceExtractFailsGrounding() {
  const c = lib.normalizeCase(MASS_CASE);
  const { layers } = lib.evaluateCaseLayers(c, {
    answer: "Масса 260 кг",
    sources: [{ sourceDoc: "card.md", content: "нет массы" }],
    ragTrace: {
      llm: {
        contextualExtract: {
          applied: true,
          kind: "mass",
          extractPreview: "Масса 260 кг",
        },
      },
    },
  });
  assert.equal(layers.factual.status, "pass");
  assert.equal(layers.grounding.status, "fail");
  assert.match(layers.grounding.detail, /missing|not found|corpus/i);
}

function testPartialMultiFactGrounding() {
  const c = lib.normalizeCase({
    ...MASS_CASE,
    requiredFacts: [
      { claimPattern: "260", unit: "kg" },
      { claimPattern: "1202" },
    ],
  });
  const { layers } = lib.evaluateCaseLayers(c, {
    answer: "260 кг, ширина 1202 мм",
    sources: [
      { sourceDoc: "a", content: "| Масса | 260 кг |" },
      { sourceDoc: "b", content: "ширина 1202 мм" },
    ],
  });
  assert.equal(layers.grounding.status, "pass");
  const fail = lib.evaluateCaseLayers(c, {
    answer: "260 кг, ширина 1202 мм",
    sources: [{ sourceDoc: "a", content: "| Масса | 260 кг |" }],
  });
  assert.equal(fail.layers.grounding.status, "fail");
}

function testNoChunkBodiesGroundingNotEvaluable() {
  const c = lib.normalizeCase(MASS_CASE);
  const { layers } = lib.evaluateCaseLayers(c, {
    answer: "260 кг",
    sources: [{ sourceDoc: "Руководство SDB1560NM.pdf" }],
  });
  assert.equal(layers.grounding.status, "not_evaluable");
}

function testTask27N2TimerFactual() {
  const c = lib.normalizeCase({
    id: "exp.num.n2-timer-99",
    message: "таймер",
    category: "numeric_spec",
    expectedOutcome: { mode: "must_answer" },
    resolutionStatus: "ready",
    requiredFacts: [{ claimPattern: "99.9", unit: "min", factId: "F-N2-TIMER" }],
  });
  const { layers } = lib.evaluateCaseLayers(c, {
    answer: "Время подачи азота без датчика — до 99,9 мин.",
    sources: [
      {
        sourceDoc: "nitrogen-option.md",
        content: "максимальное время до 99,9 мин без датчика",
      },
    ],
  });
  assert.equal(layers.factual.status, "pass");
  assert.equal(layers.grounding.status, "pass");
}

function testN2TonAnswerNotConflicting() {
  const rf = { claimPattern: "99.9", unit: "min" };
  const answer =
    "Максимальное значение таймера подачи азота **без датчика** (N2Ton) — **99,9 мин** (диапазон **0–99,9 мин**, п. 1.2.2).";
  assert.equal(lib.evaluateRequiredFact(rf, answer).status, "pass");
}

function testDryPowerTableRowGrounding() {
  const line =
    "| Мощность в режиме осушения (группа 1106/1560) | не более 40 Вт | Раздел 1.1 |";
  const rf = { claimPattern: "40", unit: "W" };
  assert.equal(lib.evaluateRequiredFact(rf, line).status, "pass");
  const c = lib.normalizeCase({
    id: "test.dry.40",
    message: "осушение",
    category: "numeric_spec",
    expectedOutcome: { mode: "must_answer" },
    resolutionStatus: "ready",
    requiredFacts: [rf],
  });
  const { layers } = lib.evaluateCaseLayers(c, {
    answer: "не более 40 Вт",
    sources: [{ sourceDoc: "golden-facts-sdb1560m.md", content: line }],
  });
  assert.equal(layers.grounding.status, "pass");
}

function testModelGroupCatalogNumeric() {
  const line = "| группа 1106/1560 | не более 40 Вт |";
  assert.equal(
    lib.isModelGroupCatalogNumeric(line, line.indexOf("1106"), 4),
    true,
  );
}

function main() {
  testDecimalNormalization();
  testGoldenFactsMassLineGrounding();
  testGroundingPerChunkNotJoinedHay();
  testUnsupportedNumericNotGrounded();
  testExtractProvenanceGrounding();
  testMissingProvenanceExtractFailsGrounding();
  testPartialMultiFactGrounding();
  testNoChunkBodiesGroundingNotEvaluable();
  testTask27N2TimerFactual();
  testN2TonAnswerNotConflicting();
  testDryPowerTableRowGrounding();
  testModelGroupCatalogNumeric();
  console.log("test-sdb1560m-task32-grounding: OK");
}

main();
