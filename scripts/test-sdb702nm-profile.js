const assert = require("node:assert/strict");
const {
  tryDeterministicSdb702nmAnswer,
} = require("../src/rag/sdb702nm-direct-facts");
const {
  classifySdb702nmMessage,
} = require("../src/rag/sdb702nm-chat-gate");
const {
  anchorQueryToEquipmentModel,
  foreignSdbModels,
} = require("../src/rag/sdb-model-scope");
const {
  sectionHintsForSdb702nmMessage,
  retrievalCardFilesForSdb702nmQuery,
} = require("../src/rag/sdb702nm-rag-priority");
const { buildQueryRewriteSystemPrompt, buildGeneralFactSystemPrompt, buildSdb702nmDirectSystemPrompt } = require("../src/rag/prompts");
const { expandRetrievalSynonyms } = require("../src/rag/query-rewriting");
const { buildSdb702nmLlmAnswerCompositionBlocks } = require("../src/rag/sdb702nm-prompt-rules");
const { validateSdb702nmAnswerAgainstContext } = require("../src/rag/sdb702nm-answer-validation");
const { applySdb702nmPostGate } = require("../src/rag/sdb702nm-post-gate");

const cases = [
  ["внутренний объем", "743"],
  ["Какой полный объем шкафа?", "770"],
  ["Сколько полок?", "7"],
  ["Сколько дверей?", "3"],
  ["Какие габариты?", "602 × 1952 × 772"],
  ["Какой вес?", "90"],
  ["Мощность в режиме хранения?", "8 Вт"],
  ["Сколько потребляет при осушении?", "415 Вт"],
  ["Мощность осушения с азотом и подогревом?", "415 Вт"],
  ["Мощность осушения без опций?", "20 Вт"],
  ["Мощность регенерации?", "285 Вт"],
  ["Какое питание?", "220 В"],
  ["Какой диапазон влажности?", "0–80"],
  ["Нагрузка на стандартную полку?", "50 кг"],
  ["Технические характеристики опции азот?", "6 бар"],
  ["За сколько выходит на режим?", "3 часов"],
  ["Что входит в базовую комплектацию?", "7 перфорированных полок"],
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
  const answer = tryDeterministicSdb702nmAnswer(question);
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
  ["Влезет в дверной проём? какой он высокий", "1952"],
  ["Тяжёлый? вдвоём поднимем или кран нужен", "90 кг"],
  ["Климат какой у него по паспорту — ухл или что там в начале книжки написано?", "УХЛ"],
  ["Можно платы россыпью на полку кинуть или только в таре?", "таре"],
  ["Можно туда растворитель или что-то горючее на ночь оставить?", "не предназначен"],
  ["Влажность не падает — что делать?", "отсутствии снижения влажности"],
  [
    "Через какое время после включения шкаф должен выйти на установленный режим влажности?",
    "3 часов",
  ],
  [
    "С какой точностью шкаф поддерживает установленную влажность?",
    "±1 RH%",
  ],
  ["Какой объём рабочего пространства у шкафа?", "743 л"],
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
  const answer = tryDeterministicSdb702nmAnswer(question);
  assert.ok(answer, `No deterministic answer for P1/P2: ${question}`);
  assert.match(answer, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu"));
}

const highHumidityStorage = tryDeterministicSdb702nmAnswer(
  "Можно ли использовать шкаф для хранения изделий, которым требуется высокая влажность?"
);
assert.doesNotMatch(highHumidityStorage, /602/u);
assert.doesNotMatch(highHumidityStorage, /габарит/iu);

const timeToRh = tryDeterministicSdb702nmAnswer(
  "Через какое время после включения шкаф должен выйти на установленный режим влажности?"
);
assert.doesNotMatch(timeToRh, /SET/u);

const rhPrecision = tryDeterministicSdb702nmAnswer(
  "С какой точностью шкаф поддерживает установленную влажность?"
);
assert.doesNotMatch(rhPrecision, /SET/u);

const loadRhRise = tryDeterministicSdb702nmAnswer(
  "Почему после загрузки изделий влажность внутри шкафа повысилась?"
);
assert.match(loadRhRise, /открытой двери/u);
assert.match(loadRhRise, /вентилятор/u);
assert.doesNotMatch(loadRhRise, /параметр не указан/u);
assert.doesNotMatch(loadRhRise, /предположить/u);

const doorDryDelay = tryDeterministicSdb702nmAnswer(
  "Почему шкаф не сразу осушает воздух после закрытия двери?"
);
assert.match(doorDryDelay, /60/u);
assert.doesNotMatch(doorDryDelay, /цеолит/u);

const setpointVsAmbient = tryDeterministicSdb702nmAnswer(
  "Что произойдёт, если я установлю влажность 10 %, а в помещении влажность составляет 50 %?"
);
assert.match(setpointVsAmbient, /осушать к 10 RH%/u);
assert.match(setpointVsAmbient, /допустима/u);
assert.doesNotMatch(setpointVsAmbient, /параметр не указан/u);
assert.doesNotMatch(setpointVsAmbient, /\bSET\b/u);

const fanRestart1Rh = tryDeterministicSdb702nmAnswer(
  "Почему шкаф повторно включает вентилятор, если влажность повысилась всего на 1%?"
);
assert.match(fanRestart1Rh, /RH%п \+ 1 RH%/u);
assert.match(fanRestart1Rh, /1\.1\.4\.4\.1/u);
assert.doesNotMatch(fanRestart1Rh, /параметр не указан/u);

assert.doesNotMatch(rhPrecision, /RH%п \+ 1/u);

const rhBelowSetpoint = tryDeterministicSdb702nmAnswer(
  "Почему влажность внутри шкафа может опуститься ниже установленного значения"
);
assert.match(rhBelowSetpoint, /1\.1\.4\.4\.2/u);
assert.match(rhBelowSetpoint, /заслонк/u);
assert.doesNotMatch(rhBelowSetpoint, /общих принципов/u);
assert.doesNotMatch(rhBelowSetpoint, /общих принципов работы/u);

const humidityRiseClosed = tryDeterministicSdb702nmAnswer(
  "Дверь вроде закрыта а влажность всё равно растёт, что смотреть"
);
assert.ok(
  !humidityRiseClosed || !/Ррег/u.test(humidityRiseClosed),
  `Closed-door humidity rise must not be nitrogen timer: ${humidityRiseClosed}`
);

const redLamp = tryDeterministicSdb702nmAnswer("что за красная лампочка?");
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
  const answer = tryDeterministicSdb702nmAnswer(question);
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
  ["Сколько колёс кладут в поставку 702?", ["4 колес"]],
  ["Ножки крутить или на колёсах оставлять, как правильнее", ["4 колес"]],
  ["Буква W на дисплее выскочила, это код ошибки?", ["подогрев"]],
  ["На экране какая-то W горит, это что", ["подогрев"]],
  ["Зелёный сигнал горит, это какой режим сейчас?", ["Хранен"]],
];
for (const [question, needles] of restartCheckFacts) {
  const answer = tryDeterministicSdb702nmAnswer(question);
  assert.ok(answer, `No deterministic answer for: ${question}`);
  for (const needle of needles) {
    assert.match(answer, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu"), question);
  }
}
assert.doesNotMatch(
  tryDeterministicSdb702nmAnswer("Опция подогрева корпус до ста градусов греет, правда? Обожгусь?"),
  /максимальная — \*\*\+40/u
);
assert.doesNotMatch(
  tryDeterministicSdb702nmAnswer("Буква W на дисплее выскочила, это код ошибки?"),
  /нет кодов ошибок/u
);
const heatingMax = tryDeterministicSdb702nmAnswer("Какая максимальная температура подогрева?");
assert.match(heatingMax, /\+40/u);
assert.doesNotMatch(heatingMax, /100/u);

const foreign = classifySdb702nmMessage("Какая мощность у SDB1106NM?");
assert.equal(foreign.action, "FOREIGN_MODEL");

const offTopic = classifySdb702nmMessage("Напиши программу на Python");
assert.equal(offTopic.action, "OFF_TOPIC");
assert.equal(classifySdb702nmMessage("Как сварить борщ?").action, "OFF_TOPIC");

const unsupported = classifySdb702nmMessage("Поддерживает ли шкаф Wi-Fi?");
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
  const answer = tryDeterministicSdb702nmAnswer(question);
  assert.ok(answer, `No deterministic answer for ChatGPT case: ${question}`);
  assert.match(answer, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu"));
}

const scoped = classifySdb702nmMessage("Как настроить влажность?");
assert.equal(scoped.action, "IN_SCOPE");

const equipment = { id: "w-700", name: "SDB702 NM" };
assert.deepEqual(foreignSdbModels("Сравни с SDB1106NM", equipment), ["SDB1106NM"]);
assert.match(anchorQueryToEquipmentModel("какой вес", equipment), /SDB702NM/u);
assert.doesNotMatch(anchorQueryToEquipmentModel("какой вес SDB702NM", equipment), /SDB1106NM/u);

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
    sectionHintsForSdb702nmMessage(question).includes(expectedHint),
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
  ["Сколько колёс кладут в поставку 702?", "таблица 1.2"],
];
for (const [question, expectedHint] of conversationalHintCases) {
  assert.ok(
    sectionHintsForSdb702nmMessage(question).includes(expectedHint),
    `No ${expectedHint} hint for conversational: ${question} → ${sectionHintsForSdb702nmMessage(question).join(", ")}`
  );
}
assert.equal(
  sectionHintsForSdb702nmMessage("Красный мигает, это уже авария или так и должно?").includes("2.4"),
  false,
  "Blinking red must not be steered to emergency 2.4"
);
assert.equal(
  sectionHintsForSdb702nmMessage("А у нас в цехе градусов 12, шкаф вообще можно включать или лучше не надо?").includes("5"),
  false,
  "Shop temperature must not be steered to storage section 5"
);

