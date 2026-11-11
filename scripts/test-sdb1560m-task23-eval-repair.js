/**
 * Task 23 — offline checks for eval suite v2 + forbidden bounded numeric fix.
 */
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const lib = require("./sdb1560m-eval-runner-lib");

const V2 = path.join(__dirname, "..", "docs", "reports", "sdb1560m-eval-suite-expanded-v2.json");
const R2_REPORT = path.join(
  __dirname,
  "..",
  "logs",
  "baseline-task22",
  "http-verified-20261029-r2",
  "report.json",
);

function caseFromSuite(id) {
  const { doc } = lib.loadSuiteFromFile(V2);
  const raw = doc.cases.find((c) => c.id === id);
  assert.ok(raw, `missing case ${id}`);
  return lib.normalizeCase(raw);
}

function runLayers(caseNorm, answer, payloadExtra = {}) {
  const { layers } = lib.evaluateCaseLayers(caseNorm, { answer, ...payloadExtra });
  const overall = lib.deriveCaseStatus(caseNorm, layers, null);
  return { layers, overall };
}

function testSuiteV2Validates() {
  const { doc } = lib.loadSuiteFromFile(V2);
  const v = lib.validateSuiteDocument(doc);
  assert.equal(v.ok, true, v.errors.join("; "));
}

function testMassRetrievalWithTask22Sources() {
  const c = caseFromSuite("exp.num.mass.direct");
  const answer = "**Масса** шкафа SDB1560NM — **260 кг** (табл. 1.1).";
  const { layers, overall } = runLayers(c, answer, {
    sources: [{ sourceDoc: "Руководство SDB1560NM.pdf" }],
  });
  assert.equal(layers.factual.status, "pass");
  assert.equal(layers.retrieval.status, "pass", layers.retrieval.detail);
  assert.equal(overall.status, "pass", overall.reason);
}

function testRhAccuracyTask22Answer() {
  const c = caseFromSuite("exp.num.rh-accuracy");
  const answer =
    "Точность поддержания установленного диапазона влажности: ± 1RH%.";
  const { layers } = runLayers(c, answer);
  assert.equal(layers.factual.status, "pass", JSON.stringify(layers.factual));
}

function testN2TimerDecimal() {
  const c = caseFromSuite("exp.num.n2-timer-99");
  const answer =
    "Максимальное значение времени подачи азота во внутренний рабочий объем Шкафа без датчика азота составляет 99.9 минут.";
  const { layers } = runLayers(c, answer);
  assert.equal(layers.factual.status, "pass", JSON.stringify(layers.factual));
  assert.equal(
    lib.evaluateRequiredFact({ claimPattern: "99", factId: "F-N2-TIMER" }, answer).status,
    "fail",
    "bare 99 must not substitute for required 99.9",
  );
}

function testPwr810ForbiddenEight() {
  const c = caseFromSuite("exp.num.pwr-storage-with-opt-810");
  const ok810 =
    "Максимальная потребляемая мощность Шкафа SDB1560М в режиме хранения, с установленными системами подачи азота и подогрева воздуха, не более 810 Вт.";
  const { layers: okLayers, overall: okOverall } = runLayers(c, ok810);
  assert.equal(okLayers.factual.status, "pass");
  assert.equal(okLayers.forbiddenLeakage.status, "pass", okLayers.forbiddenLeakage.detail);
  assert.equal(okOverall.status, "pass", okOverall.reason);

  const wrong8 =
    "Максимальная потребляемая мощность в режиме хранения с опциями не более 8 Вт.";
  const { layers: badLayers, overall: badOverall } = runLayers(c, wrong8);
  assert.equal(badLayers.forbiddenLeakage.status, "fail");
  assert.equal(badOverall.status, "fail");
}

function testOfflineReplayEvalDefectCasesFromR2() {
  assert.ok(fs.existsSync(R2_REPORT), "Task 22 r2 report required for replay");
  const report = JSON.parse(fs.readFileSync(R2_REPORT, "utf8"));
  const { doc } = lib.loadSuiteFromFile(V2);
  const byId = new Map(doc.cases.map((c) => [c.id, lib.normalizeCase(c)]));

  const replayIds = [
    "exp.num.mass.direct",
    "exp.num.rh-accuracy",
    "exp.num.n2-timer-99",
    "exp.num.pwr-storage-with-opt-810",
  ];
  for (const id of replayIds) {
    const saved = report.caseResults.find((r) => r.case.id === id);
    assert.ok(saved?.answerPreview, id);
    const caseNorm = byId.get(id);
    const evidence = saved.evidenceUsed || {};
    const sources = (evidence.sourceDocs || []).map((d) => ({ sourceDoc: d }));
    const { overall } = runLayers(caseNorm, saved.answerPreview, { sources });
    assert.equal(overall.status, "pass", `${id} should pass with v2+1.5: ${overall.reason}`);
  }
}

function main() {
  testSuiteV2Validates();
  testMassRetrievalWithTask22Sources();
  testRhAccuracyTask22Answer();
  testN2TimerDecimal();
  testPwr810ForbiddenEight();
  testOfflineReplayEvalDefectCasesFromR2();
  console.log("test-sdb1560m-task23-eval-repair: ok");
}

main();
