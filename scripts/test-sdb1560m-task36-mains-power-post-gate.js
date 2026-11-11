const assert = require("node:assert/strict");
const { tryHonestContextualNumericFact } = require("../src/rag/honest-contextual-extract");
const { validateSdb1560mAnswerAgainstContext } = require("../src/rag/sdb1560m-answer-validation");
const { applySdb1560mPostGate } = require("../src/rag/sdb1560m-post-gate");

const pdfChunk =
  "2.2.1.3 Питание Шкафа осуществляется опасным для жизни переменным напряжением 220 В, частотой 50 Гц. SDB1560NM";
const chunks = [{ sourceDoc: "Руководство SDB1560NM.pdf", content: pdfChunk }];

const prior = "В документации на данную модель этот параметр не указан.";
const extracted = tryHonestContextualNumericFact({
  equipmentId: "sdb1560m",
  message: "От какого напряжения сети питается шкаф?",
  intent: { focusParameter: "voltage" },
  promptChunks: chunks,
  retrievalContext: pdfChunk,
  priorAnswer: prior,
});
assert.ok(extracted);
assert.match(extracted, /\b220\b/);
assert.doesNotMatch(extracted, /\b50\s*Гц/i);
assert.equal(
  validateSdb1560mAnswerAgainstContext(extracted, pdfChunk, {
    intentType: "SINGLE_FIELD_QUERY",
    focusParameter: "voltage",
  }).ok,
  true,
);

const post = applySdb1560mPostGate({
  answer: extracted,
  context: pdfChunk,
  message: "От какого напряжения сети питается шкаф?",
  equipment: { id: "sdb1560m" },
  routerDecision: { intent: "SINGLE_FIELD_QUERY" },
  retrieval: { intent: { intentType: "SINGLE_FIELD_QUERY", focusParameter: "voltage" } },
});
assert.match(post.answer, /\b220\b/);
assert.doesNotMatch(post.answer, /не указан/i);

const freqExtract = tryHonestContextualNumericFact({
  equipmentId: "sdb1560m",
  message: "Какая частота питающей сети указана в РЭ?",
  intent: {},
  promptChunks: chunks,
  retrievalContext: pdfChunk,
  priorAnswer: prior,
});
assert.match(String(freqExtract || ""), /\b50\b/);

console.log("test-sdb1560m-task36-mains-power-post-gate: OK");
