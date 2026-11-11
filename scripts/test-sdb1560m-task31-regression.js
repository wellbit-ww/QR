#!/usr/bin/env node
const assert = require("assert");
const {
  tryHonestContextualNumericFact,
  resolveExtractKind,
  extractSatisfiesQuery,
} = require("../src/rag/honest-contextual-extract");
const { isEvalCaptureRagTraceEnabled, runWithEvalCaptureRagTrace } = require("../src/rag/eval-capture");
const { sourcesFromPromptChunks } = require("../src/rag/pipeline/run-pipeline");
const { evaluateCaseLayers, deriveCaseStatus } = require("./sdb1560m-eval-runner-lib");

const portalAbstain = "В документации на данную модель этот параметр не указан.";
const pdfChunk = (text) => ({ sourceDoc: "Руководство SDB1560NM.pdf", content: text });

function testN2Timer99() {
  const msg = "Какой максимум у таймера подачи азота без датчика?";
  assert.strictEqual(resolveExtractKind(msg, { focusParameter: "nitrogen" }), "n2_option");
  const badLlm = "Максимальное значение времени включения автоматической подачи азота (без датчика азота) составляет 99 минут.";
  const fixed = tryHonestContextualNumericFact({
    equipmentId: "sdb1560m",
    message: msg,
    intent: { focusParameter: "nitrogen" },
    promptChunks: [pdfChunk("N2Ton 0–99,9 мин без датчика 1.2.2")],
    retrievalContext: "",
    priorAnswer: badLlm,
  });
  assert.ok(fixed && /99[,.]9/.test(fixed), fixed);
  assert.ok(!/60\s*[±+]/.test(fixed));
}

function testDoorTimer60() {
  const msg = "Сколько минут ускоренного осушения после закрытия двери?";
  assert.strictEqual(resolveExtractKind(msg, {}), "door_close_timer");
  const ans = tryHonestContextualNumericFact({
    equipmentId: "sdb1560m",
    message: msg,
    intent: {},
    promptChunks: [pdfChunk("ускоренного осушения 60 ± 1 мин 1.1.4.4.1")],
    retrievalContext: "",
    priorAnswer: portalAbstain,
  });
  assert.ok(ans && /60\s*[±+]\s*1/.test(ans));
  assert.ok(!/99[,.]9/.test(ans));
}

function testHumidityWarmupNotDoor() {
  const msg = "Сколько ждать выхода на установленную влажность после включения?";
  assert.strictEqual(resolveExtractKind(msg, {}), "warmup");
  assert.notStrictEqual(resolveExtractKind(msg, {}), "door_close_timer");
}

function testEvalCaptureFlag() {
  assert.strictEqual(isEvalCaptureRagTraceEnabled(), false);
  runWithEvalCaptureRagTrace(true, () => {
    assert.strictEqual(isEvalCaptureRagTraceEnabled(), true);
  });
  assert.strictEqual(isEvalCaptureRagTraceEnabled(), false);
}

function testSourcesWithContentWhenCapture() {
  const chunks = [{ sourceDoc: "a.pdf", content: "mass 260 kg table 1.1", page: 7, chunkIndex: 3 }];
  const plain = sourcesFromPromptChunks(chunks, false);
  assert.strictEqual(plain[0].content, undefined);
  const rich = sourcesFromPromptChunks(chunks, true);
  assert.ok(rich[0].content && /260/.test(rich[0].content));
}

function testStorageVsDryNoLeakageFalsePositive() {
  const caseNorm = {
    expectedOutcome: { mode: "must_answer" },
    requiredFacts: [{ claimPattern: "40" }],
    forbiddenClaims: [],
  };
  const answer =
    "Максимальная потребляемая мощность — 8 Вт в режиме хранения и 40 Вт в режиме осушения.";
  const { layers } = evaluateCaseLayers(caseNorm, { answer, sources: [] });
  const overall = deriveCaseStatus(caseNorm, layers, null);
  assert.strictEqual(layers.forbiddenLeakage.status, "pass");
  assert.strictEqual(layers.factual.status, "pass");
  assert.strictEqual(overall.status, "pass");
}

function testForeignMassStillForbidden() {
  const caseNorm = {
    expectedOutcome: { mode: "must_answer" },
    requiredFacts: [{ claimPattern: "260" }],
    forbiddenClaims: [{ pattern: "180", reason: "wrong model" }],
  };
  const { layers } = evaluateCaseLayers(caseNorm, { answer: "Масса 180 кг", sources: [] });
  assert.strictEqual(layers.forbiddenLeakage.status, "fail");
}

testN2Timer99();
testDoorTimer60();
testHumidityWarmupNotDoor();
testEvalCaptureFlag();
testSourcesWithContentWhenCapture();
testStorageVsDryNoLeakageFalsePositive();
testForeignMassStillForbidden();
console.log("test-sdb1560m-task31-regression: OK");
