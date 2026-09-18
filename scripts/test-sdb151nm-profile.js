const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  tryDeterministicSdb151nmAnswer,
} = require("../src/rag/sdb151nm-direct-facts");
const {
  classifySdb151nmMessage,
} = require("../src/rag/sdb151nm-chat-gate");
const {
  anchorQueryToEquipmentModel,
  foreignSdbModels,
} = require("../src/rag/sdb-model-scope");
const {
  sectionHintsForSdb151nmMessage,
} = require("../src/rag/sdb151nm-rag-priority");
const { buildQueryRewriteSystemPrompt, buildGeneralFactSystemPrompt, buildSdb151nmDirectSystemPrompt } = require("../src/rag/prompts");
const { validateSdb151nmAnswerAgainstContext } = require("../src/rag/sdb151nm-answer-validation");
const { applySdb151nmPostGate } = require("../src/rag/sdb151nm-post-gate");

const cases = [
  ["внутренний объем", "не указан"],
  ["Какой полный объем шкафа?", "не указан"],
  ["Сколько полок?", "3"],
  ["Сколько дверей?", "не указан"],
  ["Какие габариты?", "602 × 655 × 772"],
  ["Какой вес?", "46"],
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
  ["Что входит в базовую комплектацию?", "3 перфорированные полки"],
  ["Чем осушитель поглощает влагу?", "цеолитом"],
  ["Как часто менять осушитель?", "36 месяцев"],
  ["Какая максимальная температура подогрева?", "не приведена"],
  ["До скольки подогрев?", "не приведена"],
  ["Что на дисплее горит в обычной работе?", "влажност"],
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
  const answer = tryDeterministicSdb151nmAnswer(question);
  assert.ok(answer, `No deterministic answer for: ${question}`);
  assert.match(answer, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu"));
}

const foreign = classifySdb151nmMessage("Какая мощность у SDB1106NM?");
assert.equal(foreign.action, "FOREIGN_MODEL");

const offTopic = classifySdb151nmMessage("Напиши программу на Python");
assert.equal(offTopic.action, "OFF_TOPIC");
assert.equal(classifySdb151nmMessage("Как сварить борщ?").action, "OFF_TOPIC");

const unsupported = classifySdb151nmMessage("Поддерживает ли шкаф Wi-Fi?");
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
  const answer = tryDeterministicSdb151nmAnswer(question);
  assert.ok(answer, `No deterministic answer for ChatGPT case: ${question}`);
  assert.match(answer, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu"));
}

const scoped = classifySdb151nmMessage("Как настроить влажность?");
assert.equal(scoped.action, "IN_SCOPE");

const equipment = { id: "sdb151-nm", name: "SDB151 NM" };
assert.deepEqual(foreignSdbModels("Сравни с SDB1106NM", equipment), ["SDB1106NM"]);
assert.match(anchorQueryToEquipmentModel("какой вес", equipment), /SDB151NM/u);
assert.doesNotMatch(anchorQueryToEquipmentModel("какой вес SDB151NM", equipment), /SDB1106NM/u);

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
    sectionHintsForSdb151nmMessage(question).includes(expectedHint),
    `No ${expectedHint} hint for: ${question}`
  );
}

const rewritePrompt = buildQueryRewriteSystemPrompt(equipment);
const answerPrompt = buildGeneralFactSystemPrompt(equipment, "Таблица SDB151NM.");
assert.match(rewritePrompt, /SDB151 NM/u);
assert.doesNotMatch(rewritePrompt, /SDB1106NM/u);
assert.match(answerPrompt, /только SDB151 NM/u);
assert.doesNotMatch(answerPrompt, /Целевая модель — только SDB1106NM/u);

const overviewContext =
  "SDB151NM. Эксплуатация шкафа. Режим хранения до 8 Вт. Масса 46 кг. Габариты 602×655×772 мм. Перед включением выполните внешний осмотр.";
const overviewAnswer =
  "Эксплуатация SDB151 NM включает режим хранения с потреблением до **8 Вт**, массу **46 кг** и габариты **602×655×772 мм**. Перед включением выполняют внешний осмотр.";
