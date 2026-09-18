/**
 * Когда ответ должен идти через retrieval + LLM, а не pre-LLM golden-router.
 */

const PROCEDURAL_OPEN_RE =
  /(?:опиш|расскаж|что\s+входит|как\s+работ|что\s+произойд|что\s+будет|что\s+случит|запрещ(?:ен|ено)|можно\s+ли|нужно\s+ли|допускается\s+ли|регулир|расстояни|конвекц|проверить|калибр|освещен|дооснаст|типов(?:ые|ых)\s+неисправ|метод(?:ы)?\s+устран|погрузочн|разгрузочн|ротаметр|концентрац|таймер|открыт[аоы]?\s+двер|забыл[аи]?\s+закрыт[аоы]?\s+двер|двер[а-я]*\s+открыт[аоы]?|более\s+1\s+мин|пару\s+минут|вентилятор\s+осушител|прозрачн|вставк|стекл|перепад|стабилиз|защит[аы]\s+от\s+перепад)/iu;

const PROCEDURAL_ROUTE_RE =
  /(?:как\s+включ|как\s+запуст|порядок|последовательност|перед\s+запуском|что\s+делать|алгоритм|процедур)/iu;

function prefersRagOverDeterministic(message, routerDecision = {}) {
  const route = routerDecision?.route || "";
  if (route === "PROCEDURAL_QA" || route === "REASONING_QA" || route === "TROUBLESHOOTING_QA") {
    return true;
  }
  // hybrid_wide — только шире recall в retrieval; не отменяет golden deterministic (мощность, частота, масса…)
  const m = String(message || "");
  if (
    routerDecision?.retrievalMode === "procedural_focused" &&
    (PROCEDURAL_OPEN_RE.test(m) || PROCEDURAL_ROUTE_RE.test(m))
  ) {
    return true;
  }
  if (PROCEDURAL_OPEN_RE.test(m) || PROCEDURAL_ROUTE_RE.test(m)) {
    return true;
  }
  if (routerDecision?.intent === "MAINTENANCE_QUERY" && /как\s+часто|периодич|калибр|провер/i.test(m)) {
    return true;
  }
  return false;
}

/** Доп. якоря разделов РЭ для hybrid FTS / section filter. */
function proceduralSectionHintsForMessage(message) {
  const m = String(message || "");
  const hints = [];
  if (/регенерац|цеолит|осушител.*цикл|60\s*мин/i.test(m)) {
    hints.push("1.1.4.4", "регенерац");
  }
  if (/азот|ротаметр|концентрац.*азот|как\s+работает.*азот|систем.*азот|n2/i.test(m)) {
    hints.push("1.1.2.6", "1.2", "азот", "ротаметр", "Рпос", "Ррег", "концентрация азота", "подача азота");
  }
  if (/двер|звук|сигнал|пищит|открыт|забыл\s+закрыть|пару\s+минут/i.test(m)) {
    hints.push("1.1.4.3.4", "2.2.2.3", "двер", "вентилятор осушителя", "LCD", "красный индикатор");
  }
  if (/полк|конвекц|погруз|разгруз|нагрузк/i.test(m)) {
    hints.push("1.1.2.8", "2.1", "8.1", "полк");
  }
  if (/освещен|рабоч(?:его|ий)\s+объем/i.test(m)) {
    hints.push("1.2", "освещ");
  }
  if (/дым|гари|авар|2\.4|экстремальн/i.test(m)) {
    hints.push("2.4", "экстремальн");
  }
  if (/осмотр|визуальн|2\.2\.2|заземл|кабел/i.test(m)) {
    hints.push("2.2.2", "2.2.3", "2.2.4");
  }
  if (/неисправ|3\.1\.4|таблиц[аы]?\s*3\.2/i.test(m)) {
    hints.push("3.1.4", "3.2", "неисправ");
  }
  if (/режим|хранен|осушен/i.test(m) && /опис|что\s+происход|кратко/i.test(m)) {
    hints.push("2.2", "1.1.4.4", "режим");
  }
  return [...new Set(hints)];
}

function expandProceduralRetrievalSynonyms(query) {
  const q = String(query || "");
  const extras = [];
  if (/регулир.*полк|полк.*регулир|шаг.*полк|между\s+полк/i.test(q)) {
    extras.push("1.1.2.8", "полка", "регулирование", "конвекция", "расстояние");
  }
  if (/конвекц|расстояни.*полк|50\s*мм.*стен/i.test(q)) {
    extras.push("2.1", "подача воздуха", "стенок шкафа", "50 мм");
  }
  if (/проверить.*звук|звуковой\s+сигнал|сигнализац/i.test(q)) {
    extras.push("1.1.4.3.4", "открытие двери", "датчик двери", "2.2.2.3");
  }
  if (/освещен/i.test(q)) {
    extras.push("опция", "освещение рабочего объема", "1.2");
  }
  if (/погрузочн|разгрузочн/i.test(q)) {
    extras.push("2.1", "запрещ", "выдвижн", "полк");
  }
  if (/ротаметр|таймер.*азот|концентрац.*азот/i.test(q)) {
    extras.push("ротаметр", "Рпос", "Ррег", "99.9", "00.0");
  }
  if (/открыт.*двер|забыл.*закрыт.*двер|пару\s+минут|1\s+минут|что\s+случит/i.test(q)) {
    extras.push(
      "вентилятор осушителя",
      "1.1.4.3.4",
      "LCD",
      "красный индикатор",
      "символ открытой двери"
    );
  }
  return extras;
}

module.exports = {
  prefersRagOverDeterministic,
  proceduralSectionHintsForMessage,
  expandProceduralRetrievalSynonyms,
};
