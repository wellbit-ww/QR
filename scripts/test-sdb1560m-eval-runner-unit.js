/**
 * Unit tests for sdb1560m-eval-runner-lib (no HTTP, no Postgres, no Ollama).
 */
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const lib = require("./sdb1560m-eval-runner-lib");

const MIN_VALID_CASE = {
  id: "test.valid.min",
  message: "Какой вес?",
  category: "numeric_spec",
  expectedOutcome: { mode: "must_answer" },
  resolutionStatus: "ready",
  requiredFacts: [{ claimPattern: "260", unit: "kg" }],
};

const BLOCKED_CASE = {
  id: "test.blocked.shelf",
  message: "Сколько полок?",
  category: "kit_completeness",
  expectedOutcome: { mode: "either_abstain_or_answer_if_grounded" },
  resolutionStatus: "blocked_pending_source_resolution",
  forbiddenClaims: [{ pattern: "\\b18\\b" }],
};

const ABSTAIN_CASE = {
  id: "test.abstain.vendor",
  message: "Кто производитель?",
  category: "unsupported_by_manual",
  expectedOutcome: { mode: "must_abstain" },
  resolutionStatus: "ready",
  abstentionRules: {
    allowedAbstainPatterns: [
      "Информация отсутствует в документации\\.",
      "не\\s+указан|отсутств",
    ],
  },
};

function evalLayers(caseDef, answer, extra = {}) {
  const c = lib.normalizeCase(caseDef);
  return lib.evaluateCaseLayers(c, { answer, ...extra });
}

function overall(caseDef, answer, extra = {}) {
  const c = lib.normalizeCase(caseDef);
  const { layers } = lib.evaluateCaseLayers(c, { answer, ...extra });
  return lib.deriveCaseStatus(c, layers, null);
}

function testValidSuiteValidation() {
  const doc = {
    schemaVersion: lib.SCHEMA_VERSION,
    equipmentId: "sdb1560m",
    cases: [MIN_VALID_CASE],
  };
  const v = lib.validateSuiteDocument(doc);
  assert.equal(v.ok, true, v.errors.join("; "));
}

function testInvalidCaseRejected() {
  const bad = { ...MIN_VALID_CASE, id: "BAD ID!!!", requiredFacts: [{ claimPattern: "[invalid" }] };
  const v = lib.validateCase(bad);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes("id") || e.includes("regex")));
}

function testBlockedExcludedFromFactualAccuracy() {
  const results = [
    {
      case: lib.normalizeCase(MIN_VALID_CASE),
      layers: { factual: { status: "pass" }, forbiddenLeakage: { status: "pass" } },
      overall: { status: "pass" },
    },
    {
      case: lib.normalizeCase(BLOCKED_CASE),
      layers: { factual: { status: "blocked" }, forbiddenLeakage: { status: "pass" } },
      overall: { status: "blocked" },
    },
    {
      case: lib.normalizeCase({
        ...MIN_VALID_CASE,
        id: "test.fail.factual",
        requiredFacts: [{ claimPattern: "999", unit: "kg" }],
      }),
      layers: { factual: { status: "fail" }, forbiddenLeakage: { status: "pass" } },
      overall: { status: "fail" },
    },
  ];
  const m = lib.computeMetrics(results);
  assert.equal(m.answer_factual_accuracy.denominator, 2);
  assert.equal(m.answer_factual_accuracy.numerator, 1);
  assert.ok(m.answer_factual_accuracy.excludedBlockedCaseIds.includes("test.blocked.shelf"));
  assert.equal(m.answer_factual_accuracy.value, 0.5);
}

function testZeroDenominatorFactual() {
  const results = [
    {
      case: lib.normalizeCase(BLOCKED_CASE),
      layers: { factual: { status: "blocked" }, forbiddenLeakage: { status: "pass" } },
      overall: { status: "blocked" },
    },
  ];
  const m = lib.computeMetrics(results);
  assert.equal(m.answer_factual_accuracy.denominator, 0);
  assert.equal(m.answer_factual_accuracy.value, null);
}

