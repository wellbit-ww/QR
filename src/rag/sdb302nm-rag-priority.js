/**
 * Section anchors and retrieval synonyms for SDB302NM.
 * Conversational probes go to RAG: hints + query expansion, not canned answers.
 */

function isSdb302nmEquipment(equipment) {
  const id = String(equipment?.id || "").toLowerCase();
  return id === "w-700" || id === "sdb302-nm";
}

function isSdb302nmGettingStartedQuery(q) {
  return /как\s+начать\s+работ|с\s+чего\s+начать|только\s+купил|купил\s+(?:шкаф|кабинет)|перв(?:ый|ая|ого)\s+(?:запуск|включ)|ввод\s+в\s+эксплуатац/iu.test(
    q,
  );
}

function isSdb302nmBlinkingRedQuery(q) {
  return /(?:красн[\p{L}]*\s+мига|мига[\p{L}]*\s+красн)/iu.test(q) && !/двер/iu.test(q);
}

/** «красная лампочка / что за красная» — та же индикация, без слова «мигает». */
function isSdb302nmRedLightQuery(q) {
  if (!/красн/iu.test(q)) {
    return false;
  }
  return /ламп|лампочк|огон[её]к|светодиод|индикатор|светов|горит|мига|светит|что\s+за\s+красн/iu.test(q);
}

function isSdb302nmYellowIndicatorQuery(q) {
  return /ж[её]лт/iu.test(q) && /(?:горит|индикатор|ламп|светит|режим|выключ)/iu.test(q);
}

function isSdb302nmWSymbolQuery(q) {
  return /(?:символ\s*w|\bw\s+горит|на\s+экране.{0,24}\bw\b|какая-то\s+w|буква\s*w|w\s+на\s+диспл|\bw\b.{0,40}ошибк|ошибк.{0,40}\bw\b)/iu.test(
    q,
  );
}

function isSdb302nmGreenIndicatorQuery(q) {
  return /зелён/iu.test(q) && /(?:сигнал|индикатор|ламп|горит|режим|светов)/iu.test(q);
}

function isSdb302nmSetStuckQuery(q) {
  return /\bset\b/iu.test(q) && /(?:ничего|не\s+происход|не\s+реагир|не\s+работ)/iu.test(q);
}

function isSdb302nmPuddleQuery(q) {
  return /луж|протека|утечк[\p{L}]*\s+вод|систем[\p{L}]*\s+охлажден|охлаждающ|контур[\p{L}]*\s+охлажд/iu.test(q);
}

function isSdb302nmWheelsQuery(q) {
  if (/сколько\s+кол[её]с|кол[её]с[\p{L}]*\s+(?:в\s+)?(?:комплект|поставк|коробк)|кол[её]сик|ножк[\p{L}]*\s+в\s+комплект/iu.test(q)) {
    return true;
  }
  return /ножк.*кол[её]с|кол[её]с.*ножк|крутить\s+ножк|на\s+кол[её]с/iu.test(q);
}

function isSdb302nmNitrogenKitQuery(q) {
  return /азот/iu.test(q) && /(?:комплект|опци|докупа|базов|входит|отдельн)/iu.test(q);
}

function isSdb302nmRegenDurationQuery(q) {
  return /регенерац/iu.test(q) && /(?:сколько\s+(?:мин|длит)|длится|продолжитель|как\s+долго)/iu.test(q);
}

function isSdb302nmHumidityWaitQuery(q) {
  if (isSdb302nmRegenDurationQuery(q)) {
    return false;
  }
  return /(?:влажност.*(?:60|час|не\s+падает|не\s+суши)|не\s+суши|сколько\s+ждать|через\s+как[\p{L}]*\s+время|выйти\s+на\s+(?:установленн[\p{L}]*\s+)?режим|выход.*(?:на\s+)?режим|3\s*час)/iu.test(
    q,
  );
}

function isSdb302nmSetpointVsAmbientQuery(q) {
  if (!/влажност/iu.test(q)) {
    return false;
  }
  if (!/помещен|окружающ|комнат/iu.test(q)) {
    return false;
  }
  const twoRh = /(?:\d+(?:[.,]\d+)?\s*%[\s\S]*)\d+(?:[.,]\d+)?\s*%/iu.test(q);
  const whatIf = /что\s+(?:произойд|будет)|если/iu.test(q);
  const setAction = /(?:установл[юи]|задам|поставл|уставку|\bSET\b)/iu.test(q);
  return twoRh || (whatIf && setAction);
}

