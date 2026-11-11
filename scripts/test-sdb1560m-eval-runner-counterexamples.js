/**
 * Task 6 — counterexample tests for eval-runner (synthetic answers only).
 */
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const lib = require("./sdb1560m-eval-runner-lib");

const MASS_RF = { claimPattern: "260", unit: "kg", factId: "F-MASS" };
const PWR_RF = { claimPattern: "40", unit: "W", factId: "F-PWR-DRY" };

function mustAnswerCase(requiredFacts, extra = {}) {
  return lib.normalizeCase({
    id: extra.id || "cx.must_answer",
    message: extra.message || "Q?",
    category: "numeric_spec",
    expectedOutcome: { mode: "must_answer" },
    resolutionStatus: "ready",
    requiredFacts,
    forbiddenClaims: extra.forbiddenClaims || [],
    retrievalExpectations: extra.retrievalExpectations,
    ...extra,
  });
}

function runCase(caseNorm, answer, payloadExtra = {}) {
  const { layers } = lib.evaluateCaseLayers(caseNorm, { answer, ...payloadExtra });
  const overall = lib.deriveCaseStatus(caseNorm, layers, null);
  return { layers, overall };
}

function assertNotPass(overall, msg) {
  assert.notEqual(overall.status, "pass", msg || `expected not pass, got pass: ${overall.reason}`);
}

function assertStatus(overall, status, msg) {
  assert.equal(overall.status, status, msg || `expected ${status}, got ${overall.status}`);
}

function sectionA_numbers() {
  assert.equal(
    lib.evaluateRequiredFact(MASS_RF, "Масса составляет 260 кг").status,
    "pass",
  );

  assert.equal(
    lib.evaluateRequiredFact(MASS_RF, "Масса составляет не 260 кг, а 280 кг").status,
    "fail",
  );

  assert.equal(
    lib.evaluateRequiredFact(MASS_RF, "Масса не превышает 260 кг").status,
    "pass",
    "regulatory maximum at required value",
  );

  const pwr = PWR_RF;
  assert.equal(
    lib.evaluateRequiredFact(pwr, "Потребление не более 40 Вт").status,
    "pass",
  );
  assert.equal(lib.evaluateRequiredFact(pwr, "до 40 Вт").status, "pass");
  assert.equal(lib.evaluateRequiredFact(pwr, "Мощность 40 W").status, "pass");
  assert.equal(lib.evaluateRequiredFact(pwr, "не более 50 Вт").status, "fail");
  assert.equal(lib.evaluateRequiredFact(pwr, "не более 30 Вт").status, "fail");
  assert.equal(lib.evaluateRequiredFact(pwr, "не 40 Вт").status, "fail");
  assert.equal(
    lib.evaluateRequiredFact(pwr, "В таблице ошибок указан код 40, режим хранения 8 Вт").status,
    "fail",
    "bare 40 without W unit does not satisfy power fact",
  );

  const baselineDry =
    "Максимальная потребляемая мощность Шкафа SDB1560М в режиме осушения без установленных систем подачи азота и подогрева воздуха не более 40 Вт.";
  assert.equal(lib.evaluateRequiredFact(pwr, baselineDry).status, "pass");

  assert.equal(lib.evaluateRequiredFact(PWR_RF, "Мощность 140 W").status, "fail");

  assert.equal(
    lib.evaluateRequiredFact(MASS_RF, "Масса составляет 260 фунтов").status,
    "fail",
  );

  const dual = lib.evaluateRequiredFact(
    MASS_RF,
    "Масса составляет 260 кг, но точное значение — 280 кг",
  );
  assert.notEqual(dual.status, "pass", "dual mass must not pass");
  assert.equal(dual.status, "fail");

  const rangeAns = lib.evaluateRequiredFact(MASS_RF, "Масса 250–270 кг");
  assert.notEqual(rangeAns.status, "pass");

  const basePowerCase = mustAnswerCase([PWR_RF], {
    id: "cx.pwr.base",
    forbiddenClaims: [{ pattern: "810" }, { pattern: "415" }],
  });
  const multi = runCase(
    basePowerCase,
    "40 Вт без опций; 810 Вт с опциями",
  );
  assertNotPass(multi.overall, "810 forbidden leakage");

  const multi415 = runCase(
    basePowerCase,
    "40 Вт без опций; 415 Вт с опциями",
  );
  assertNotPass(multi415.overall, "415 forbidden");

  const factualMulti = lib.evaluateRequiredFact(
    PWR_RF,
    "40 Вт без опций; 810 Вт с опциями",
  );
  assert.equal(
    factualMulti.status,
    "fail",
    "alternate 810 W in same answer fails numeric fact check",
  );

  assert.equal(
    lib.evaluateRequiredFact(MASS_RF, "Масса 260,5 кг").status,
    "fail",
    "decimal comma variant not matching exact integer pattern",
  );

  const quoteWrong = lib.evaluateRequiredFact(
    MASS_RF,
    'Неверный ответ "280 кг", правильно: 260 кг',
  );
  assert.equal(quoteWrong.status, "fail", "conflicting 280 kg with unit");

  const c = mustAnswerCase([MASS_RF]);
  assertStatus(runCase(c, "Масса составляет 260 кг").overall, "pass");
}