function testStatusSeparation() {
  const blocked = lib.deriveCaseStatus(
    lib.normalizeCase(BLOCKED_CASE),
    { forbiddenLeakage: { status: "pass" }, factual: { status: "blocked" } },
    null,
  );
  assert.equal(blocked.status, "blocked");

  const infra = lib.deriveCaseStatus(lib.normalizeCase(MIN_VALID_CASE), {}, "network down");
  assert.equal(infra.status, "infrastructure_error");

  const o = overall(MIN_VALID_CASE, "Масса 260 кг");
  assert.equal(o.status, "pass");

  const fail = overall(
    { ...MIN_VALID_CASE, forbiddenClaims: [{ pattern: "180" }] },
    "180 кг",
  );
  assert.equal(fail.status, "fail");
}

function testB1AbstainNoRules() {
  const c = lib.normalizeCase({
    ...ABSTAIN_CASE,
    id: "test.abstain.norules",
    abstentionRules: undefined,
  });
  const { layers } = lib.evaluateCaseLayers(c, { answer: lib.STRICT_ABSTAIN });
  assert.equal(layers.abstention.status, "config_error");
  const st = lib.deriveCaseStatus(c, layers, null);
  assert.equal(st.status, "fail");
  assert.match(st.reason, /config/);
}

function testB1AbstainCorrect() {
  const { layers } = evalLayers(ABSTAIN_CASE, lib.STRICT_ABSTAIN);
  assert.equal(layers.abstention.status, "pass");
  assert.equal(overall(ABSTAIN_CASE, lib.STRICT_ABSTAIN).status, "pass");
}

function testB1AbstainSubstantiveInstead() {
  const st = overall(ABSTAIN_CASE, "Производитель датчика — Acme Corp.");
  assert.equal(st.status, "fail");
}

function testB1AbstainMixedClaim() {
  const st = overall(
    ABSTAIN_CASE,
    "Информация отсутствует в документации. Масса шкафа 260 кг.",
  );
  assert.equal(st.status, "fail");
}

function testB1AbstainEmptyAndInfra() {
  const c = lib.normalizeCase(ABSTAIN_CASE);
  const empty = lib.deriveCaseStatus(c, lib.evaluateCaseLayers(c, { answer: "" }).layers, null);
  assert.equal(empty.status, "fail");
  const infra = lib.deriveCaseStatus(c, {}, "login failed");
  assert.equal(infra.status, "infrastructure_error");
}

function testB2NumericUnitPass() {
  const r = lib.evaluateRequiredFact({ claimPattern: "260", unit: "kg" }, "Вес 260 кг");
  assert.equal(r.status, "pass");
}

function testB2NumericCapMaximum() {
  const pwr = { claimPattern: "40", unit: "W", factId: "F-PWR-DRY" };
  const baselineDry =
    "Максимальная потребляемая мощность Шкафа SDB1560М в режиме осушения без установленных систем подачи азота и подогрева воздуха не более 40 Вт.";
  assert.equal(lib.evaluateRequiredFact(pwr, baselineDry).status, "pass");
  assert.equal(lib.evaluateRequiredFact(pwr, "не более 40 Вт").status, "pass");
  assert.equal(lib.evaluateRequiredFact(pwr, "до 40 W").status, "pass");
  assert.equal(lib.evaluateRequiredFact(pwr, "не более 50 Вт").status, "fail");
  assert.equal(lib.evaluateRequiredFact(pwr, "не более 30 Вт").status, "fail");
}

function testB2FortyVs140() {
  const r = lib.evaluateRequiredFact({ claimPattern: "40", unit: "W" }, "Мощность 140 W");
  assert.equal(r.status, "fail");
}

function testB2NumberWithoutUnit() {
  const r = lib.evaluateRequiredFact({ claimPattern: "260", unit: "kg" }, "Масса 260");
  assert.equal(r.status, "fail");
  assert.equal(r.reason, "missing_unit");
}

function testB2Negation() {
  const r = lib.evaluateRequiredFact({ claimPattern: "260", unit: "kg" }, "не 260 кг, а 180 кг");
  assert.equal(r.status, "fail");
}