function isSdb302nmFanRestart1RhQuery(q) {
  if (!/вентилятор/iu.test(q)) {
    return false;
  }
  const has1Rh = /(?:1\s*%|1\s*rh|\+\s*1\s*rh|на\s+1\s*%)/iu.test(q);
  const restart = /повторн|снова|опять|ещё\s+раз|еще\s+раз/iu.test(q);
  return (restart && /влажност|rh/iu.test(q)) || (has1Rh && /влажност|rh/iu.test(q) && /включ/iu.test(q));
}

function isSdb302nmLoadHumidityRiseQuery(q) {
  return /загруз/iu.test(q) && /влажност/iu.test(q) && /повыс|вырос|поднял/iu.test(q);
}

function isSdb302nmDoorCloseDryDelayQuery(q) {
  return (
    /(?:не\s+сразу|сразу\s+не)\s+осуш|осуш[\p{L}]*.*после\s+закрыт|закрыт[\p{L}]*\s+двер[\p{L}]*.*осуш/iu.test(
      q,
    )
  );
}

/** RH%т ниже порога RH%п в режиме «Хранения» — п. 1.1.4.4.2, заслонки осушителя. */
function isSdb302nmRhBelowSetpointQuery(q) {
  if (!/влажност|rh%?т|rh%?п/iu.test(q)) {
    return false;
  }
  if (
    isSdb302nmSetpointVsAmbientQuery(q) ||
    isSdb302nmFanRestart1RhQuery(q) ||
    isSdb302nmLoadHumidityRiseQuery(q) ||
    isSdb302nmDoorCloseDryDelayQuery(q) ||
    isSdb302nmHumidityWaitQuery(q)
  ) {
    return false;
  }
  return (
    /(?:опуст(?:иться|ил|илась|ится)|ниже|меньше).{0,48}(?:установлен|задан|порог|уставк|rh%п)/iu.test(q) ||
    (/почему/iu.test(q) &&
      /(?:опуст|ниже|меньше)/iu.test(q) &&
      /(?:установлен|порог|уставк|задан|значен)/iu.test(q)) ||
    (/режим[\p{L}]*\s+«?хранен/iu.test(q) && /ниже.{0,40}(?:1\s*rh%|на\s+1)/iu.test(q))
  );
}

function isSdb302nmNightOffQuery(q) {
  return /(?:на\s+ночь|выключ.*(?:жрал|хранен)|можно\s+(?:ли\s+)?выключ)/iu.test(q) && !/регенерац/iu.test(q);
}

function isSdb302nmHotCaseQuery(q) {
  return /корпус.*(?:тёпл|тепл|горяч)|обожг|ожог|сверху\s+(?:тёпл|тепл)|ста\s+градус|100\s*°|до\s+ста/iu.test(q);
}

function isSdb302nmTumblerQuery(q) {
  return /рубильник|тумблер|питание\s+снять|снять\s+питан/iu.test(q);
}

function isSdb302nmAmbientTempQuery(q) {
  if (/подогрев|нагрев\s+воздух|опци[\p{L}]*\s+подогрев|корпус.*(?:тёпл|тепл|горяч)/iu.test(q)) {
    return false;
  }
  if (isSdb302nmSetpointVsAmbientQuery(q)) {
    return false;
  }
  return /(?:цех|холодн|градус|помещен|окружающ[\p{L}]*\s+воздух|температур[\p{L}]*\s+эксплуатац|рабоч[\p{L}]*\s+температур|\+\s*1[25]|1[25]\s*°)/iu.test(
    q,
  );
}

