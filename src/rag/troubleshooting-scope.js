/** Troubleshooting SDB1106NM: «Перечень возможных неисправностей», влажность не падает. */

const POSSIBLE_FAULTS_LIST_MARKERS_RE =
  /перечень\s+возможных|возможн(?:ые|ых)\s+неисправ|типов(?:ые|ых)\s+неисправ|таблиц[аы]\s*3\.2|симптом:\s*|неисправность\s+sdb1106nm|2\.2\.2\.(?:1|2|3)\b|внешний\s+осмотр/i;

function isHumidityNotDroppingQuery(text) {
  const q = String(text || "");
  const humidityTopic = /влажност|\brh\b/i.test(q);
  const notDropping =
    /не\s+(?:падает|снижается|уменьшается|выходит|достигает)|не\s+выходит\s+на|не\s+держит|не\s+сушит|высокая\s+влажност/i.test(
      q
    );
  return humidityTopic && notDropping;
}

/** Резкий рост RH (скачок до 85–90 % и т.п.) — не путать с перепадом напряжения. */
function isHumiditySpikeQuery(text) {
  const q = String(text || "");
  if (!/влажност|%rh|\brh\b/i.test(q)) {
    return false;
  }
  if (isHumidityNotDroppingQuery(q)) {
    return false;
  }
  return /скачок|резк|подним|подскоч|вырос|взлет|до\s*\d+\s*%|90\s*%|85\s*%/i.test(q);
}

function isTroubleshootingQueryIntent(intentType) {
  return intentType === "TROUBLESHOOTING_QUERY";
}

function troubleshootingSectionHintsForQuery(text) {
  const q = String(text || "");
  if (!/(?:не\s+работ|не\s+включ|не\s+запуска|неисправ|пищит|сигнал|ошибк|влажност|ethernet|не\s+падает)/iu.test(q)) {
    return [];
  }
  const hints = ["Симптом:", "Неисправность", "3.2", "типовые", "2.2.2"];
  if (isHumidityNotDroppingQuery(q)) {
    hints.push("2.2.2.2", "2.2.2.3", "2.2.2.1", "уплотнител", "осушител", "кожух");
  }
  return hints;
}

const HUMIDITY_MANDATORY_CHECKS = Object.freeze([
  "Проверить состояние резинового (магнитного) уплотнителя дверей на отсутствие повреждений (п. 2.2.2.2).",
  "Проверить плотность закрытия дверей замками; при необходимости отрегулировать ригель замка (п. 2.2.2.3).",
  "Провести визуальный осмотр кожуха и осушающего модуля (осушителя) на отсутствие внешних механических повреждений (п. 2.2.2.1; осушитель в защитном кожухе — п. 1.1.4.2).",
]);

function answerCoversHumidityMandatoryChecks(answer) {
  const a = String(answer || "").toLowerCase();
  const hasSeal = /уплотнител|магнитн.*уплотнител|резинов.*уплотнител/.test(a);
  const hasLock = /замк|плотност.*закрыт|ригел/.test(a);
  const hasDehumidifierVisual =
    /осушител|осушающ|кожух/.test(a) && /поврежден|визуальн|осмотр|внешн/.test(a);
  return hasSeal && hasLock && hasDehumidifierVisual;
}

function isInsignificantAnswerLead(answer) {
  const t = String(answer || "").trim();
  if (!t) return true;
  // Обрезок ответа LLM (напр. одна буква «П» от «Проверьте…»).
  if (t.length <= 3) return true;
  return false;
}

function humidityMandatoryChecksBlock() {
  return [
    "Что проверить (п. 2.2.2, перечень возможных неисправностей / табл. 3.2):",
    ...HUMIDITY_MANDATORY_CHECKS.map((line, idx) => `${idx + 1}. ${line}`),
  ].join("\n");
}

function buildHumidityNotDroppingAnswer(model = "SDB1106NM") {
  return [
    `Если **влажность не снижается** в шкафу **${model}**, проверьте по РЭ:`,
    "",
    "1. **Уплотнитель дверей** — отсутствие повреждений (п. 2.2.2.2).",
    "2. **Замки и плотность закрытия** дверей; при необходимости отрегулируйте ригель (п. 2.2.2.3).",
    "3. **Осушитель** — визуальный осмотр кожуха и осушающего модуля (п. 2.2.2.1; п. 1.1.4.2).",
    "4. **Дверь закрыта** — при открытой двери вентилятор осушителя отключается, RH может не снижаться.",
    "5. При отсутствии снижения **1 %RH за 30 мин** возможна **регенерация** осушителя (жёлтый индикатор, п. 1.1.4.4.3).",
  ].join("\n");
}

function buildHumiditySpikeAnswer(model = "SDB1106NM") {
  return [
    `При **резком росте влажности** в шкафу **${model}** (скачок RH до высоких значений) действуйте по РЭ:`,
    "",
    "1. **Закройте дверь** — при открытой двери вентилятор осушителя отключается (п. **1.1.4.4.1**, **1.1.4.3.4**).",
    "2. **Уплотнитель и замки** — проверьте по п. **2.2.2.2–2.2.2.3**.",
    "3. **Осушитель** — визуальный осмотр кожуха (п. **2.2.2.1**).",
    "4. Если RH не снижается — через **30 ± 1 мин** без снижения на **1 %RH** может включиться **регенерация** (жёлтый индикатор, п. **1.1.4.4.3**). **Запрещено** выключать шкаф в режиме регенерации.",
    "5. При стойко высокой влажности (**85 %RH** и выше) — см. табл. **3.2** (п. **3.1.1**): возможны повреждение уплотнителей или неисправность блока осушения.",
    "",
    "В РЭ **не указаны** отдельные требования к защите от скачков **напряжения** в сети — не путайте с перепадом напряжения.",
  ].join("\n");
}

function appendHumidityMandatoryChecks(answer) {
  const raw = String(answer || "").trim();
  const base = isInsignificantAnswerLead(raw) ? "" : raw;
  if (!base || answerCoversHumidityMandatoryChecks(base)) {
    return base || humidityMandatoryChecksBlock();
  }
  return `${base}\n\n${humidityMandatoryChecksBlock()}`;
}

function chunkIsPossibleFaultsList(chunk) {
  const m = chunk?.metadata || {};
  if (m.possibleFaultsList === true || m.tableToText === true || m.humidityInspectionChecklist === true) {
    return true;
  }
  const hay = `${chunk?.content || ""}\n${chunk?.section || ""}`;
  return POSSIBLE_FAULTS_LIST_MARKERS_RE.test(hay);
}

module.exports = {
  POSSIBLE_FAULTS_LIST_MARKERS_RE,
  isHumidityNotDroppingQuery,
  isHumiditySpikeQuery,
  isTroubleshootingQueryIntent,
  troubleshootingSectionHintsForQuery,
  HUMIDITY_MANDATORY_CHECKS,
  answerCoversHumidityMandatoryChecks,
  isInsignificantAnswerLead,
  humidityMandatoryChecksBlock,
  buildHumidityNotDroppingAnswer,
  buildHumiditySpikeAnswer,
  appendHumidityMandatoryChecks,
  chunkIsPossibleFaultsList,
};
