/** Детекторы критических вопросов безопасности / аварий SDB1106NM. */

function isEmergencySmokeQuery(text) {
  const q = String(text || "");
  return /дым|задымлен|вспышк|искр[аы]\s+в\s+шкаф|появил[а-яё]*\s+дым|запах\s+гар|пахнет\s+горел|горелым/i.test(
    q
  );
}

function isRegenerationShutdownQuery(text) {
  const q = String(text || "");
  return (
    /регенерац/i.test(q) &&
    /выключ|отключ|обесточ|снять\s+питан|выруб|отключить\s+питан|можно\s+ли\s+выключ/i.test(q)
  );
}

function isRegenerationSafetyTopic(text) {
  return /регенерац/i.test(String(text || ""));
}

function contextHasMandatoryAnswerTriggers(contextStr) {
  const ctx = String(contextStr || "");
  return /регенерац|ЗАПРЕЩАЕТСЯ|дым|шаг|дискретност|0[,.]1\s*%\s*RH|0[,.]1\s*RH%|влажност/i.test(ctx);
}

function sectionHintsForQuery(text) {
  if (isEmergencySmokeQuery(text)) {
    return ["2.4", "экстремальн", "действия"];
  }
  if (isRegenerationShutdownQuery(text)) {
    return ["1.1.4.4.3", "1.1.4.4", "регенерац", "ЗАПРЕЩАЕТСЯ"];
  }
  return [];
}

module.exports = {
  isEmergencySmokeQuery,
  isRegenerationShutdownQuery,
  isRegenerationSafetyTopic,
  contextHasMandatoryAnswerTriggers,
  sectionHintsForQuery,
};