function conversationalHintsForSdb302nmMessage(q) {
  const hints = [];
  const add = (...items) => hints.push(...items);

  if (isSdb302nmGettingStartedQuery(q)) {
    add("2.2", "2.2.5", "2.2.3.1", "тумблер", "220", "подготовка изделия к использованию", "включение шкафа");
  }
  if (isSdb302nmBlinkingRedQuery(q)) {
    add("1.1.4.3.3", "осушен", "режим осушения", "мигающий красный", "зелён");
  } else if (isSdb302nmRedLightQuery(q)) {
    add("1.1.4.3.3", "красный индикатор", "осушен", "открыта дверь", "световой сигнал");
  }
  if (isSdb302nmWSymbolQuery(q)) {
    add("1.1.4", "символ", "подогрев", "W");
  }
  if (isSdb302nmGreenIndicatorQuery(q)) {
    add("1.1.4.3.3", "хранен", "зелён", "режим хранения");
  }
  if (isSdb302nmYellowIndicatorQuery(q)) {
    add("1.1.4.3.3", "регенерац", "жёлт", "режим регенерации");
  }
  if (isSdb302nmAmbientTempQuery(q)) {
    add("1.1", "1.1.3", "+15", "+35", "условия эксплуатации");
  }
  if (isSdb302nmSetStuckQuery(q)) {
    add("SET", "UP", "DN", "меню", "таблица 3.2", "3.1.4");
  }
  if (isSdb302nmPuddleQuery(q)) {
    add("2.4", "2.1", "обесточьте", "экстремальн");
  }
  if (isSdb302nmWheelsQuery(q)) {
    add("таблица 1.2", "колёс", "ножки", "комплект");
  }
  if (isSdb302nmNightOffQuery(q)) {
    add("2.3", "режим хранения", "режим регенерации", "выключ");
  }
  if (isSdb302nmHotCaseQuery(q)) {
    add("1.1", "1.2", "подогрев", "+100", "условия эксплуатации");
  }
  if (isSdb302nmTumblerQuery(q)) {
    add("2.2.3.1", "2.2.5", "тумблер", "кожух осушителя");
  }
  if (isSdb302nmHumidityWaitQuery(q)) {
    add("1.1", "1.1.2.4", "не более 3 часов", "выход на установленное значение");
  }
  if (isSdb302nmSetpointVsAmbientQuery(q)) {
    add("1.1.1", "1.1.2", "RH%окр", "осушения", "1.1.4.4.1");
  }
  if (isSdb302nmFanRestart1RhQuery(q)) {
    add("1.1.4.4.1", "RH%п+1RH%", "повторное включение вентилятора");
  }
  if (isSdb302nmLoadHumidityRiseQuery(q) || isSdb302nmDoorCloseDryDelayQuery(q)) {
    add("1.1.4.4.1", "закрытии двери", "вентилятор осушителя", "ускоренного осушения");
  }
  if (isSdb302nmRhBelowSetpointQuery(q)) {
    add("1.1.4.4.2", "режим «Хранения»", "заслонки осушителя", "RH%п");
  }
  return hints;
}

/**
 * Extra lexical anchors for hybrid FTS / vector. Keep them short: do not dump
 * heating-option terms onto shop-temperature questions.
 */
function expandSdb302nmRetrievalSynonyms(query) {
  const q = String(query || "");
  const extras = [];

  if (isSdb302nmGettingStartedQuery(q)) {
    extras.push(
      "2.2.5",
      "включение шкафа",
      "тумблер питания на кожухе осушителя",
      "заземлённая розетка",
      "220 В",
      "50 Гц",
    );
  }
  if (isSdb302nmBlinkingRedQuery(q)) {
    extras.push("1.1.4.3.3", "режим осушения", "мигающий красный", "зелёный индикатор", "световой сигнал");
  } else if (isSdb302nmRedLightQuery(q)) {
    extras.push(
      "1.1.4.3.3",
      "красный индикатор",
      "световой сигнал",
      "режим осушения",
      "открыта дверь",
      "мигающий красный",
    );
  }
  if (isSdb302nmWSymbolQuery(q)) {
    extras.push("символ W", "система подогрева воздуха", "1.1.4.3");
  }
  if (isSdb302nmGreenIndicatorQuery(q)) {
    extras.push("1.1.4.3.3", "режим хранения", "зелёный световой сигнал");
  }
  if (isSdb302nmYellowIndicatorQuery(q)) {
    extras.push("1.1.4.3.3", "режим регенерации", "жёлтый световой сигнал");
  }
  if (isSdb302nmAmbientTempQuery(q)) {
    extras.push("1.1", "условия эксплуатации", "+15", "+35", "температура окружающего воздуха");
  }
  if (isSdb302nmSetStuckQuery(q)) {
    extras.push("SET", "UP", "DN", "меню", "таблица 3.2", "типовые неисправности");
  }
  if (isSdb302nmPuddleQuery(q)) {
    extras.push("2.4", "отключите питание", "действия в экстремальных условиях");
  }
  if (isSdb302nmWheelsQuery(q)) {
    extras.push("таблица 1.2", "4 колеса", "4 регулируемые ножки", "комплект поставки");
  }
  if (isSdb302nmNightOffQuery(q)) {
    extras.push("режим хранения", "режим регенерации", "запрещается выключать");
  }
  if (isSdb302nmHotCaseQuery(q)) {
    extras.push("система подогрева воздуха", "корпус", "ожоги", "+100");
  }
  if (isSdb302nmTumblerQuery(q)) {
    extras.push("2.2.3.1", "тумблер питания", "кожух осушителя", "положение ВЫКЛ");
  }
  if (isSdb302nmHumidityWaitQuery(q)) {
    extras.push("не более 3 часов", "выход на установленное значение влажности", "с момента включения");
  }
  if (isSdb302nmSetpointVsAmbientQuery(q)) {
    extras.push(
      "не выше влажности окружающего воздуха",
      "RH%окр.ср.",
      "режим осушения",
      "вентилятор осушителя",
    );
  }
  if (isSdb302nmFanRestart1RhQuery(q)) {
    extras.push(
      "повторное включение вентилятора осушителя",
      "RH%т = RH%п+1RH%",
      "режим хранения",
    );
  }
  if (isSdb302nmLoadHumidityRiseQuery(q) || isSdb302nmDoorCloseDryDelayQuery(q)) {
    extras.push(
      "при открытии двери вентилятор осушителя отключается",
      "при закрытии двери вентилятор осушителя включается",
      "отсчет времени ускоренного осушения начинается заново",
      "60 ± 1 минут",
    );
  }
  if (isSdb302nmRhBelowSetpointQuery(q)) {
    extras.push(
      "1.1.4.4.2",
      "режим «Хранения»",
      "опуститься ниже установленного порогового значения на 1RH%",
      "откроются заслонки осушителя",
    );
  }

  return [...new Set(extras)];
}