const eq302 = { id: "w-700" };
const shopTempExpanded = expandRetrievalSynonyms(
  "А у нас в цехе градусов 12, шкаф вообще можно включать",
  eq302
);
assert.match(shopTempExpanded, /\+15/);
assert.doesNotMatch(shopTempExpanded, /\+40/);
assert.match(expandRetrievalSynonyms("подогрев", { id: "sdb702-nm" }), /\+40/);
assert.match(expandRetrievalSynonyms("подогрев", eq302), /\+40/);
assert.match(
  expandRetrievalSynonyms("Красный мигает, это уже авария или так и должно?", eq302),
  /1\.1\.4\.3\.3/
);
assert.match(expandRetrievalSynonyms("что за красная лампочка?", eq302), /1\.1\.4\.3\.3/);
assert.match(expandRetrievalSynonyms("что за красная лампочка?", eq302), /индикатор/);
assert.match(expandRetrievalSynonyms("Как начать работу с шкафом?", eq302), /тумблер/);

const startBlocks = buildSdb702nmLlmAnswerCompositionBlocks("", "Как начать работу с шкафом?").join("\n");
assert.match(startBlocks, /2\.2\.5/u);
const redBlocks = buildSdb702nmLlmAnswerCompositionBlocks("", "Красный мигает, это уже авария или так и должно?").join("\n");
assert.match(redBlocks, /Осушения/u);
const lampBlocks = buildSdb702nmLlmAnswerCompositionBlocks("", "что за красная лампочка?").join("\n");
assert.match(lampBlocks, /лампочк/iu);
assert.match(lampBlocks, /1\.1\.4\.3\.3/);

