const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const lib = require("./sdb1560m-eval-runner-lib");
const { tryDeterministicSdb1560mHonestCluster } = require("../src/rag/sdb1560m-honest-cluster-facts");

const EXP_V2 = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../docs/reports/sdb1560m-eval-suite-expanded-v2.json"), "utf8"),
);
const GEN_V1 = JSON.parse(
  fs.readFileSync(path.join(__dirname, "eval/sdb1560m-generalization-v1.json"), "utf8"),
);

function caseById(suite, id) {
  const c = (suite.cases || []).find((x) => x.id === id);
  assert.ok(c, `missing case ${id}`);
  return c;
}

function evalFactual(caseNorm, answer) {
  let pass = 0;
  const missing = [];
  for (const rf of caseNorm.requiredFacts || []) {
    const r = lib.evaluateRequiredFact(rf, answer);
    if (r.status === "pass") {
      pass += 1;
    } else {
      missing.push({ claimPattern: rf.claimPattern, status: r.status, reason: r.reason });
    }
  }
  return { pass, total: (caseNorm.requiredFacts || []).length, missing };
}

const feetCase = caseById(EXP_V2, "exp.num.feet-kit-4");
const feetMsg = feetCase.message;
const feetAns = tryDeterministicSdb1560mHonestCluster(feetMsg);
assert.ok(feetAns, "feet-kit deterministic answer");
assert.match(feetAns, /\b4\b/);
assert.match(feetAns, /ножк/i);
const feetEval = evalFactual(feetCase, feetAns);
assert.equal(feetEval.pass, feetEval.total, JSON.stringify(feetEval.missing));

const massCase = caseById(GEN_V1, "gen.multi.mass-depth");
const massAns = tryDeterministicSdb1560mHonestCluster(massCase.message);
assert.ok(massAns);
const massEval = evalFactual(massCase, massAns);
assert.equal(massEval.pass, massEval.total, JSON.stringify(massEval.missing));

const doorCase = caseById(GEN_V1, "gen.proc.open-door-symbol");
const doorAns = tryDeterministicSdb1560mHonestCluster(doorCase.message);
assert.ok(doorAns);
const doorEval = evalFactual(doorCase, doorAns);
assert.equal(doorEval.pass, doorEval.total, JSON.stringify(doorEval.missing));

console.log("PASS task50 residual (feet-kit, mass-depth, open-door-symbol)");