function testB2Contradiction() {
  const r = lib.evaluateRequiredFact(
    { claimPattern: "260", unit: "kg" },
    "260 кг, также указано 180 кг",
    { forbiddenClaims: [{ pattern: "180" }] },
  );
  assert.equal(r.status, "fail");
  assert.equal(r.reason, "contradiction");
}

/** Task 39: combined dry + regen power — two W facts must not false-contradict when labelled. */
function testTask39DryRegenDualWFactual() {
  const opts = { dualDryRegenWPair: true };
  const good =
    "Максимальная потребляемая мощность: в режиме **осушения** — **не более 40 Вт**, в режиме **регенерации** осушителя — **не более 540 Вт** (п. 1.1.2.7).";
  assert.equal(lib.evaluateRequiredFact({ claimPattern: "40", unit: "W" }, good, opts).status, "pass");
  assert.equal(lib.evaluateRequiredFact({ claimPattern: "540", unit: "W" }, good, opts).status, "pass");

  const swapped =
    "В режиме **осушения** — **не более 540 Вт**, в режиме **регенерации** — **не более 40 Вт**.";
  assert.equal(lib.evaluateRequiredFact({ claimPattern: "40", unit: "W" }, swapped, opts).status, "fail");
  assert.equal(lib.evaluateRequiredFact({ claimPattern: "540", unit: "W" }, swapped, opts).status, "fail");

  const wrongSecond = "В режиме **осушения** — **не более 40 Вт**, в режиме **регенерации** — **не более 50 Вт**.";
  assert.equal(lib.evaluateRequiredFact({ claimPattern: "40", unit: "W" }, wrongSecond, opts).status, "fail");
  assert.equal(lib.evaluateRequiredFact({ claimPattern: "540", unit: "W" }, wrongSecond, opts).status, "fail");

  const extra810 =
    "Осушение **40 Вт**, регенерация **540 Вт**, опционально **810 Вт** с азотом в осушении.";
  assert.equal(lib.evaluateRequiredFact({ claimPattern: "40", unit: "W" }, extra810, opts).status, "fail");

  assert.ok(lib.isDualDryRegenWFactPair([{ claimPattern: "40", unit: "W" }, { claimPattern: "540", unit: "W" }]));
  assert.equal(lib.isDualDryRegenWFactPair([{ claimPattern: "40", unit: "W" }]), false);
}

/** Task 39: footnote split across chunk lines — join adjacent lines for grounding match. */
function testTask39GroundingAdjacentLineJoin() {
  const chunk =
    "Таблица 1.1 размеры.\n" +
    "Размер высоты без учета светосигнальной колонны типа «Светофор»";
  const evidence = { chunkTexts: [chunk], extractProvenance: null };
  const rf = { claimPattern: "без\\s+учета|не\\s+учитыва" };
  const g = lib.isRequiredFactGroundedInEvidence(
    rf,
    evidence,
    "Высота без учета светофор (примечание к табл. 1.1).",
    true,
    false,
  );
  assert.equal(g.grounded, true);
}