function sectionHintsForSdb302nmMessage(message) {
  const q = String(message || "");
  const hints = [...conversationalHintsForSdb302nmMessage(q)];
  const add = (...items) => hints.push(...items);

  if (
    /габарит|масса|питан|мощност|влажност|ip65|климат|комплект|поставк|маркировк|конструкц|двер|индикатор|dry\s*storage|производител|совтест|ухл|групп|электробезопас|оператор|наладчик/i.test(
      q,
    )
  ) {
    add("1.1", "технические характеристики", "таблица 1.1", "таблица 1.2");
  }
  if (/диспле|lcd|параметр.*(?:диспле|индикатор)|режим.*(?:хранен|осушен|регенерац)/i.test(q)) {
    add("1.1.4", "режим хранения", "режим осушения", "режим регенерации", "lcd индикатор");
  }
  if (/где\s+.*(?:раздел|руководств)|в\s+каком\s+раздел|где\s+описан/i.test(q)) {
    add("содержание", "раздел 3", "раздел 4", "раздел 5", "раздел 6", "приложение а");
  }
  if (/отключен.*питан|ошибк.*диспле|поврежден/i.test(q)) {
    add("2.4", "3.1.4", "таблица 3.2", "типовые неисправности");
  }
  if (/азот|n2|ротаметр|рпост|ррег|концентрац|подогрев|нагрев|ethernet|освещен/i.test(q)) {
    add("1.2", "опция", "система автоматической подачи азота", "система подогрева воздуха");
  }
  if (/полк|нагрузк|загруз|разгруз|стенк|конвекц|горюч|взрыво|растворител|6\s*бар/i.test(q)) {
    add("2.1", "эксплуатационные ограничения");
  }
  if (
    /осмотр|подготов|заземл|кабел|персонал|безопасност/i.test(q) ||
    (/включ/i.test(q) && !isSdb302nmAmbientTempQuery(q))
  ) {
    add("2.2", "подготовка изделия к использованию", "внешний осмотр", "меры безопасности");
  }
  if (/режим|осушител|регенерац|выключ|двер|сигнал|индикатор|настро|установ.*(?:влажност|азот|температур)/i.test(q)) {
    add("2.3", "использование изделия", "режим регенерации");
  }
  if (
    /дым|гар|пожар|искр|экстремальн/i.test(q) ||
    (/авари/i.test(q) && !isSdb302nmBlinkingRedQuery(q) && !isSdb302nmRedLightQuery(q) && !isSdb302nmYellowIndicatorQuery(q))
  ) {
    add("2.4", "действия в экстремальных условиях");
  }
  if (/(?:^|\s)то(?:[\s.!?]|$)|обслужив|периодич|калибр|протир|цеолит|замен/i.test(q)) {
    add("3.1", "техническое обслуживание", "регламент технического обслуживания");
  }
  if (/неисправ|не\s+работ|не\s+включ|не\s+сниж|ремонт|таблиц.*3\.2/i.test(q) && !isSdb302nmBlinkingRedQuery(q) && !isSdb302nmRedLightQuery(q)) {
    add("3.1.4", "типовые неисправности и методы их устранения", "4.1", "текущий ремонт");
  }
  if (/хранен|консервац/i.test(q) && !isSdb302nmNightOffQuery(q) && !isSdb302nmGettingStartedQuery(q)) {
    add("5", "хранение");
  }
  if (/транспорт|перевоз|подъем|перемещ/i.test(q)) {
    add("6", "транспортирование");
  }
  if (/утилиз|списан/i.test(q)) {
    add("7", "утилизация");
  }
  if (/внешн.*вид|габарит.*опци|приложен/i.test(q)) {
    add("приложение А", "приложение Б", "приложение В");
  }
  return [...new Set(hints)];
}