function sectionB_abstain() {
  const noRules = lib.normalizeCase({
    id: "cx.ab.no_rules",
    message: "Q",
    category: "unsupported_by_manual",
    expectedOutcome: { mode: "must_abstain" },
    resolutionStatus: "ready",
  });
  assertStatus(runCase(noRules, lib.STRICT_ABSTAIN).overall, "fail");

  const rules = lib.normalizeCase({
    id: "cx.ab.rules",
    message: "Q",
    category: "unsupported_by_manual",
    expectedOutcome: { mode: "must_abstain" },
    resolutionStatus: "ready",
    abstentionRules: {
      allowedAbstainPatterns: ["Информация отсутствует в документации\\."],
    },
  });
  assertStatus(runCase(rules, lib.STRICT_ABSTAIN).overall, "pass");
  assertNotPass(runCase(rules, "Информация отсутствует. Масса 260 кг").overall);
  assertNotPass(runCase(rules, "Параметр не указан, масса 260 кг").overall);
  assertNotPass(runCase(rules, "").overall);
  assert.equal(
    lib.deriveCaseStatus(rules, {}, "down").status,
    "infrastructure_error",
  );

  const mustAns = mustAnswerCase([MASS_RF]);
  assertNotPass(runCase(mustAns, lib.STRICT_ABSTAIN).overall);
  assertNotPass(runCase(mustAns, "Информация отсутствует в документации.").overall);
}

function sectionC_layers() {
  const c = mustAnswerCase([MASS_RF], {
    retrievalExpectations: { mustIncludeSourceDocPatterns: ["PDF"] },
  });
  assertStatus(runCase(c, "260 кг", { sources: [{ sourceDoc: "manual.pdf" }] }).overall, "pass");
  assertNotPass(runCase(c, "260 кг", { sources: [] }).overall);

  const c2 = mustAnswerCase([MASS_RF]);
  const withPdfOnly = runCase(c2, "260 кг", {
    sources: [{ sourceDoc: "SDB1560NM.pdf" }],
  });
  assert.equal(withPdfOnly.layers.grounding.status, "not_evaluable");
  assertStatus(withPdfOnly.overall, "pass");

  const c3 = mustAnswerCase([MASS_RF]);
  const withBadChunk = runCase(c3, "260 кг", {
    sources: [{ content: "масса 180 кг" }],
  });
  assert.equal(withBadChunk.layers.grounding.status, "fail");
  assertNotPass(withBadChunk.overall);

  const blocked = lib.normalizeCase({
    id: "cx.blocked",
    message: "polki",
    category: "kit_completeness",
    expectedOutcome: { mode: "either_abstain_or_answer_if_grounded" },
    resolutionStatus: "blocked_pending_source_resolution",
  });
  assertStatus(runCase(blocked, "2 polki").overall, "blocked");

  const unsafe = mustAnswerCase([{ claimPattern: "norm" }]);
  assertStatus(runCase(unsafe, "нормально").overall, "not_evaluable");
}