/** Task 18/20: SDB1560 designator must not false-conflict; real dual-mass still fails. */
function testB2MassModelDesignatorNotConflictingKg() {
  const rf = { claimPattern: "260", unit: "kg", factId: "F-MASS" };

  assert.equal(lib.evaluateRequiredFact(rf, "SDB1560NM — 260 кг").status, "pass");
  assert.equal(lib.evaluateRequiredFact(rf, "SDB1560M: масса 260 кг").status, "pass");
  assert.equal(lib.evaluateRequiredFact(rf, "SDB1560М — 260 кг").status, "pass");

  const contextualExtract =
    "**Масса** шкафа SDB1560NM — **260 кг** (табл. 1.1).";
  const colloquial =
    "Масса Шкафа SDB1560М составляет 260 кг. Так что вдвоём будет сложно поднимать.";
  assert.equal(lib.evaluateRequiredFact(rf, contextualExtract).status, "pass");
  assert.equal(lib.evaluateRequiredFact(rf, colloquial).status, "pass");

  const dual156 = lib.evaluateRequiredFact(rf, "Масса 260 кг и 156 кг");
  assert.equal(dual156.status, "fail");
  assert.equal(dual156.reason, "contradiction");

  const dual180 = lib.evaluateRequiredFact(rf, "260 кг и 180 кг");
  assert.equal(dual180.status, "fail");
  assert.equal(dual180.reason, "contradiction");

  assert.equal(lib.evaluateRequiredFact(rf, "не 260 кг, а 180 кг").status, "fail");

  const only156 = lib.evaluateRequiredFact(rf, "Вес 156 кг");
  assert.equal(only156.status, "fail");
  assert.notEqual(only156.reason, "contradiction");

  const plain1560kg = lib.evaluateRequiredFact(rf, "260 кг и 1560 кг");
  assert.equal(plain1560kg.status, "fail");
  assert.equal(plain1560kg.reason, "contradiction");

  const wrong = "SDB1560M: масса 156 кг (ошибка), также 260 кг";
  assert.equal(lib.evaluateRequiredFact(rf, wrong).status, "fail");
}

function testB2MissingFact() {
  const { layers } = evalLayers(MIN_VALID_CASE, "около двухсот");
  assert.equal(layers.factual.status, "fail");
}

function testB2UnsafeTextPattern() {
  const r = lib.evaluateRequiredFact({ claimPattern: "norm" }, "это нормальное поведение");
  assert.equal(r.status, "not_evaluable");
}

function testB3AllLayersPass() {
  assert.equal(overall(MIN_VALID_CASE, "260 кг").status, "pass");
}

function testB3OneLayerFail() {
  assert.equal(overall(MIN_VALID_CASE, "180 кг").status, "fail");
}

function testB3LayerNotEvaluable() {
  const c = {
    ...MIN_VALID_CASE,
    requiredFacts: [{ claimPattern: "norm" }],
  };
  const st = overall(c, "нормально");
  assert.equal(st.status, "not_evaluable");
}

function testB3AllBlockedMetrics() {
  const results = [
    {
      case: lib.normalizeCase(BLOCKED_CASE),
      layers: { factual: { status: "blocked" }, forbiddenLeakage: { status: "pass" } },
      overall: { status: "blocked" },
    },
  ];
  const m = lib.computeMetrics(results);
  assert.equal(m.answer_factual_accuracy.value, null);
  assert.equal(m.regression_pass_rate.value, null);
}

function testB3AllInfraMetrics() {
  const results = [
    {
      case: lib.normalizeCase(MIN_VALID_CASE),
      layers: {},
      overall: { status: "infrastructure_error" },
    },
  ];
  const m = lib.computeMetrics(results);
  assert.equal(m.answer_factual_accuracy.denominator, 0);
  assert.equal(m.cross_model_leakage_rate.denominator, 0);
  assert.equal(m.regression_pass_rate.denominator, 0);
}

function testB3RetrievalRequiredFail() {
  const c = {
    ...MIN_VALID_CASE,
    retrievalExpectations: { mustIncludeSourceDocPatterns: ["SDB1560NM\\.pdf"] },
  };
  const st = overall(c, "260 кг", { sources: [] });
  assert.equal(st.status, "fail");
}

function testNoProvisioningInRunnerSources() {
  const runnerSrc = fs.readFileSync(path.join(__dirname, "run-sdb1560m-eval-v1.js"), "utf8");
  const httpSrc = fs.readFileSync(path.join(__dirname, "sdb1560m-eval-http-client.js"), "utf8");
  const libSrc = fs.readFileSync(path.join(__dirname, "sdb1560m-eval-runner-lib.js"), "utf8");
  for (const [name, src] of [
    ["runner", runnerSrc],
    ["http-client", httpSrc],
    ["lib", libSrc],
  ]) {
    assert.ok(!/provisionEvalUser|createPortalUser|ingest-knowledge/i.test(src), `${name} must not provision`);
    assert.ok(!/sdb1560m-http-test-lib/i.test(runnerSrc), "runner must not import legacy http test lib");
  }
}

