#!/usr/bin/env node
/**
 * Task 30 — routing / contextual extract / abstain pattern regressions.
 */
const assert = require("assert");
const {
  resolveExtractKind,
  extractSatisfiesQuery,
  tryHonestContextualNumericFact,
} = require("../src/rag/honest-contextual-extract");
const {
  isSdb1560mDoorCloseTimerMinutesQuery,
  isSdb1560mN2TechnicalQuery,
  isSdb1560mHumidityWaitQuery,
} = require("../src/rag/sdb1560m-rag-priority");
const { answerMatchesAllowedAbstain } = require("./sdb1560m-eval-runner-lib");

const portalAbstain = "В документации на данную модель этот параметр не указан.";

function run() {
  assert.strictEqual(
    resolveExtractKind("Сколько минут идёт ускоренное осушение после закрытия двери?", {}),
    "door_close_timer",
  );
  assert.strictEqual(
    resolveExtractKind("Максимальное время таймера подачи азота N2Ton?", {}),
    "n2_option",
  );
  assert.strictEqual(
    resolveExtractKind("Почему вентилятор снова включился при росте влажности на 1 RH%?", {}),
    "fan_restart_1rh",
  );
  assert.ok(isSdb1560mDoorCloseTimerMinutesQuery("60±1 мин после закрытия двери"));
  assert.ok(!isSdb1560mDoorCloseTimerMinutesQuery("Максимальное время таймера азота 99,9 мин"));
  assert.ok(isSdb1560mN2TechnicalQuery("Какое давление азота на входе?"));
  assert.ok(
    !isSdb1560mHumidityWaitQuery("Сколько минут ускоренного осушения после закрытия двери?"),
  );

  const doorChunk = {
    sourceDoc: "SDB1560NM.pdf",
    content: "отсчёт ускоренного осушения (60 ± 1 мин) после закрытии двери 1.1.4.4.1",
  };
  const doorAns = tryHonestContextualNumericFact({
    equipmentId: "sdb1560m",
    message: "Сколько минут ускоренного осушения после закрытия двери?",
    intent: {},
    promptChunks: [doorChunk],
    retrievalContext: "",
    priorAnswer: portalAbstain,
  });
  assert.ok(doorAns && /60\s*[±+]\s*1/.test(doorAns));
  assert.ok(
    extractSatisfiesQuery("Сколько минут после закрытия двери?", "door_close_timer", doorAns),
  );

  const n2Chunk = {
    sourceDoc: "SDB1560NM.pdf",
    content: "максимальное давление азота 6 бар трубка 8 мм расход 3–30 л/мин 99,9 мин 78–98",
  };
  const n2Pressure = tryHonestContextualNumericFact({
    equipmentId: "sdb1560m",
    message: "Сколько бар максимум на входе азота?",
    intent: {},
    promptChunks: [n2Chunk],
    retrievalContext: "",
    priorAnswer: portalAbstain,
  });
  assert.ok(n2Pressure && /\b6\b/.test(n2Pressure));
  const n2Timer = tryHonestContextualNumericFact({
    equipmentId: "sdb1560m",
    message: "Диапазон таймера N2Ton без датчика?",
    intent: {},
    promptChunks: [n2Chunk],
    retrievalContext: "",
    priorAnswer: portalAbstain,
  });
  assert.ok(n2Timer && /99[,.]9/.test(n2Timer));
  assert.ok(!/60\s*[±+]/.test(n2Timer));

  const volOnlyGolden = tryHonestContextualNumericFact({
    equipmentId: "sdb1560m",
    message: "Какой внутренний объём у SDB1560NM?",
    intent: {},
    promptChunks: [],
    retrievalContext: "",
    priorAnswer: portalAbstain,
  });
  assert.strictEqual(volOnlyGolden, null, "inner volume must not come from golden-only fallback");

  const abstainCase = {
    abstentionRules: {
      allowedAbstainPatterns: ["Информация отсутствует в документации\\.", "не\\s+указан|отсутств"],
    },
  };
  const match = answerMatchesAllowedAbstain(abstainCase, portalAbstain);
  assert.strictEqual(match.ok, true, match.reason);

  console.log("test-sdb1560m-task30-routing-extract: OK");
}

run();
