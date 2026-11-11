/**
 * Task 17 regression: direct mass query vs model-number hallucination (156 kg).
 * Runnable even when full profile test fails on unrelated RH% assertion (line ~190).
 */
const assert = require("node:assert/strict");
const {
  tryDeterministicSdb1560mAnswer,
} = require("../src/rag/sdb1560m-direct-facts");
const { classifySdb1560mMessage } = require("../src/rag/sdb1560m-chat-gate");
const {
  ragPureSdb1560AnswerOffTopic,
  ragPureSdb1560NeedsFactRetry,
  contextHasSdb1560AnswerableData,
} = require("../src/rag/honest-rag-mode");
const { tryHonestContextualNumericFact } = require("../src/rag/honest-contextual-extract");
const { answerPassesGroundingContract } = require("../src/rag/synthesis/sdb1560-grounding-contract");

const scopedGateCtx = { equipmentChatScoped: true };
const directMassQ = "Какой вес шкафа SDB1560M?";
const paraphraseMassQ = "Сколько весит шкаф SDB1560M?";
const colloquialMassQ = "Тяжёлый? вдвоём поднимем или кран нужен";
const massHallucination = "Вес шкафа SDB1560M составляет 156 кг.";
const massVerified = "Масса Шкафа SDB1560М составляет 260 кг.";
const massContext =
  "Руководство SDB1560NM.pdf табл. 1.1 | масса | 260 | кг | golden-facts-sdb1560m.md";

assert.equal(classifySdb1560mMessage(directMassQ, scopedGateCtx).action, "IN_SCOPE");
assert.equal(classifySdb1560mMessage(colloquialMassQ, scopedGateCtx).action, "IN_SCOPE");
assert.equal(
  classifySdb1560mMessage("Сколько стоит токарный станок 1560?", scopedGateCtx).action,
  "OFF_TOPIC",
);

assert.match(tryDeterministicSdb1560mAnswer(directMassQ) || "", /260\s*кг/u);
assert.match(tryDeterministicSdb1560mAnswer(paraphraseMassQ) || "", /260\s*кг/u);

assert.equal(ragPureSdb1560AnswerOffTopic(directMassQ, massHallucination), true);
assert.equal(ragPureSdb1560AnswerOffTopic(directMassQ, massVerified), false);
assert.equal(ragPureSdb1560AnswerOffTopic(colloquialMassQ, massVerified), false);
assert.equal(contextHasSdb1560AnswerableData(massContext), true);
assert.equal(ragPureSdb1560NeedsFactRetry(directMassQ, massHallucination, {}, massContext), true);
assert.equal(
  answerPassesGroundingContract(directMassQ, directMassQ, massHallucination, massContext, {}),
  false,
);
assert.equal(
  answerPassesGroundingContract(directMassQ, directMassQ, massVerified, massContext, {}),
  true,
);

const honestEnv = process.env.RAG_HONEST_EQUIPMENT;
process.env.RAG_HONEST_EQUIPMENT = "sdb1560m";
const extractedMass = tryHonestContextualNumericFact({
  equipmentId: "sdb1560m",
  message: directMassQ,
  intent: {},
  promptChunks: [],
  retrievalContext: massContext,
  parameterFactLlm: true,
  priorAnswer: massHallucination,
});
if (honestEnv === undefined) {
  delete process.env.RAG_HONEST_EQUIPMENT;
} else {
  process.env.RAG_HONEST_EQUIPMENT = honestEnv;
}
assert.match(String(extractedMass || ""), /260\s*кг/u);

console.log("SDB1560M Task 17 mass mismatch regressions: OK");