function testManifestNoSecrets(tmpDir) {
  process.env.EVAL_LOGIN = "testuser";
  process.env.EVAL_PASSWORD = "super-secret-password";
  process.env.RAG_PURE = "1";
  const manifest = lib.buildRunManifest({
    datasetPath: "/tmp/dataset.json",
    datasetSha256: "abc",
    partition: "all",
    mode: "dry-run",
    noProvision: true,
    allowHttp: false,
    dryRun: true,
    authMode: "not-used",
  });
  const serialized = JSON.stringify(manifest);
  assert.ok(!serialized.includes("super-secret-password"));
  assert.ok(!serialized.includes("testuser"));
  assert.equal(manifest.serverEnvFingerprint.EVAL_PASSWORD, "(set)");
  assert.equal(manifest.evalRunnerLibVersion, lib.EVAL_RUNNER_LIB_VERSION);
  delete process.env.EVAL_LOGIN;
  delete process.env.EVAL_PASSWORD;
}

function testReportJsonShape(tmpDir) {
  const cases = [lib.normalizeCase(MIN_VALID_CASE)];
  const manifest = lib.buildRunManifest({
    datasetPath: path.join(tmpDir, "ds.json"),
    datasetSha256: "deadbeef",
    partition: "verified",
    mode: "dry-run",
    noProvision: true,
    allowHttp: false,
    dryRun: true,
    authMode: "not-used",
  });
  const report = lib.runEvalDry({ cases, manifest });
  const out = lib.writeRunOutput(tmpDir, report);
  assert.ok(fs.existsSync(path.join(out, "report.json")));
  const parsed = JSON.parse(fs.readFileSync(path.join(out, "report.json"), "utf8"));
  assert.equal(parsed.caseResults[0].overall.status, "not_run");
  assert.ok(parsed.metrics.answer_factual_accuracy.note.includes("heuristic"));
}

function testRetrievalMetricsNull() {
  const { layers } = lib.evaluateCaseLayers(lib.normalizeCase(MIN_VALID_CASE), {
    answer: "260 кг",
    sources: [{ sourceDoc: "Руководство SDB1560NM.pdf", score: 1 }],
  });
  assert.equal(layers.grounding.status, "not_evaluable");
  const m = lib.computeMetrics([
    {
      case: lib.normalizeCase(MIN_VALID_CASE),
      layers,
      overall: { status: "pass" },
    },
  ]);
  assert.equal(m.retrieval_recall_at_k.value, null);
  assert.equal(m.grounded_claim_rate.value, null);
}

function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sdb1560m-eval-"));
  try {
    testValidSuiteValidation();
    testInvalidCaseRejected();
    testBlockedExcludedFromFactualAccuracy();
    testZeroDenominatorFactual();
    testStatusSeparation();
    testB1AbstainNoRules();
    testB1AbstainCorrect();
    testB1AbstainSubstantiveInstead();
    testB1AbstainMixedClaim();
    testB1AbstainEmptyAndInfra();
    testB2NumericUnitPass();
    testB2NumericCapMaximum();
    testB2FortyVs140();
    testB2NumberWithoutUnit();
    testB2Negation();
    testB2Contradiction();
    testTask39DryRegenDualWFactual();
    testTask39GroundingAdjacentLineJoin();
    testB2MassModelDesignatorNotConflictingKg();
    testB2MissingFact();
    testB2UnsafeTextPattern();
    testB3AllLayersPass();
    testB3OneLayerFail();
    testB3LayerNotEvaluable();
    testB3AllBlockedMetrics();
    testB3AllInfraMetrics();
    testB3RetrievalRequiredFail();
    testNoProvisioningInRunnerSources();
    testManifestNoSecrets(tmpDir);
    testReportJsonShape(tmpDir);
    testRetrievalMetricsNull();
    require("./test-sdb1560m-eval-runner-counterexamples").runCounterexampleTests();
    console.log("sdb1560m-eval-runner unit tests: OK");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main();