function retrievalCardFilesForSdb302nmQuery(query) {
  const q = String(query || "");
  const files = [];
  const add = (...names) => {
    for (const name of names) {
      if (!files.includes(name)) {
        files.push(name);
      }
    }
  };

  if (isSdb302nmAmbientTempQuery(q) || isSdb302nmHotCaseQuery(q)) {
    add("temp-contrast.md", "ambient-temp.md", "heating-case.md");
  }
  if (isSdb302nmWheelsQuery(q) || isSdb302nmNitrogenKitQuery(q)) {
    add("feet-wheels.md", "nitrogen-option.md");
  }
  if (isSdb302nmGettingStartedQuery(q) || isSdb302nmTumblerQuery(q)) {
    add("power-on.md");
  }
  if (isSdb302nmBlinkingRedQuery(q) || isSdb302nmRedLightQuery(q)) {
    add("red-lamp.md", "yellow-and-w.md");
  }
  if (isSdb302nmYellowIndicatorQuery(q) || isSdb302nmWSymbolQuery(q) || isSdb302nmGreenIndicatorQuery(q)) {
    add("yellow-and-w.md", "red-lamp.md");
  }
  if (isSdb302nmSetStuckQuery(q)) {
    add("set-menu.md");
  }
  if (isSdb302nmPuddleQuery(q)) {
    add("no-cooling.md");
  }
  if (isSdb302nmHumidityWaitQuery(q)) {
    add("humidity-time.md");
  }
  if (isSdb302nmSetpointVsAmbientQuery(q)) {
    add("setpoint-vs-ambient.md", "humidity-time.md");
  }
  if (isSdb302nmFanRestart1RhQuery(q)) {
    add("fan-restart-1rh.md");
  }
  if (isSdb302nmLoadHumidityRiseQuery(q) || isSdb302nmDoorCloseDryDelayQuery(q)) {
    add("door-close-dry.md");
  }
  if (isSdb302nmRhBelowSetpointQuery(q)) {
    add("rh-below-setpoint.md", "fan-restart-1rh.md");
  }
  if (isSdb302nmRegenDurationQuery(q) || isSdb302nmNightOffQuery(q)) {
    add("yellow-and-w.md");
  }

  return files;
}

function directContextHintsForSdb302nmMessage(message) {
  const hints = sectionHintsForSdb302nmMessage(message);
  return hints.length ? `Ищи подтверждение в разделах РЭ: ${hints.join(", ")}.` : "";
}

module.exports = {
  isSdb302nmEquipment,
  isSdb302nmAmbientTempQuery,
  isSdb302nmGettingStartedQuery,
  isSdb302nmBlinkingRedQuery,
  isSdb302nmRedLightQuery,
  isSdb302nmYellowIndicatorQuery,
  isSdb302nmWSymbolQuery,
  isSdb302nmGreenIndicatorQuery,
  isSdb302nmSetStuckQuery,
  isSdb302nmPuddleQuery,
  isSdb302nmWheelsQuery,
  isSdb302nmNightOffQuery,
  isSdb302nmHotCaseQuery,
  isSdb302nmTumblerQuery,
  isSdb302nmNitrogenKitQuery,
  isSdb302nmRegenDurationQuery,
  isSdb302nmHumidityWaitQuery,
  isSdb302nmSetpointVsAmbientQuery,
  isSdb302nmFanRestart1RhQuery,
  isSdb302nmLoadHumidityRiseQuery,
  isSdb302nmDoorCloseDryDelayQuery,
  isSdb302nmRhBelowSetpointQuery,
  retrievalCardFilesForSdb302nmQuery,
  expandSdb302nmRetrievalSynonyms,
  directContextHintsForSdb302nmMessage,
  sectionHintsForSdb302nmMessage,
};