function sectionD_groundingRetrieval() {
  const c = mustAnswerCase([MASS_RF], {
    retrievalExpectations: { mustIncludeSourceDocPatterns: ["SDB1560"] },
  });
  const okAnsBadRet = runCase(c, "260 кг", { sources: [] });
  assertNotPass(okAnsBadRet.overall, "retrieval fail blocks pass");

  const chunkBoth = runCase(c, "260 кг", {
    sources: [{ content: "260 кг и также 280 кг", sourceDoc: "SDB1560.pdf" }],
  });
  assertNotPass(chunkBoth.overall);
}

function sectionE_metrics() {
  const empty = lib.computeMetrics([]);
  assert.equal(empty.answer_factual_accuracy.value, null);
  assert.equal(empty.regression_pass_rate.value, null);

  const mk = (id, overall, factual, blocked = false) => ({
    case: lib.normalizeCase({
      id,
      message: "m",
      category: "numeric_spec",
      expectedOutcome: { mode: blocked ? "either_abstain_or_answer_if_grounded" : "must_answer" },
      resolutionStatus: blocked ? "blocked_pending_source_resolution" : "ready",
      requiredFacts: blocked ? [] : [MASS_RF],
      forbiddenClaims: id === "with_forbidden" ? [{ pattern: "180" }] : [],
    }),
    layers: {
      factual: { status: factual },
      forbiddenLeakage: { status: "pass" },
    },
    overall: { status: overall },
  });

  const allBlocked = lib.computeMetrics([
    mk("b1", "blocked", "blocked", true),
    mk("b2", "blocked", "blocked", true),
  ]);
  assert.equal(allBlocked.answer_factual_accuracy.denominator, 0);

  const allInfra = lib.computeMetrics([
    {
      case: mk("i1", "pass", "pass").case,
      layers: {},
      overall: { status: "infrastructure_error" },
    },
  ]);
  assert.equal(allInfra.answer_factual_accuracy.denominator, 0);
  assert.equal(allInfra.regression_pass_rate.denominator, 0);

  const allNotRun = lib.computeMetrics([
    {
      case: mk("n1", "not_run", "not_run").case,
      layers: { factual: { status: "not_run" } },
      overall: { status: "not_run" },
    },
  ]);
  assert.equal(allNotRun.regression_pass_rate.value, null);

  const mix = lib.computeMetrics([
    mk("p1", "pass", "pass"),
    mk("f1", "fail", "fail"),
    mk("ne1", "not_evaluable", "not_evaluable"),
    mk("b1", "blocked", "blocked", true),
  ]);
  assert.equal(mix.answer_factual_accuracy.numerator, 1);
  assert.equal(mix.answer_factual_accuracy.denominator, 2);
  assert.equal(mix.regression_pass_rate.numerator, 1);
  assert.equal(mix.regression_pass_rate.denominator, 2);
  assert.ok(!mix.regression_pass_rate.includedCaseIds.includes("ne1"));
}

function sectionCompatDraftSuite() {
  const p = path.join(__dirname, "..", "docs", "reports", "sdb1560m-eval-suite-draft-v1.json");
  const { doc } = lib.loadSuiteFromFile(p);
  const v = lib.validateSuiteDocument(doc);
  assert.equal(v.ok, true, v.errors.join("; "));
}

function runCounterexampleTests() {
  sectionA_numbers();
  sectionB_abstain();
  sectionC_layers();
  sectionD_groundingRetrieval();
  sectionE_metrics();
  sectionCompatDraftSuite();
}

module.exports = { runCounterexampleTests };