const rewritePrompt = buildQueryRewriteSystemPrompt(equipment);
const answerPrompt = buildGeneralFactSystemPrompt(equipment, "Таблица SDB702NM.");
assert.match(rewritePrompt, /SDB702 NM/u);
assert.doesNotMatch(rewritePrompt, /SDB1106NM/u);
assert.match(answerPrompt, /только SDB702 NM/u);
assert.doesNotMatch(answerPrompt, /Целевая модель — только SDB1106NM/u);

const overviewContext =
  "SDB702NM. Эксплуатация шкафа. Режим хранения до 8 Вт. Масса 90 кг. Габариты 602×1952×772 мм. Перед включением выполните внешний осмотр.";
const overviewAnswer =
  "Эксплуатация SDB702 NM включает режим хранения с потреблением до **8 Вт**, массу **90 кг** и габариты **602×1952×772 мм**. Перед включением выполняют внешний осмотр.";
const overviewValidation = validateSdb702nmAnswerAgainstContext(overviewAnswer, overviewContext, {
  intentType: "PROCEDURE_QUERY",
  originalQuery: "Расскажи про эксплуатацию этого шкафа",
});
assert.equal(overviewValidation.ok, true, `Overview validation failed: ${JSON.stringify(overviewValidation.failures)}`);

