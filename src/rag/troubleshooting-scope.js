/** Troubleshooting SDB1106NM: «Перечень возможных неисправностей», влажность не падает. */

const POSSIBLE_FAULTS_LIST_MARKERS_RE =
  /перечень\s+возможных|возможн(?:ые|ых)\s+неисправ|типов(?:ые|ых)\s+неисправ|таблиц[аы]\s*3\.2|симптом:\s*|неисправность\s+sdb1106nm|2\.2\.2\.(?:1|2|3)\b|внешний\s+осмотр/i;

function isHumidityNotDroppingQuery(text) {
  const q = String(text || "");
  return (
    /влажност/i.test(q) &&
    /не\s+(?:падает|снижается|уменьшается|выходит|достигает)|не\s+выходит\s+на|не\s+держит|не\s+сушит|высокая\s+влажност/i.test(
      q
    )
  );
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

function appendHumidityMandatoryChecks(answer) {
  const base = String(answer || "").trim();
  if (!base || answerCoversHumidityMandatoryChecks(base)) {
    return base;
  }
  const block = [
    "Что проверить (п. 2.2.2, перечень возможных неисправностей / табл. 3.2):",
    ...HUMIDITY_MANDATORY_CHECKS.map((line, idx) => `${idx + 1}. ${line}`),
  ].join("\n");
  return `${base}\n\n${block}`;
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
  isTroubleshootingQueryIntent,
  troubleshootingSectionHintsForQuery,
  HUMIDITY_MANDATORY_CHECKS,
  answerCoversHumidityMandatoryChecks,
  appendHumidityMandatoryChecks,
  chunkIsPossibleFaultsList,
};
