const assert = require("node:assert/strict");
const {
  tryDeterministicSdb1560mAnswer,
} = require("../src/rag/sdb1560m-direct-facts");
const {
  classifySdb1560mMessage,
} = require("../src/rag/sdb1560m-chat-gate");
const {
  anchorQueryToEquipmentModel,
  foreignSdbModels,
} = require("../src/rag/sdb-model-scope");
const {
  sectionHintsForSdb1560mMessage,
  retrievalCardFilesForSdb1560mQuery,
} = require("../src/rag/sdb1560m-rag-priority");
const { buildQueryRewriteSystemPrompt, buildGeneralFactSystemPrompt, buildSdb1560mDirectSystemPrompt } = require("../src/rag/prompts");
const { expandRetrievalSynonyms } = require("../src/rag/query-rewriting");
const { buildSdb1560mLlmAnswerCompositionBlocks } = require("../src/rag/sdb1560m-prompt-rules");
const { validateSdb1560mAnswerAgainstContext } = require("../src/rag/sdb1560m-answer-validation");
const { applySdb1560mPostGate } = require("../src/rag/sdb1560m-post-gate");

const cases = [
  ["внутренний объем", "1 896"],
  ["Какой полный объем шкафа?", "2 070"],
  ["Сколько полок?", "2"],
  ["Сколько дверей?", "4"],
  ["Какие габариты?", "1202 × 1693 × 1028"],
  ["Какой вес?", "260"],
  ["Мощность в режиме хранения?", "8 Вт"],
  ["Сколько потребляет при осушении?", "415 Вт"],
  ["Мощность осушения с азотом и подогревом?", "415 Вт"],
  ["Мощность осушения без опций?", "40 Вт"],
  ["Мощность регенерации?", "540 Вт"],
  ["Какое питание?", "220 В"],
  ["Какой диапазон влажности?", "0–80"],
  ["Нагрузка на стандартную полку?", "100 кг"],
  ["Технические характеристики опции азот?", "6 бар"],
  ["За сколько выходит на режим?", "180 минут"],
  ["Что входит в базовую комплектацию?", "2 полки"],
  ["Чем осушитель поглощает влагу?", "цеолитом"],
  ["Как часто менять осушитель?", "36 месяцев"],
  ["Какая максимальная температура подогрева?", "+40"],
  ["Какой таймер подачи азота?", "99,9 мин"],
  ["Как работают ротаметры азота?", "Рпост"],
  ["Как установить влажность в меню?", "SET"],
  ["Что проверить перед включением?", "внешний осмотр"],
  ["Как включить шкаф?", "тумблер"],
  ["Влажность не снижается, что делать?", "3.1.4"],
  ["Кто ремонтирует электронный блок после гарантии?", "изготовителя"],
  ["Какие условия хранения на складе?", "кислот"],
  ["Какой производитель датчика влажности?", "не указан"],
  ["Как перевозить шкаф?", "вертикальном положении"],
  ["Как утилизировать шкаф?", "общепромышленных отходов"],
  ["Какой класс защиты?", "IP55"],
  ["Можно выключить шкаф при регенерации?", "Запрещается"],
];