const wrongPowerValidation = validateSdb702nmAnswerAgainstContext(
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

const postGate = applySdb702nmPostGate({
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

const leakValidation = validateSdb702nmAnswerAgainstContext(
  "Масса шкафа SDB1106NM составляет 180 кг.",
  overviewContext,
  { intentType: "FACT_QUERY", originalQuery: "Какой вес?" },
);
assert.equal(leakValidation.ok, false, `1106 leak should fail: ${JSON.stringify(leakValidation.failures)}`);

const inventedProcedureValidation = validateSdb702nmAnswerAgainstContext(
  "1. Нажмите кнопку тестового режима.\n2. Откройте меню диагностики.\n3. Подтвердите сигнал.",
  "SDB702NM. Режим хранения.",
  { intentType: "PROCEDURE_QUERY", originalQuery: "Как проверить сигнализацию?" },
);
assert.equal(
  inventedProcedureValidation.ok,
  false,
  `Invented steps should fail: ${JSON.stringify(inventedProcedureValidation.failures)}`,
);

const directPrompt = buildSdb702nmDirectSystemPrompt(equipment, { manualLoaded: true });
assert.match(directPrompt, /тестов(?:ый|ого)\s+режим/i);
assert.match(directPrompt, /SDB702NM/u);
assert.match(directPrompt, /285\s*Вт/u);

const recoveryPostGate = applySdb702nmPostGate({
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
assert.match(recoveryPostGate.answer, /90\s*кг/u);
assert.equal(recoveryPostGate.postGateTrace.deterministicRecovery, true);

const supportAnswer = tryDeterministicSdb702nmAnswer("Как написать в поддержку?");
assert.ok(supportAnswer, "contact support should be deterministic");
assert.match(supportAnswer, /8 \(800\) 200-54-17/u);
assert.match(supportAnswer, /Техподдержка/u);
assert.match(supportAnswer, /info@sovtest-ate\.ru/u);
assert.doesNotMatch(supportAnswer, /Пример:/u);

const sovtPhone = tryDeterministicSdb702nmAnswer("Номер совтеста");
assert.ok(sovtPhone, "sovtest phone should route to contact support");
assert.match(sovtPhone, /8 \(800\) 200-54-17/u);
assert.match(sovtPhone, /Техподдержка/u);
assert.doesNotMatch(sovtPhone, /Серийные номера/u);

const sovtCall = tryDeterministicSdb702nmAnswer("Как позвонить в совтест");
assert.ok(sovtCall, "sovtest call should route to contact support");
assert.match(sovtCall, /8 \(800\) 200-54-17/u);

const gateCall = classifySdb702nmMessage("Как позвонить в совтест", { equipmentChatScoped: true });
assert.equal(gateCall.action, "CONTACT_SUPPORT", "contact support gate for pozvonit v sovtest");
assert.match(gateCall.reply, /8 \(800\) 200-54-17/u);

const manufacturerContact = tryDeterministicSdb702nmAnswer("Как связаться с предприятием-изготовителем?");
assert.ok(manufacturerContact, "manufacturer contact should be deterministic");
assert.match(manufacturerContact, /8 \(800\) 200-54-17/u);
assert.match(manufacturerContact, /info@sovtest-ate\.ru/u);
assert.equal(
  classifySdb702nmMessage("Как связаться с предприятием-изготовителем?", { equipmentChatScoped: true }).action,
  "CONTACT_SUPPORT",
);

const factorySerial = tryDeterministicSdb702nmAnswer("Где найти серийный номер шкафа?");
assert.match(factorySerial, /заводск/u);
assert.match(factorySerial, /квартал/u);
assert.match(factorySerial, /SDB702NM/u);
assert.doesNotMatch(factorySerial, /SDB302NM/u);
assert.match(tryDeterministicSdb702nmAnswer("Где на шкафу серийный номер искать?"), /SDB702NM/u);
assert.doesNotMatch(tryDeterministicSdb702nmAnswer("Где на шкафу серийный номер искать?"), /SDB302NM/u);

const brokenGlass = tryDeterministicSdb702nmAnswer("Разбилось стекло в двери");
assert.match(brokenGlass, /механическ/u);
assert.match(brokenGlass, /8 \(800\) 200-54-17/u);
assert.doesNotMatch(brokenGlass, /марка или тип стекла/u);
const brokenFollowUp = tryDeterministicSdb702nmAnswer("Оно разбилось", {
  history: [{ role: "user", content: "Разбилось стекло в двери" }],
});
assert.match(brokenFollowUp, /механическ/u);
assert.match(tryDeterministicSdb702nmAnswer("Куда обратиться чтобы починили"), /8 \(800\) 200-54-17/u);

for (const q of ["Как заменить LCD", "Как заменить замок", "Как заменить колёса", "Как починить подогрев"]) {
  const ans = tryDeterministicSdb702nmAnswer(q);
  assert.match(ans, /нет инструкции по замене/u, q);
  assert.match(ans, /8 \(800\) 200-54-17/u, q);
}
for (const q of ["Как заменить осушитель", "Как заменить уплотнитель", "Как заменить кабель питания", "Как починить звуковой сигнал"]) {
  const ans = tryDeterministicSdb702nmAnswer(q) || "";
  assert.doesNotMatch(ans, /нет инструкции по замене/u, q);
}
assert.match(tryDeterministicSdb702nmAnswer("Как заменить осушитель"), /36 месяцев/u);

const {
  extractSpecTableFlattenedChunks,
  extractPossibleFaultsListChunks,
} = require("../src/rag/chunking");
const fs = require("node:fs");
const path = require("node:path");
const redLampCard = fs.readFileSync(
  path.join(__dirname, "..", "knowledge", "sdb702-nm", "retrieval-cards", "red-lamp.md"),
  "utf8"
);
assert.ok(redLampCard.includes("лампочка"));
const cardSpecChunks = extractSpecTableFlattenedChunks(redLampCard, { equipmentName: "SDB702 NM" });
assert.equal(cardSpecChunks.length, 0, "retrieval cards must not inherit SDB1106 table 1.1");
const cardFaultChunks = extractPossibleFaultsListChunks(redLampCard, { equipmentName: "SDB702 NM" });
assert.equal(
  cardFaultChunks.filter((ch) => /SDB1106NM/i.test(ch.content) || ch.metadata?.humidityInspectionChecklist).length,
  0,
  "retrieval cards must not inherit 1106 humidity checklist"
);

const cardPins = [
  ["А у нас в цехе градусов 12, шкаф вообще можно включать или лучше не надо?", "temp-contrast.md"],
  ["Помещение +12 °C, шкаф в рабочем диапазоне или нет?", "temp-contrast.md"],
  ["Опция подогрева корпус до ста градусов греет, правда? Обожгусь?", "temp-contrast.md"],
  ["Сколько колёс кладут в поставку 702?", "feet-wheels.md"],
  ["Тумблер питания где искать, на кожухе сзади?", "power-on.md"],
  ["Буква W на дисплее выскочила, это код ошибки?", "yellow-and-w.md"],
  ["Зелёный сигнал горит, это какой режим сейчас?", "yellow-and-w.md"],
  ["Регенерация сколько минут длится примерно?", "yellow-and-w.md"],
  ["Азот это опция или в базовой поставке уже стоит?", "nitrogen-option.md"],
];
for (const [question, file] of cardPins) {
  assert.ok(
    retrievalCardFilesForSdb702nmQuery(question).includes(file),
    `No card pin ${file} for: ${question} → ${retrievalCardFilesForSdb702nmQuery(question).join(", ")}`
  );
}
assert.equal(
  retrievalCardFilesForSdb702nmQuery("Регенерация сколько минут длится примерно?").includes("humidity-time.md"),
  false,
  "Regen duration must not pin humidity-time (3 hours)"
);

console.log(`SDB702NM profile checks passed: ${cases.length + 18 + sectionCases.length + chatgptCases.length}`);
