/**
 * Offline coverage: все eval-формулировки + синонимы должны попадать в ожидаемый golden key.
 * node scripts/test-sdb1106nm-golden-router-coverage.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  resolveGoldenFactMatch,
  isHighConfidenceDeterministic,
} = require("../src/rag/sdb1106nm-golden-facts");

const ROOT = path.join(__dirname, "..");
const COVERAGE = JSON.parse(
  fs.readFileSync(path.join(ROOT, "data", "golden-router-variants.json"), "utf8")
);
const MANUAL = JSON.parse(
  fs.readFileSync(path.join(ROOT, "data", "eval-manual-docx-rag.json"), "utf8")
);
const PARITY = JSON.parse(
  fs.readFileSync(path.join(ROOT, "data", "eval-sdb1106nm-parity.json"), "utf8")
);
const ADHOC = JSON.parse(
  fs.readFileSync(path.join(ROOT, "data", "eval-adhoc-paraphrase-rag.json"), "utf8")
);

function indexById(items) {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}

const manualById = indexById(MANUAL.items || []);
const parityById = indexById(PARITY.items || []);
const adhocById = indexById(ADHOC.items || []);

function assertExpectation(item) {
  const history = item.history || [];
  const match = resolveGoldenFactMatch(item.question, history);

  if (item.expectNoDeterministic) {
    if (!match) {
      return;
    }
    assert.strictEqual(
      isHighConfidenceDeterministic(match),
      false,
      `[${item.id}] should not bypass RAG: ${item.question} -> ${match.key}`
    );
    return;
  }

  assert.ok(match, `[${item.id}] expected match: ${item.question}`);
  assert.strictEqual(match.key, item.expectKey, `[${item.id}] key mismatch`);
  assert.strictEqual(
    isHighConfidenceDeterministic(match),
    true,
    `[${item.id}] expected high confidence`
  );
}

let total = 0;

for (const row of COVERAGE.manualDocxExpectations || []) {
  const src = manualById[row.sourceId];
  assert.ok(src, `missing manual item ${row.sourceId}`);
  assertExpectation({
    id: `manual:${row.sourceId}`,
    question: src.question,
    expectKey: row.expectKey,
    expectNoDeterministic: row.expectNoDeterministic,
  });
  total += 1;
}

for (const row of COVERAGE.parityExpectations || []) {
  const src = parityById[row.sourceId];
  assert.ok(src, `missing parity item ${row.sourceId}`);
  assertExpectation({
    id: `parity:${row.sourceId}`,
    question: src.question,
    history: src.history,
    expectKey: row.expectKey,
    expectNoDeterministic: row.expectNoDeterministic,
  });
  total += 1;
}

for (const row of COVERAGE.adhocParaphraseExpectations || []) {
  const src = adhocById[row.sourceId];
  assert.ok(src, `missing adhoc item ${row.sourceId}`);
  assertExpectation({
    id: `adhoc:${row.sourceId}`,
    question: src.question,
    expectKey: row.expectKey,
    expectNoDeterministic: row.expectNoDeterministic,
  });
  total += 1;
}

for (const [expectKey, questions] of Object.entries(COVERAGE.variants || {})) {
  questions.forEach((question, idx) => {
    assertExpectation({
      id: `variant:${expectKey}:${idx + 1}`,
      question,
      expectKey,
    });
    total += 1;
  });
}

console.log(`OK: golden router coverage passed (${total} cases)`);
