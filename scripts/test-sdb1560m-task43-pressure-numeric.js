/**
 * Task 43 — integer claim vs source decimal (84 vs 84,0 кПа), evaluator-only scope.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const lib = require("./sdb1560m-eval-runner-lib");

const RF_84 = { claimPattern: "84" };
const SOURCE_LINE =
  "атмосферное давление 84,0 - 106,7 кПа (630 - 800 мм рт. ст.) (п. 1.1.2.12).";

const HTTP_ANSWER =
  "Нижняя граница атмосферного давления для эксплуатации Шкафа SDB1560M составляет 84,0 кПа.";

function testBoundedPattern() {
  const pat = lib.buildBoundedNumberPattern("84");
  const re = new RegExp(pat, "iu");
  assert.match("84 кПа", re);
  assert.match("84,0 кПа", re);
  assert.match("84.0 кПа", re);
  assert.doesNotMatch("840 кПа", re);
  assert.doesNotMatch("184 кПа", re);
  assert.doesNotMatch("84,5 кПа", re);
  assert.doesNotMatch("84.5 кПа", re);
}

function testEvaluateRequiredFact() {
  assert.equal(lib.evaluateRequiredFact(RF_84, HTTP_ANSWER).status, "pass");
  assert.equal(lib.evaluateRequiredFact(RF_84, "84 кПа").status, "pass");
  assert.equal(lib.evaluateRequiredFact(RF_84, "84.0 кПа").status, "pass");
  assert.equal(lib.evaluateRequiredFact({ claimPattern: "260" }, "Масса 260,5 кг").status, "fail");
  assert.equal(lib.evaluateRequiredFact(RF_84, "840 кПа").status, "fail");
  assert.equal(lib.evaluateRequiredFact(RF_84, "184 кПа").status, "fail");
}

function testGroundingOnSourceSegment() {
  const caseNorm = lib.normalizeCase({
    id: "gen.env.pressure-kpa-min",
    message: "Нижняя граница атмосферного давления для эксплуатации (кПа)?",
    category: "numeric_spec",
    expectedOutcome: { mode: "must_answer" },
    resolutionStatus: "ready",
    requiredFacts: [{ claimPattern: "84", sourceHint: "PDF п.1.1.2.12" }],
  });
  const cardPath = path.join(__dirname, "..", "knowledge", "sdb1560m", "retrieval-cards", "ambient-pressure.md");
  const cardText = fs.readFileSync(cardPath, "utf8");
  const { layers } = lib.evaluateCaseLayers(caseNorm, {
    answer: HTTP_ANSWER,
    sources: [
      { sourceDoc: "Руководство SDB1560NM.pdf", content: SOURCE_LINE },
      { sourceDoc: "retrieval-cards/ambient-pressure.md", content: cardText },
    ],
  });
  assert.equal(layers.factual.status, "pass", "factual");
  assert.equal(layers.grounding.status, "pass", "grounding");
}

function testUnrelatedEvidenceDoesNotGround() {
  const caseNorm = lib.normalizeCase({
    id: "test.pressure.unrelated",
    message: "Нижняя граница (кПа)?",
    category: "numeric_spec",
    expectedOutcome: { mode: "must_answer" },
    resolutionStatus: "ready",
    requiredFacts: [{ claimPattern: "84" }],
  });
  const { layers } = lib.evaluateCaseLayers(caseNorm, {
    answer: HTTP_ANSWER,
    sources: [{ sourceDoc: "other.pdf", content: "Давление азота на входе 6 бар (не атмосфера)." }],
  });
  assert.equal(layers.factual.status, "pass");
  assert.equal(layers.grounding.status, "fail");
}

function testTask32IntegerBoundaryPreserved() {
  const eight = lib.buildBoundedNumberPattern("8");
  assert.match("не более 8 Вт", new RegExp(eight, "iu"));
  assert.doesNotMatch("810 Вт", new RegExp(eight, "iu"));
  assert.equal(lib.evaluateRequiredFact({ claimPattern: "99.9" }, "99 мин").status, "fail");
  assert.equal(lib.evaluateRequiredFact({ claimPattern: "99.9" }, "максимум 99,9 мин").status, "pass");
}

function testTokenEquivalenceHelper() {
  assert.equal(lib.requiredNumericTokenEquivalent("84.0", "84"), true);
  assert.equal(lib.requiredNumericTokenEquivalent("84.5", "84"), false);
  assert.equal(lib.requiredNumericTokenEquivalent("840", "84"), false);
}

testBoundedPattern();
testEvaluateRequiredFact();
testGroundingOnSourceSegment();
testUnrelatedEvidenceDoesNotGround();
testTask32IntegerBoundaryPreserved();
testTokenEquivalenceHelper();

console.log("task43-pressure-numeric: OK");
