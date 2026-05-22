/**
 * Offline routing regression for ad-hoc paraphrases.
 * node scripts/test-sdb1106nm-golden-router-paraphrase.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  resolveGoldenFactMatch,
  isHighConfidenceDeterministic,
  formatGoldenFactAnswer,
} = require("../src/rag/sdb1106nm-golden-facts");

const DATASET = path.join(__dirname, "..", "data", "eval-adhoc-paraphrase-rag.json");
const dataset = JSON.parse(fs.readFileSync(DATASET, "utf8"));
const items = (dataset.items || []).filter((item) => item.expectKey);

let passed = 0;
for (const item of items) {
  const match = resolveGoldenFactMatch(item.question);
  assert.ok(match, `[${item.id}] expected match: ${item.question}`);
  assert.strictEqual(
    match.key,
    item.expectKey,
    `[${item.id}] key mismatch for: ${item.question}`
  );
  assert.strictEqual(
    isHighConfidenceDeterministic(match),
    true,
    `[${item.id}] expected high confidence deterministic`
  );
  const answer = formatGoldenFactAnswer(match.key, item.question);
  assert.ok(answer, `[${item.id}] empty formatted answer`);
  for (const pattern of item.mustMatchRegex || []) {
    assert.match(
      answer,
      new RegExp(String(pattern), "iu"),
      `[${item.id}] answer must match /${pattern}/: ${answer.slice(0, 120)}`
    );
  }
  passed += 1;
}

console.log(`OK: golden router paraphrase tests passed (${passed}/${items.length} with expectKey)`);