for (const [question, expected] of cases) {
  const answer = tryDeterministicSdb1560mAnswer(question);
  assert.ok(answer, `No deterministic answer for: ${question}`);
  assert.match(answer, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu"));
}

const p1p2Cases = [
  ["Можно ли отключить шкаф во время регенерации?", "Запрещается"],
  ["Какое максимальное давление азота на входе?", "6 бар"],
  ["Как задать порог влажности", "UP/DN"],
  ["Как в меню выставить влажность?", "UP/DN"],
  ["От воды и пыли какой там IP у корпуса, не помню", "IP55"],
  ["Осушитель когда менять по времени — раз в сколько примерно?", "36 месяцев"],
  ["Как часто менять блок осушения?", "36 месяцев"],
  ["Влезет в дверной проём? какой он высокий", "1693"],
  ["Тяжёлый? вдвоём поднимем или кран нужен", "260 кг"],
  ["Климат какой у него по паспорту — ухл или что там в начале книжки написано?", "УХЛ"],
  ["Можно платы россыпью на полку кинуть или только в таре?", "таре"],
  ["Можно туда растворитель или что-то горючее на ночь оставить?", "не предназначен"],
  ["Влажность не падает — что делать?", "отсутствии снижения влажности"],
  [
    "Через какое время после включения шкаф должен выйти на установленный режим влажности?",
    "180 минут",
  ],
  [
    "С какой точностью шкаф поддерживает установленную влажность?",
    "±1 RH%",
  ],
  ["Какой объём рабочего пространства у шкафа?", "1 896 л"],
  [
    "Защищает ли шкаф диэлектрики от изменения электрических характеристик?",
    "диэлектриков",
  ],
  [
    "Можно ли использовать шкаф для хранения изделий, которым требуется высокая влажность?",
    "высокая влажность",
  ],
];
for (const [question, expected] of p1p2Cases) {
  const answer = tryDeterministicSdb1560mAnswer(question);
  assert.ok(answer, `No deterministic answer for P1/P2: ${question}`);
  assert.match(answer, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu"));
}

const highHumidityStorage = tryDeterministicSdb1560mAnswer(
  "Можно ли использовать шкаф для хранения изделий, которым требуется высокая влажность?"
);
assert.doesNotMatch(highHumidityStorage, /602/u);
assert.doesNotMatch(highHumidityStorage, /габарит/iu);

const timeToRh = tryDeterministicSdb1560mAnswer(
  "Через какое время после включения шкаф должен выйти на установленный режим влажности?"
);
assert.doesNotMatch(timeToRh, /SET/u);

const rhPrecision = tryDeterministicSdb1560mAnswer(
  "С какой точностью шкаф поддерживает установленную влажность?"
);
assert.doesNotMatch(rhPrecision, /SET/u);

const loadRhRise = tryDeterministicSdb1560mAnswer(
  "Почему после загрузки изделий влажность внутри шкафа повысилась?"
);
assert.match(loadRhRise, /открытой двери/u);
assert.match(loadRhRise, /вентилятор/u);
assert.doesNotMatch(loadRhRise, /параметр не указан/u);
assert.doesNotMatch(loadRhRise, /предположить/u);

const doorDryDelay = tryDeterministicSdb1560mAnswer(
  "Почему шкаф не сразу осушает воздух после закрытия двери?"
);
assert.match(doorDryDelay, /60/u);
assert.doesNotMatch(doorDryDelay, /цеолит/u);

const setpointVsAmbient = tryDeterministicSdb1560mAnswer(
  "Что произойдёт, если я установлю влажность 10 %, а в помещении влажность составляет 50 %?"
);
assert.match(setpointVsAmbient, /осушать к 10 RH%/u);
assert.match(setpointVsAmbient, /допустима/u);
assert.doesNotMatch(setpointVsAmbient, /параметр не указан/u);
assert.doesNotMatch(setpointVsAmbient, /\bSET\b/u);

const fanRestart1Rh = tryDeterministicSdb1560mAnswer(
  "Почему шкаф повторно включает вентилятор, если влажность повысилась всего на 1%?"
);
assert.match(fanRestart1Rh, /RH%п \+ 1 RH%/u);
assert.match(fanRestart1Rh, /1\.1\.4\.4\.1/u);
assert.doesNotMatch(fanRestart1Rh, /параметр не указан/u);

assert.doesNotMatch(rhPrecision, /RH%п \+ 1/u);

const rhBelowSetpoint = tryDeterministicSdb1560mAnswer(
  "Почему влажность внутри шкафа может опуститься ниже установленного значения"
);
assert.match(rhBelowSetpoint, /1\.1\.4\.4\.2/u);
assert.match(rhBelowSetpoint, /заслонк/u);
assert.doesNotMatch(rhBelowSetpoint, /общих принципов/u);
assert.doesNotMatch(rhBelowSetpoint, /общих принципов работы/u);

const humidityRiseClosed = tryDeterministicSdb1560mAnswer(
  "Дверь вроде закрыта а влажность всё равно растёт, что смотреть"
);
assert.ok(
  !humidityRiseClosed || !/Ррег/u.test(humidityRiseClosed),
  `Closed-door humidity rise must not be nitrogen timer: ${humidityRiseClosed}`
);

const redLamp = tryDeterministicSdb1560mAnswer("что за красная лампочка?");
assert.match(redLamp, /1\.1\.4\.3\.3/u);
assert.match(redLamp, /Осушения/u);
assert.match(redLamp, /открыта дверь/u);
assert.doesNotMatch(redLamp, /обычно/u);

const ragPathCases = [
  "Красный мигает, это уже авария или так и должно?",
  "Как начать работу с шкафом?",
  "Только купил шкаф, с чего начать?",
  "SET нажал и ничего не происходит, дальше как?",
  "На полу возле шкафа лужа, это от него?",
  "На ночь можно выключить чтоб не жрал, или нельзя?",
  "Жёлтый горит уже давно, выключать нельзя же?",
  "Где рубильник выключать если надо питание снять? Сзади что-то было",
];
for (const question of ragPathCases) {
  const answer = tryDeterministicSdb1560mAnswer(question);
  assert.equal(
    answer,
    null,
    `Conversational probe must go to RAG, got deterministic for: ${question} → ${answer}`
  );
}

const restartCheckFacts = [
  ["Помещение +12 °C, шкаф в рабочем диапазоне или нет?", ["+15", "вне"]],
  ["А у нас в цехе градусов 12, шкаф вообще можно включать или лучше не надо?", ["+15", "вне"]],
  ["Опция подогрева корпус до ста градусов греет, правда? Обожгусь?", ["100", "ожог"]],
  ["Корпус сверху тёплый, не обожгусь? это норма?", ["100"]],
  ["Сколько колёс кладут в поставку 1560?", ["4 колес"]],
  ["Ножки крутить или на колёсах оставлять, как правильнее", ["4 колес"]],
  ["Буква W на дисплее выскочила, это код ошибки?", ["подогрев"]],
  ["На экране какая-то W горит, это что", ["подогрев"]],
  ["Зелёный сигнал горит, это какой режим сейчас?", ["Хранен"]],
];
for (const [question, needles] of restartCheckFacts) {
  const answer = tryDeterministicSdb1560mAnswer(question);
  assert.ok(answer, `No deterministic answer for: ${question}`);
  for (const needle of needles) {
    assert.match(answer, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu"), question);
  }
}
assert.doesNotMatch(
  tryDeterministicSdb1560mAnswer("Опция подогрева корпус до ста градусов греет, правда? Обожгусь?"),
  /максимальная — \*\*\+40/u
);
assert.doesNotMatch(
  tryDeterministicSdb1560mAnswer("Буква W на дисплее выскочила, это код ошибки?"),
  /нет кодов ошибок/u
);
const heatingMax = tryDeterministicSdb1560mAnswer("Какая максимальная температура подогрева?");
assert.match(heatingMax, /\+40/u);
assert.doesNotMatch(heatingMax, /100/u);

const foreign = classifySdb1560mMessage("Какая мощность у SDB1106NM?");
assert.equal(foreign.action, "FOREIGN_MODEL");

const offTopic = classifySdb1560mMessage("Напиши программу на Python");
assert.equal(offTopic.action, "OFF_TOPIC");
assert.equal(classifySdb1560mMessage("Как сварить борщ?").action, "OFF_TOPIC");

const unsupported = classifySdb1560mMessage("Поддерживает ли шкаф Wi-Fi?");
assert.equal(unsupported.action, "UNSUPPORTED_SPEC");
assert.match(unsupported.reply, /не указан/u);

const chatgptCases = [
  ["Какие изделия допускается хранить в шкафу?", "радиоэлемент"],
  ["Кто является производителем шкафа?", "Совтест"],
  ["В каком климатическом исполнении выпускается шкаф?", "УХЛ"],
  ["Для кого предназначено руководство по эксплуатации?", "ознакомления"],
  ["Какая группа по электробезопасности требуется оператору?", "не ниже I"],
  ["Что означает режим осушения?", "мигающий красный"],
  ["Какие параметры отображаются на дисплее?", "влажност"],
  ["Где приведены требования к хранению?", "разделе 5"],
  ["Можно ли управлять шкафом через Интернет?", "не указан"],
  ["Как открыть дверь?", "звуков"],
];
for (const [question, expected] of chatgptCases) {
  const answer = tryDeterministicSdb1560mAnswer(question);
  assert.ok(answer, `No deterministic answer for ChatGPT case: ${question}`);
  assert.match(answer, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu"));
}

const scoped = classifySdb1560mMessage("Как настроить влажность?");
assert.equal(scoped.action, "IN_SCOPE");

const equipment = { id: "sdb1560m", name: "SDB1560 M" };
assert.deepEqual(foreignSdbModels("Сравни с SDB1106NM", equipment), ["SDB1106NM"]);
assert.match(anchorQueryToEquipmentModel("какой вес", equipment), /SDB1560NM/u);
assert.doesNotMatch(anchorQueryToEquipmentModel("какой вес SDB1560NM", equipment), /SDB1106NM/u);

const sectionCases = [
  ["Как работает опция азота?", "1.2"],
  ["Что запрещено при загрузке полок?", "2.1"],
  ["Что проверить перед включением?", "2.2"],
  ["Как настроить режим регенерации?", "2.3"],
  ["Что делать при запахе гари?", "2.4"],
  ["Как часто проводить ТО?", "3.1"],
  ["Влажность не снижается, что делать?", "3.1.4"],
  ["Как перевозить шкаф?", "6"],
  ["Как утилизировать шкаф?", "7"],
];
for (const [question, expectedHint] of sectionCases) {
  assert.ok(
    sectionHintsForSdb1560mMessage(question).includes(expectedHint),
    `No ${expectedHint} hint for: ${question}`
  );
}

const conversationalHintCases = [
  ["Красный мигает, это уже авария или так и должно?", "1.1.4.3.3"],
  ["Красный мигает, это уже авария или так и должно?", "осушен"],
  ["что за красная лампочка?", "1.1.4.3.3"],
  ["На экране какая-то W горит, это что", "подогрев"],
  ["Как начать работу с шкафом?", "2.2.5"],
  ["Только купил шкаф, с чего начать?", "тумблер"],
  ["А у нас в цехе градусов 12, шкаф вообще можно включать или лучше не надо?", "+15"],
  ["SET нажал и ничего не происходит, дальше как?", "таблица 3.2"],
  ["На полу возле шкафа лужа, это от него?", "2.4"],
  ["Ножки крутить или на колёсах оставлять, как правильнее", "таблица 1.2"],
  ["На ночь можно выключить чтоб не жрал, или нельзя?", "режим хранения"],
  ["Жёлтый горит уже давно, выключать нельзя же?", "регенерац"],
  ["Где рубильник выключать если надо питание снять? Сзади что-то было", "тумблер"],
  ["Корпус сверху тёплый, не обожгусь? это норма?", "подогрев"],
  ["Зелёный сигнал горит, это какой режим сейчас?", "хранен"],
  ["Буква W на дисплее выскочила, это код ошибки?", "подогрев"],
  ["Сколько колёс кладут в поставку 1560?", "таблица 1.2"],
];
for (const [question, expectedHint] of conversationalHintCases) {
  assert.ok(
    sectionHintsForSdb1560mMessage(question).includes(expectedHint),
    `No ${expectedHint} hint for conversational: ${question} → ${sectionHintsForSdb1560mMessage(question).join(", ")}`
  );
}
assert.equal(
  sectionHintsForSdb1560mMessage("Красный мигает, это уже авария или так и должно?").includes("2.4"),
  false,
  "Blinking red must not be steered to emergency 2.4"
);
assert.equal(
  sectionHintsForSdb1560mMessage("А у нас в цехе градусов 12, шкаф вообще можно включать или лучше не надо?").includes("5"),
  false,
  "Shop temperature must not be steered to storage section 5"
);

const eq1560 = { id: "sdb1560m" };
const shopTempExpanded = expandRetrievalSynonyms(
  "А у нас в цехе градусов 12, шкаф вообще можно включать",
  eq1560
);
assert.match(shopTempExpanded, /\+15/);
assert.doesNotMatch(shopTempExpanded, /\+40/);
assert.match(expandRetrievalSynonyms("подогрев", { id: "sdb1560m" }), /\+40/);
assert.match(expandRetrievalSynonyms("подогрев", eq1560), /\+40/);
assert.match(
  expandRetrievalSynonyms("Красный мигает, это уже авария или так и должно?", eq1560),
  /1\.1\.4\.3\.3/
);
assert.match(expandRetrievalSynonyms("что за красная лампочка?", eq1560), /1\.1\.4\.3\.3/);
assert.match(expandRetrievalSynonyms("что за красная лампочка?", eq1560), /индикатор/);
assert.match(expandRetrievalSynonyms("Как начать работу с шкафом?", eq1560), /тумблер/);

const startBlocks = buildSdb1560mLlmAnswerCompositionBlocks("", "Как начать работу с шкафом?").join("\n");
assert.match(startBlocks, /2\.2\.5/u);
const redBlocks = buildSdb1560mLlmAnswerCompositionBlocks("", "Красный мигает, это уже авария или так и должно?").join("\n");
assert.match(redBlocks, /Осушения/u);
const lampBlocks = buildSdb1560mLlmAnswerCompositionBlocks("", "что за красная лампочка?").join("\n");
assert.match(lampBlocks, /лампочк/iu);
assert.match(lampBlocks, /1\.1\.4\.3\.3/);

const rewritePrompt = buildQueryRewriteSystemPrompt(equipment);
const answerPrompt = buildGeneralFactSystemPrompt(equipment, "Таблица SDB1560NM.");
assert.match(rewritePrompt, /SDB1560 M/u);
assert.doesNotMatch(rewritePrompt, /SDB1106NM/u);
assert.match(answerPrompt, /только SDB1560 M/u);
assert.doesNotMatch(answerPrompt, /Целевая модель — только SDB1106NM/u);

const overviewContext =
  "SDB1560NM. Эксплуатация шкафа. Режим хранения до 8 Вт. Масса 260 кг. Габариты 1202×1693×1028 мм. Перед включением выполните внешний осмотр.";
const overviewAnswer =
  "Эксплуатация SDB1560 M включает режим хранения с потреблением до **8 Вт**, массу **260 кг** и габариты **1202×1693×1028 мм**. Перед включением выполняют внешний осмотр.";
const overviewValidation = validateSdb1560mAnswerAgainstContext(overviewAnswer, overviewContext, {
  intentType: "PROCEDURE_QUERY",
  originalQuery: "Расскажи про эксплуатацию этого шкафа",
});
assert.equal(overviewValidation.ok, true, `Overview validation failed: ${JSON.stringify(overviewValidation.failures)}`);

const wrongPowerValidation = validateSdb1560mAnswerAgainstContext(
  "В режиме хранения потребление составляет 540 Вт.",
  overviewContext,
  {
    intentType: "FACT_QUERY",
    originalQuery: "Какая мощность в режиме хранения?",
  },
);
assert.equal(
  wrongPowerValidation.ok,
  false,
  `Wrong power should fail strict numeric validation: ${JSON.stringify(wrongPowerValidation.failures)}`,
);

const postGate = applySdb1560mPostGate({
  answer: overviewAnswer,
  context: overviewContext,
  message: "Расскажи про эксплуатацию этого шкафа",
  equipment,
  deliveryMethod: "standard",
  semanticSimilarity: 1,
  gateAction: "IN_SCOPE",
  routerDecision: { intent: "PROCEDURE_QUERY", route: "PROCEDURAL_QA" },
  retrieval: { intent: { intentType: "PROCEDURE_QUERY" } },
});
assert.equal(postGate.validation.ok, true);
assert.match(postGate.answer, /8\s*Вт/u);

const leakValidation = validateSdb1560mAnswerAgainstContext(
  "Масса шкафа SDB1106NM составляет 180 кг.",
  overviewContext,
  { intentType: "FACT_QUERY", originalQuery: "Какой вес?" },
);
assert.equal(leakValidation.ok, false, `1106 leak should fail: ${JSON.stringify(leakValidation.failures)}`);

const inventedProcedureValidation = validateSdb1560mAnswerAgainstContext(
  "1. Нажмите кнопку тестового режима.\n2. Откройте меню диагностики.\n3. Подтвердите сигнал.",
  "SDB1560NM. Режим хранения.",
  { intentType: "PROCEDURE_QUERY", originalQuery: "Как проверить сигнализацию?" },
);
assert.equal(
  inventedProcedureValidation.ok,
  false,
  `Invented steps should fail: ${JSON.stringify(inventedProcedureValidation.failures)}`,
);

const directPrompt = buildSdb1560mDirectSystemPrompt(equipment, { manualLoaded: true });
assert.match(directPrompt, /тестов(?:ый|ого)\s+режим/i);
assert.match(directPrompt, /SDB1560NM/u);
assert.match(directPrompt, /540\s*Вт/u);

const recoveryPostGate = applySdb1560mPostGate({
  answer: "Масса шкафа SDB1106NM составляет 180 кг.",
  context: overviewContext,
  message: "Какой вес?",
  equipment,
  deliveryMethod: "standard",
  semanticSimilarity: 1,
  gateAction: "IN_SCOPE",
  routerDecision: { intent: "FACT_QUERY", route: "FACT_QA" },
  retrieval: { intent: { intentType: "FACT_QUERY" } },
});
assert.match(recoveryPostGate.answer, /260\s*кг/u);
assert.equal(recoveryPostGate.postGateTrace.deterministicRecovery, true);

const supportAnswer = tryDeterministicSdb1560mAnswer("Как написать в поддержку?");
assert.ok(supportAnswer, "contact support should be deterministic");
assert.match(supportAnswer, /8 \(800\) 200-54-17/u);
assert.match(supportAnswer, /Техподдержка/u);
assert.match(supportAnswer, /info@sovtest-ate\.ru/u);
assert.doesNotMatch(supportAnswer, /Пример:/u);

const sovtPhone = tryDeterministicSdb1560mAnswer("Номер совтеста");
assert.ok(sovtPhone, "sovtest phone should route to contact support");
assert.match(sovtPhone, /8 \(800\) 200-54-17/u);
assert.match(sovtPhone, /Техподдержка/u);
assert.doesNotMatch(sovtPhone, /Серийные номера/u);

const sovtCall = tryDeterministicSdb1560mAnswer("Как позвонить в совтест");
assert.ok(sovtCall, "sovtest call should route to contact support");
assert.match(sovtCall, /8 \(800\) 200-54-17/u);

const gateCall = classifySdb1560mMessage("Как позвонить в совтест", { equipmentChatScoped: true });
assert.equal(gateCall.action, "CONTACT_SUPPORT", "contact support gate for pozvonit v sovtest");
assert.match(gateCall.reply, /8 \(800\) 200-54-17/u);

const manufacturerContact = tryDeterministicSdb1560mAnswer("Как связаться с предприятием-изготовителем?");
assert.ok(manufacturerContact, "manufacturer contact should be deterministic");
assert.match(manufacturerContact, /8 \(800\) 200-54-17/u);
assert.match(manufacturerContact, /info@sovtest-ate\.ru/u);
assert.equal(
  classifySdb1560mMessage("Как связаться с предприятием-изготовителем?", { equipmentChatScoped: true }).action,
  "CONTACT_SUPPORT",
);

const factorySerial = tryDeterministicSdb1560mAnswer("Где найти серийный номер шкафа?");
assert.match(factorySerial, /заводск/u);
assert.match(factorySerial, /квартал/u);
assert.match(factorySerial, /SDB1560NM/u);
assert.doesNotMatch(factorySerial, /SDB302NM/u);
assert.match(tryDeterministicSdb1560mAnswer("Где на шкафу серийный номер искать?"), /SDB1560NM/u);
assert.doesNotMatch(tryDeterministicSdb1560mAnswer("Где на шкафу серийный номер искать?"), /SDB702NM/u);

const brokenGlass = tryDeterministicSdb1560mAnswer("Разбилось стекло в двери");
assert.match(brokenGlass, /механическ/u);
assert.match(brokenGlass, /8 \(800\) 200-54-17/u);
assert.doesNotMatch(brokenGlass, /марка или тип стекла/u);
const brokenFollowUp = tryDeterministicSdb1560mAnswer("Оно разбилось", {
  history: [{ role: "user", content: "Разбилось стекло в двери" }],
});
assert.match(brokenFollowUp, /механическ/u);
assert.match(tryDeterministicSdb1560mAnswer("Куда обратиться чтобы починили"), /8 \(800\) 200-54-17/u);

for (const q of ["Как заменить LCD", "Как заменить замок", "Как заменить колёса", "Как починить подогрев"]) {
  const ans = tryDeterministicSdb1560mAnswer(q);
  assert.match(ans, /нет инструкции по замене/u, q);
  assert.match(ans, /8 \(800\) 200-54-17/u, q);
}
for (const q of ["Как заменить осушитель", "Как заменить уплотнитель", "Как заменить кабель питания", "Как починить звуковой сигнал"]) {
  const ans = tryDeterministicSdb1560mAnswer(q) || "";
  assert.doesNotMatch(ans, /нет инструкции по замене/u, q);
}
assert.match(tryDeterministicSdb1560mAnswer("Как заменить осушитель"), /36 месяцев/u);

const {
  extractSpecTableFlattenedChunks,
  extractPossibleFaultsListChunks,
} = require("../src/rag/chunking");
const fs = require("node:fs");
const path = require("node:path");
const redLampCard = fs.readFileSync(
  path.join(__dirname, "..", "knowledge", "sdb1560m", "retrieval-cards", "red-lamp.md"),
  "utf8"
);
assert.ok(redLampCard.includes("лампочка"));
const cardSpecChunks = extractSpecTableFlattenedChunks(redLampCard, { equipmentName: "SDB1560 M" });
assert.equal(cardSpecChunks.length, 0, "retrieval cards must not inherit SDB1106 table 1.1");
const cardFaultChunks = extractPossibleFaultsListChunks(redLampCard, { equipmentName: "SDB1560 M" });
assert.equal(
  cardFaultChunks.filter((ch) => /SDB1106NM/i.test(ch.content) || ch.metadata?.humidityInspectionChecklist).length,
  0,
  "retrieval cards must not inherit 1106 humidity checklist"
);

const cardPins = [
  ["А у нас в цехе градусов 12, шкаф вообще можно включать или лучше не надо?", "temp-contrast.md"],
  ["Помещение +12 °C, шкаф в рабочем диапазоне или нет?", "temp-contrast.md"],
  ["Опция подогрева корпус до ста градусов греет, правда? Обожгусь?", "temp-contrast.md"],
  ["Сколько колёс кладут в поставку 1560?", "feet-wheels.md"],
  ["Тумблер питания где искать, на кожухе сзади?", "power-on.md"],
  ["Буква W на дисплее выскочила, это код ошибки?", "yellow-and-w.md"],
  ["Зелёный сигнал горит, это какой режим сейчас?", "yellow-and-w.md"],
  ["Регенерация сколько минут длится примерно?", "yellow-and-w.md"],
  ["Азот это опция или в базовой поставке уже стоит?", "nitrogen-option.md"],
];
for (const [question, file] of cardPins) {
  assert.ok(
    retrievalCardFilesForSdb1560mQuery(question).includes(file),
    `No card pin ${file} for: ${question} → ${retrievalCardFilesForSdb1560mQuery(question).join(", ")}`
  );
}
assert.equal(
  retrievalCardFilesForSdb1560mQuery("Регенерация сколько минут длится примерно?").includes("humidity-time.md"),
  false,
  "Regen duration must not pin humidity-time (3 hours)"
);

console.log(`SDB1560NM profile checks passed: ${cases.length + 18 + sectionCases.length + chatgptCases.length}`);

const profile = require("../src/equipment/profiles/sdb1560m");
const { resolveEquipmentProfile } = require("../src/equipment/equipment-runtime");
assert.equal(resolveEquipmentProfile("sdb1560m"), profile);
