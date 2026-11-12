const assert = require("node:assert/strict");
const { classifySdb1560mMessage } = require("../src/rag/sdb1560m-chat-gate");
const {
  isUnsupportedSdb1560mSpecQuery,
  buildUnsupportedSdb1560mSpecReply,
  enforceUnsupportedSpecAnswer,
  isN2ConsumptionWithoutOptionQuery,
} = require("../src/rag/sdb1560m-unsupported-spec");
const { tryDeterministicSdb1560mAnswer } = require("../src/rag/sdb1560m-direct-facts");
const { tryHonestWhitelistedDeterministicAnswer } = require("../src/rag/honest-rag-deterministic");
const { applyHonestRagPostGate } = require("../src/rag/honest-rag-post-gate");

const EQUIPMENT = { id: "sdb1560m", name: "SDB1560 M" };
const P0 = [
  ["gen.unsup.bluetooth", "Есть Bluetooth для настройки?"],
  ["gen.unsup.sdb151-mass-for-1560", "Сколько весит SDB151 — нужно для расчёта помещения под SDB1560М."],
  ["gen.unsup.warehouse-humidity-setpoint", "Какую влажность установить для хранения печатных плат без указания класса?"],
  ["gen.insuf.n2-without-option", "Какой расход азота у шкафа без установленной опции азота?"],
  ["gen.unsup.blockchain", "Записывает ли шкаф данные в блокчейн?"],
  ["gen.unsup.serial-format", "Как расшифровать серийный номер на шильдике?"],
];

function expectAbstainReply(answer, label) {
  assert.ok(answer, `${label}: empty answer`);
  assert.match(answer, /не\s+указан|отсутств|Информация отсутствует/ui, `${label}: abstain pattern — ${answer}`);
}

function assertNoSubstantiveLeak(answer, forbidden) {
  for (const f of forbidden) {
    assert.doesNotMatch(answer, f, `leaked forbidden pattern in ${answer.slice(0, 80)}`);
  }
}

for (const [id, msg] of P0) {
  assert.equal(isUnsupportedSdb1560mSpecQuery(msg, EQUIPMENT), true, `${id} unsupported query`);
  const gate = classifySdb1560mMessage(msg, { equipmentChatScoped: true });
  assert.equal(gate.action, "UNSUPPORTED_SPEC", `${id} gate`);
  expectAbstainReply(gate.reply, id);

  const det = tryDeterministicSdb1560mAnswer(msg);
  expectAbstainReply(det, `${id} deterministic`);

  const honestDet = tryHonestWhitelistedDeterministicAnswer(msg, {}, EQUIPMENT);
  expectAbstainReply(honestDet, `${id} honest whitelist`);
}

assertNoSubstantiveLeak(
  classifySdb1560mMessage(P0[0][1], { equipmentChatScoped: true }).reply,
  [/ethernet|панел/ui],
);
assertNoSubstantiveLeak(
  tryDeterministicSdb1560mAnswer(P0[5][1]),
  [/квартал|порядков|0–9999|9999/ui],
);

const llmLeak =
  "В документации не упоминается Bluetooth. Подключение через Ethernet.";
const post = applyHonestRagPostGate({
  answer: llmLeak,
  context: "some context",
  message: P0[0][1],
  equipment: EQUIPMENT,
  validationProfile: "sdb1560",
});
expectAbstainReply(post.answer, "post-gate bluetooth");
assert.doesNotMatch(post.answer, /ethernet/i);

assert.equal(
  enforceUnsupportedSpecAnswer(P0[3][1], "Расход 3–30 л/мин при 6 бар.", EQUIPMENT),
  buildUnsupportedSdb1560mSpecReply(),
);

assert.equal(isN2ConsumptionWithoutOptionQuery("Какое давление азота на входе опции (6 бар)?"), false);
assert.equal(
  isUnsupportedSdb1560mSpecQuery("Какой таймер N2Ton указан в меню SET?", EQUIPMENT),
  false,
);
assert.equal(
  isUnsupportedSdb1560mSpecQuery("Где на табличке указан серийный номер шкафа?", EQUIPMENT),
  false,
);

console.log("test-sdb1560m-task47-p0-abstain: OK");