const overviewValidation = validateSdb151nmAnswerAgainstContext(overviewAnswer, overviewContext, {
  intentType: "PROCEDURE_QUERY",
  originalQuery: "Расскажи про эксплуатацию этого шкафа",
});
assert.equal(overviewValidation.ok, true, `Overview validation failed: ${JSON.stringify(overviewValidation.failures)}`);

const wrongPowerValidation = validateSdb151nmAnswerAgainstContext(
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

const postGate = applySdb151nmPostGate({
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

const leakValidation = validateSdb151nmAnswerAgainstContext(
  "Масса шкафа SDB1106NM составляет 180 кг.",
  overviewContext,
  { intentType: "FACT_QUERY", originalQuery: "Какой вес?" },
);
assert.equal(leakValidation.ok, false, `1106 leak should fail: ${JSON.stringify(leakValidation.failures)}`);

const inventedProcedureValidation = validateSdb151nmAnswerAgainstContext(
  "1. Нажмите кнопку тестового режима.\n2. Откройте меню диагностики.\n3. Подтвердите сигнал.",
  "SDB151NM. Режим хранения.",
  { intentType: "PROCEDURE_QUERY", originalQuery: "Как проверить сигнализацию?" },
);
assert.equal(
  inventedProcedureValidation.ok,
  false,
  `Invented steps should fail: ${JSON.stringify(inventedProcedureValidation.failures)}`,
);

const directPrompt = buildSdb151nmDirectSystemPrompt(equipment, { manualLoaded: true });
assert.match(directPrompt, /тестов(?:ый|ого)\s+режим/i);
assert.match(directPrompt, /SDB151NM/u);
assert.match(directPrompt, /285\s*Вт/u);

const recoveryPostGate = applySdb151nmPostGate({
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
assert.match(recoveryPostGate.answer, /46\s*кг/u);
assert.equal(recoveryPostGate.postGateTrace.deterministicRecovery, true);

const supportAnswer = tryDeterministicSdb151nmAnswer("Как написать в поддержку?");
assert.ok(supportAnswer, "contact support should be deterministic");
assert.match(supportAnswer, /8 \(800\) 200-54-17/u);
assert.match(supportAnswer, /Техподдержка/u);
assert.match(supportAnswer, /info@sovtest-ate\.ru/u);
assert.doesNotMatch(supportAnswer, /Пример:/u);

const sovtPhone = tryDeterministicSdb151nmAnswer("Номер совтеста");
assert.ok(sovtPhone, "sovtest phone should route to contact support");
assert.match(sovtPhone, /8 \(800\) 200-54-17/u);
assert.match(sovtPhone, /Техподдержка/u);
assert.doesNotMatch(sovtPhone, /Серийные номера/u);

const sovtCall = tryDeterministicSdb151nmAnswer("Как позвонить в совтест");
assert.ok(sovtCall, "sovtest call should route to contact support");
assert.match(sovtCall, /8 \(800\) 200-54-17/u);

const gateCall = classifySdb151nmMessage("Как позвонить в совтест", { equipmentChatScoped: true });
assert.equal(gateCall.action, "CONTACT_SUPPORT", "contact support gate for pozvonit v sovtest");
assert.match(gateCall.reply, /8 \(800\) 200-54-17/u);

const manufacturerContact = tryDeterministicSdb151nmAnswer("Как связаться с предприятием-изготовителем?");
assert.ok(manufacturerContact, "manufacturer contact should be deterministic");
assert.match(manufacturerContact, /8 \(800\) 200-54-17/u);
assert.equal(
  classifySdb151nmMessage("Как связаться с предприятием-изготовителем?", { equipmentChatScoped: true }).action,
  "CONTACT_SUPPORT",
);

const factorySerial = tryDeterministicSdb151nmAnswer("Где найти серийный номер шкафа?");
assert.match(factorySerial, /заводск/u);
assert.match(factorySerial, /квартал/u);

const brokenGlass = tryDeterministicSdb151nmAnswer("Разбилось стекло в двери");
assert.match(brokenGlass, /механическ/u);
assert.match(brokenGlass, /8 \(800\) 200-54-17/u);
assert.doesNotMatch(brokenGlass, /марка или тип стекла/u);
const brokenFollowUp = tryDeterministicSdb151nmAnswer("Оно разбилось", {
  history: [{ role: "user", content: "Разбилось стекло в двери" }],
});
assert.match(brokenFollowUp, /механическ/u);
assert.match(tryDeterministicSdb151nmAnswer("Куда обратиться чтобы починили"), /8 \(800\) 200-54-17/u);

for (const q of ["Как заменить LCD", "Как заменить замок", "Как заменить колёса", "Как починить подогрев"]) {
  const ans = tryDeterministicSdb151nmAnswer(q);
  assert.match(ans, /нет инструкции по замене/u, q);
  assert.match(ans, /8 \(800\) 200-54-17/u, q);
}
for (const q of ["Как заменить осушитель", "Как заменить уплотнитель", "Как заменить кабель питания", "Как починить звуковой сигнал"]) {
  const ans = tryDeterministicSdb151nmAnswer(q) || "";
  assert.doesNotMatch(ans, /нет инструкции по замене/u, q);
}
assert.match(tryDeterministicSdb151nmAnswer("Как заменить осушитель"), /36 месяцев/u);

const liveManualCases = [
  ["Колёса в комплекте?", /не входят/u],
  ["Есть ли регулируемые ножки?", /4 регулируем/u],
  ["Какой длины шнур питания?", /4\s*м/u],
  ["Есть ли подогрев у 151?", /1\.4/u],
  ["До скольки подогрев?", /1\.4|не приведена/u],
  ["До скольки подогрев", /1\.4|не приведена/u],
  ["Что на дисплее горит в обычной работе?", /влажност/u],
  ["Какой объём в литрах?", /не указан/u],
  ["Из чего корпус?", /стал/u],
  ["Можно ли самому поменять стекло?", /нет инструкции по замене/u],
  ["Куда звонить если сломался?", /8 \(800\) 200-54-17/u],
  ["Влажность не падает, что делать?", /отсутствии снижения влажности/u],
];
for (const [q, re] of liveManualCases) {
  const ans = tryDeterministicSdb151nmAnswer(q) || "";
  assert.match(ans, re, `live: ${q} => ${ans.slice(0, 120)}`);
}

console.log(`SDB151NM profile checks passed: ${cases.length + 18 + sectionCases.length + chatgptCases.length}`);

const profile = require("../src/equipment/profiles/sdb151-nm");
const catalog = require("../src/equipment/catalogs/sdb151-nm");
const { resolveEquipmentProfile } = require("../src/equipment/equipment-runtime");
assert.equal(resolveEquipmentProfile("sdb151-nm"), profile);
assert.equal(profile.catalog, catalog);
assert.equal(catalog.model, "SDB151NM");
assert.match(tryDeterministicSdb151nmAnswer("Что входит в базовую комплектацию?"), /не входят/u);

const {
  filterSdb151nmContextText,
  filterSdb151nmChunks,
  prependSdb151nmContextPreface,
} = require("../src/rag/sdb151nm-context-filter");
const { sdb151InventedProcedureFailures } = require("../src/rag/sdb151nm-procedure-validation");
const { formatContextForPrompt } = require("../src/rag/retrieval");
const { equipmentIsSdb151nm } = require("../src/rag/query-intent");

const familyTable = [
  "SDB151NM\t602**\t655*\t772\t46",
  "SDB702NM\t602**\t1952*\t772\t90",
  "Шкаф установлен на колеса для транспортирования. Каждое колесо имеет антистатическую опору.",
  "\tКолеса для транспортирования (только для моделей SDB302, SDB702, SDB702M, SDB1106, SDB1560М, SDB302NM, SDB702NM и SDB1106NM)\t4",
  "\tдля модели SDB151, SDB151NM\t3",
  "\tСистема подогрева воздуха для шкафов SDB302, SDB306, SDB702, SDB702М, SDB302NM, SDB702NM\t1",
  "SDB151, SDB302, SDB306, SDB702, SDB702M, SDB151NM, SDB302NM, SDB702NM:\tне более 405 Вт;",
].join("\n");
const filtered151 = filterSdb151nmContextText(familyTable);
assert.match(filtered151, /46/u);
assert.match(filtered151, /не более 405/u);
assert.match(filtered151, /SDB151NM/u);
assert.match(filtered151, /для модели SDB151NM/u);
assert.doesNotMatch(filtered151, /SDB702NM/u);
assert.doesNotMatch(filtered151, /90/u);
assert.doesNotMatch(filtered151, /установлен на кол/u);
assert.match(filtered151, /не входят|не указаны/u);
assert.match(filtered151, /не приведена/u);

const heatingOrphan = filterSdb151nmContextText(
  "Кнопками «UP» и «DN» установить требуемое значение температуры воздуха (диапазон установки от текущей температуры окружающей среды + 5 °С до плюс 40 °С)."
);
assert.equal(heatingOrphan, "", "heating +40 range must not stay in 151 context");

const scopedManual = require("../src/rag/sdb151nm-context-filter").buildSdb151nmScopedManual(familyTable);
assert.match(scopedManual, /выборка для поиска/u);
assert.match(scopedManual, /46/u);
assert.doesNotMatch(scopedManual, /1952/u);

const scopedPath = path.join(__dirname, "../knowledge/sdb151-nm/Руководство SDB151NM.md");
const scopedOnDisk = fs.readFileSync(scopedPath, "utf8");
assert.match(scopedOnDisk, /SDB151NM\s+602/u);
assert.match(scopedOnDisk, /текущее значение влажности/u);
assert.match(scopedOnDisk, /светится зеленый индикатор/u);
assert.doesNotMatch(scopedOnDisk, /SDB702NM/u);
assert.doesNotMatch(scopedOnDisk, /установлен на кол/u);

const { shouldSkipSdb151FamilyBinary } = require("./knowledge-content-loader");
assert.equal(
  shouldSkipSdb151FamilyBinary("sdb151-nm", "Руководство SDB151NM.doc", [
    { relativePath: "Руководство SDB151NM.md" },
    { relativePath: "Руководство SDB151NM.doc" },
  ]),
  true
);
assert.equal(
  shouldSkipSdb151FamilyBinary("sdb702-nm", "Руководство SDB702NM.md", [
    { relativePath: "Руководство SDB702NM.md" },
  ]),
  false
);

const filteredChunks = filterSdb151nmChunks([
  { content: "SDB702NM 90 кг", sourceDoc: "re", chunkIndex: 0, metadata: {} },
  { content: "SDB151NM 46 кг", sourceDoc: "re", chunkIndex: 1, metadata: {} },
]);
assert.equal(filteredChunks.length, 1);
assert.match(filteredChunks[0].content, /46/u);

const prefaced = prependSdb151nmContextPreface(filtered151);
assert.match(prefaced, /Ограничения контекста только для SDB151NM/u);

assert.equal(equipmentIsSdb151nm({ id: "sdb151-nm", name: "SDB151 NM" }), true);
assert.equal(equipmentIsSdb151nm({ id: "sdb702-nm", name: "SDB702 NM" }), false);
const otherModelContext = formatContextForPrompt([
  { content: "SDB702NM 90 кг", sourceDoc: "re", chunkIndex: 0, metadata: {} },
]);
assert.match(otherModelContext, /90/u, "702/302 retrieval must stay unfiltered");

const heatFail = sdb151InventedProcedureFailures(
  "Опция подогрева позволяет нагрев до +40 °C.",
  "контекст РЭ",
  {}
);
assert.ok(
  heatFail.some((f) => f.detail === "invented_sdb151_heating_option"),
  "heating +40 without denial must fail"
);
const heatOk = sdb151InventedProcedureFailures(
  "В табл. 1.4 опция подогрева для SDB151NM не приведена.",
  "контекст РЭ",
  {}
);
assert.equal(
  heatOk.filter((f) => f.detail === "invented_sdb151_heating_option").length,
  0
);
const powerOk = sdb151InventedProcedureFailures(
  "Максимальная потребляемая мощность в режиме хранения с системами подачи азота и подогрева воздуха — не более 405 Вт (п. 1.1.2.7).",
  "контекст РЭ",
  {}
);
assert.equal(
  powerOk.filter((f) => f.detail === "invented_sdb151_heating_option").length,
  0,
  "power line with heating must not fail as heating option"
);

const { expandRetrievalSynonyms } = require("../src/rag/query-rewriting");
assert.doesNotMatch(expandRetrievalSynonyms("подогрев", { id: "sdb151-nm" }), /\+40/);
assert.match(expandRetrievalSynonyms("подогрев", { id: "sdb702-nm" }), /\+40/);
assert.match(expandRetrievalSynonyms("подогрев"), /\+40/);
