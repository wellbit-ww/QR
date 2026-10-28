/**
 * Section anchors and retrieval synonyms for SDB1560NM.
 * Conversational probes go to RAG: hints + query expansion, not canned answers.
 */

function isSdb1560mEquipment(equipment) {
  const id = String(equipment?.id || "").toLowerCase();
  return id === "w-700" || id === "sdb1560m";
}

function isSdb1560mGettingStartedQuery(q) {
  return /как\s+начать\s+работ|с\s+чего\s+начать|только\s+купил|купил\s+(?:шкаф|кабинет)|перв(?:ый|ая|ого)\s+(?:запуск|включ)|ввод\s+в\s+эксплуатац/iu.test(
    q,
  );
}

function isSdb1560mBlinkingRedQuery(q) {
  return /(?:красн[\p{L}]*\s+мига|мига[\p{L}]*\s+красн)/iu.test(q) && !/двер/iu.test(q);
}

/** «красная лампочка / что за красная» — та же индикация, без слова «мигает». */
function isSdb1560mRedLightQuery(q) {
  if (!/красн/iu.test(q)) {
    return false;
  }
  return /ламп|лампочк|огон[её]к|светодиод|индикатор|светов|горит|мига|светит|что\s+за\s+красн/iu.test(q);
}

function isSdb1560mYellowIndicatorQuery(q) {
  return /ж[её]лт/iu.test(q) && /(?:горит|индикатор|ламп|светит|режим|выключ)/iu.test(q);
}

function isSdb1560mWSymbolQuery(q) {
  return /(?:символ\s*w|\bw\s+горит|на\s+экране.{0,24}\bw\b|какая-то\s+w|буква\s*w|w\s+на\s+диспл|\bw\b.{0,40}ошибк|ошибк.{0,40}\bw\b)/iu.test(
    q,
  );
}

function isSdb1560mGreenIndicatorQuery(q) {
  return /зелён/iu.test(q) && /(?:сигнал|индикатор|ламп|горит|режим|светов)/iu.test(q);
}

function isSdb1560mSetStuckQuery(q) {
  return /\bset\b/iu.test(q) && /(?:ничего|не\s+происход|не\s+реагир|не\s+работ)/iu.test(q);
}

function isSdb1560mPuddleQuery(q) {
  return /луж|протека|утечк[\p{L}]*\s+вод|систем[\p{L}]*\s+охлажден|охлаждающ|контур[\p{L}]*\s+охлажд/iu.test(q);
}

function isSdb1560mWheelsQuery(q) {
  if (/сколько\s+кол[её]с|кол[её]с[\p{L}]*\s+(?:в\s+)?(?:комплект|поставк|коробк)|кол[её]сик|ножк[\p{L}]*\s+в\s+комплект/iu.test(q)) {
    return true;
  }
  return /ножк.*кол[её]с|кол[её]с.*ножк|крутить\s+ножк|на\s+кол[её]с/iu.test(q);
}

function isSdb1560mKitShelfCountQuery(q) {
  return /(?:сколько\s+полок|количеств[\p{L}]*\s+полок|полок\s+в\s+комплект|комплект[\p{L}]*\s+полок|стандартн[\p{L}]*\s+полок)/iu.test(
    String(q || ""),
  );
}

function isSdb1560mHumiditySetQuery(q) {
  return /задать\s+порог|выставить.*влажност|порог\s+влажност|настро.*влажност|меню.*SET|кнопк.*SET/i.test(
    String(q || ""),
  );
}

function isSdb1560mOpenDoorQuery(q) {
  return /как\s+открыть\s+двер|открыть\s+дверь/i.test(String(q || ""));
}

function isSdb1560mOperatingModesQuery(q) {
  return /какие\s+режим|режимы\s+работ/i.test(String(q || ""));
}

function isSdb1560mNitrogenKitQuery(q) {
  return /азот/iu.test(q) && /(?:комплект|опци|докупа|базов|входит|отдельн)/iu.test(q);
}

function isSdb1560mRegenDurationQuery(q) {
  return /регенерац/iu.test(q) && /(?:сколько\s+(?:мин|длит)|длится|продолжитель|как\s+долго)/iu.test(q);
}

function isSdb1560mHumidityWaitQuery(q) {
  if (isSdb1560mRegenDurationQuery(q)) {
    return false;
  }
  return /(?:влажност.*(?:60|час|не\s+падает|не\s+суши)|не\s+суши|сколько\s+ждать|через\s+как[\p{L}]*\s+время|выйти\s+на\s+(?:установленн[\p{L}]*\s+)?режим|выход.*(?:на\s+)?режим|3\s*час)/iu.test(
    q,
  );
}

function isSdb1560mSetpointVsAmbientQuery(q) {
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

function isSdb1560mFanRestart1RhQuery(q) {
  if (!/вентилятор/iu.test(q)) {
    return false;
  }
  const has1Rh = /(?:1\s*%|1\s*rh|\+\s*1\s*rh|на\s+1\s*%)/iu.test(q);
  const restart = /повторн|снова|опять|ещё\s+раз|еще\s+раз/iu.test(q);
  return (restart && /влажност|rh/iu.test(q)) || (has1Rh && /влажност|rh/iu.test(q) && /включ/iu.test(q));
}

function isSdb1560mLoadHumidityRiseQuery(q) {
  return /загруз/iu.test(q) && /влажност/iu.test(q) && /повыс|вырос|поднял/iu.test(q);
}

function isSdb1560mDoorCloseDryDelayQuery(q) {
  return (
    /(?:не\s+сразу|сразу\s+не)\s+осуш|осуш[\p{L}]*.*после\s+закрыт|закрыт[\p{L}]*\s+двер[\p{L}]*.*осуш/iu.test(
      q,
    )
  );
}

/** RH%т ниже порога RH%п в режиме «Хранения» — п. 1.1.4.4.2, заслонки осушителя. */
function isSdb1560mRhBelowSetpointQuery(q) {
  if (!/влажност|rh%?т|rh%?п/iu.test(q)) {
    return false;
  }
  if (
    isSdb1560mSetpointVsAmbientQuery(q) ||
    isSdb1560mFanRestart1RhQuery(q) ||
    isSdb1560mLoadHumidityRiseQuery(q) ||
    isSdb1560mDoorCloseDryDelayQuery(q) ||
    isSdb1560mHumidityWaitQuery(q)
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

function isSdb1560mNightOffQuery(q) {
  return /(?:на\s+ночь|выключ.*(?:жрал|хранен)|можно\s+(?:ли\s+)?выключ)/iu.test(q) && !/регенерац/iu.test(q);
}

function isSdb1560mHotCaseQuery(q) {
  return /корпус.*(?:тёпл|тепл|горяч)|обожг|ожог|сверху\s+(?:тёпл|тепл)|ста\s+градус|100\s*°|до\s+ста/iu.test(q);
}

function isSdb1560mTumblerQuery(q) {
  return /рубильник|тумблер|питание\s+снять|снять\s+питан/iu.test(q);
}

function isSdb1560mAmbientTempQuery(q) {
  if (/подогрев|нагрев\s+воздух|опци[\p{L}]*\s+подогрев|корпус.*(?:тёпл|тепл|горяч)/iu.test(q)) {
    return false;
  }
  if (isSdb1560mSetpointVsAmbientQuery(q)) {
    return false;
  }
  return /(?:цех|холодн|градус|помещен|окружающ[\p{L}]*\s+воздух|температур[\p{L}]*\s+эксплуатац|рабоч[\p{L}]*\s+температур|\+\s*1[25]|1[25]\s*°)/iu.test(
    q,
  );
}

function conversationalHintsForSdb1560mMessage(q) {
  const hints = [];
  const add = (...items) => hints.push(...items);

  if (isSdb1560mGettingStartedQuery(q)) {
    add("2.2", "2.2.5", "2.2.3.1", "тумблер", "220", "подготовка изделия к использованию", "включение шкафа");
  }
  if (isSdb1560mBlinkingRedQuery(q)) {
    add("1.1.4.3.3", "осушен", "режим осушения", "мигающий красный", "зелён");
  } else if (isSdb1560mRedLightQuery(q)) {
    add("1.1.4.3.3", "красный индикатор", "осушен", "открыта дверь", "световой сигнал");
  }
  if (isSdb1560mWSymbolQuery(q)) {
    add("1.1.4", "символ", "подогрев", "W");
  }
  if (isSdb1560mGreenIndicatorQuery(q)) {
    add("1.1.4.3.3", "хранен", "зелён", "режим хранения");
  }
  if (isSdb1560mYellowIndicatorQuery(q)) {
    add("1.1.4.3.3", "регенерац", "жёлт", "режим регенерации");
  }
  if (isSdb1560mAmbientTempQuery(q)) {
    add("1.1", "1.1.3", "+15", "+35", "условия эксплуатации");
  }
  if (isSdb1560mSetStuckQuery(q)) {
    add("SET", "UP", "DN", "меню", "таблица 3.2", "3.1.4");
  }
  if (isSdb1560mPuddleQuery(q)) {
    add("2.4", "2.1", "обесточьте", "экстремальн");
  }
  if (isSdb1560mWheelsQuery(q)) {
    add("таблица 1.2", "колёс", "ножки", "комплект");
  }
  if (isSdb1560mNightOffQuery(q)) {
    add("2.3", "режим хранения", "режим регенерации", "выключ");
  }
  if (isSdb1560mHotCaseQuery(q)) {
    add("1.1", "1.2", "подогрев", "+100", "условия эксплуатации");
  }
  if (isSdb1560mTumblerQuery(q)) {
    add("2.2.3.1", "2.2.5", "тумблер", "кожух осушителя");
  }
  if (isSdb1560mHumidityWaitQuery(q)) {
    add("1.1", "1.1.2.4", "не более 180 минут", "выход на установленное значение");
  }
  if (isSdb1560mSetpointVsAmbientQuery(q)) {
    add("1.1.1", "1.1.2", "RH%окр", "осушения", "1.1.4.4.1");
  }
  if (isSdb1560mFanRestart1RhQuery(q)) {
    add("1.1.4.4.1", "RH%п+1RH%", "повторное включение вентилятора");
  }
  if (isSdb1560mLoadHumidityRiseQuery(q) || isSdb1560mDoorCloseDryDelayQuery(q)) {
    add("1.1.4.4.1", "закрытии двери", "вентилятор осушителя", "ускоренного осушения");
  }
  if (isSdb1560mRhBelowSetpointQuery(q)) {
    add("1.1.4.4.2", "режим «Хранения»", "заслонки осушителя", "RH%п");
  }
  return hints;
}

/**
 * Extra lexical anchors for hybrid FTS / vector. Keep them short: do not dump
 * heating-option terms onto shop-temperature questions.
 */
function expandSdb1560mRetrievalSynonyms(query) {
  const q = String(query || "");
  const extras = [];

  if (isSdb1560mGettingStartedQuery(q)) {
    extras.push(
      "2.2.5",
      "включение шкафа",
      "тумблер питания на кожухе осушителя",
      "заземлённая розетка",
      "220 В",
      "50 Гц",
    );
  }
  if (isSdb1560mBlinkingRedQuery(q)) {
    extras.push("1.1.4.3.3", "режим осушения", "мигающий красный", "зелёный индикатор", "световой сигнал");
  } else if (isSdb1560mRedLightQuery(q)) {
    extras.push(
      "1.1.4.3.3",
      "красный индикатор",
      "световой сигнал",
      "режим осушения",
      "открыта дверь",
      "мигающий красный",
    );
  }
  if (isSdb1560mWSymbolQuery(q)) {
    extras.push("символ W", "система подогрева воздуха", "1.1.4.3");
  }
  if (isSdb1560mGreenIndicatorQuery(q)) {
    extras.push("1.1.4.3.3", "режим хранения", "зелёный световой сигнал");
  }
  if (isSdb1560mYellowIndicatorQuery(q)) {
    extras.push("1.1.4.3.3", "режим регенерации", "жёлтый световой сигнал");
  }
  if (isSdb1560mAmbientTempQuery(q)) {
    extras.push("1.1", "условия эксплуатации", "+15", "+35", "температура окружающего воздуха");
  }
  if (isSdb1560mSetStuckQuery(q)) {
    extras.push("SET", "UP", "DN", "меню", "таблица 3.2", "типовые неисправности");
  }
  if (isSdb1560mPuddleQuery(q)) {
    extras.push("2.4", "отключите питание", "действия в экстремальных условиях");
  }
  if (isSdb1560mWheelsQuery(q)) {
    extras.push("таблица 1.2", "4 колеса", "4 регулируемые ножки", "комплект поставки");
  }
  if (isSdb1560mKitShelfCountQuery(q)) {
    extras.push("таблица 1.2", "комплект поставки", "перфорированные полки", "SDB1560");
  }
  if (isSdb1560mNightOffQuery(q)) {
    extras.push("режим хранения", "режим регенерации", "запрещается выключать");
  }
  if (isSdb1560mHotCaseQuery(q)) {
    extras.push("система подогрева воздуха", "корпус", "ожоги", "+100");
  }
  if (isSdb1560mTumblerQuery(q)) {
    extras.push("2.2.3.1", "тумблер питания", "кожух осушителя", "положение ВЫКЛ");
  }
  if (isSdb1560mHumidityWaitQuery(q)) {
    extras.push("не более 180 минут", "выход на установленное значение влажности", "с момента включения");
  }
  if (isSdb1560mSetpointVsAmbientQuery(q)) {
    extras.push(
      "не выше влажности окружающего воздуха",
      "RH%окр.ср.",
      "режим осушения",
      "вентилятор осушителя",
    );
  }
  if (isSdb1560mFanRestart1RhQuery(q)) {
    extras.push(
      "повторное включение вентилятора осушителя",
      "RH%т = RH%п+1RH%",
      "режим хранения",
    );
  }
  if (isSdb1560mLoadHumidityRiseQuery(q) || isSdb1560mDoorCloseDryDelayQuery(q)) {
    extras.push(
      "при открытии двери вентилятор осушителя отключается",
      "при закрытии двери вентилятор осушителя включается",
      "отсчет времени ускоренного осушения начинается заново",
      "60 ± 1 минут",
    );
  }
  if (isSdb1560mRhBelowSetpointQuery(q)) {
    extras.push(
      "1.1.4.4.2",
      "режим «Хранения»",
      "опуститься ниже установленного порогового значения на 1RH%",
      "откроются заслонки осушителя",
    );
  }

  return [...new Set(extras)];
}

function sectionHintsForSdb1560mMessage(message) {
  const q = String(message || "");
  const hints = [...conversationalHintsForSdb1560mMessage(q)];
  const add = (...items) => hints.push(...items);

  if (isSdb1560mKitShelfCountQuery(q)) {
    add("таблица 1.2", "1.2", "комплект поставки", "комплектация", "полок");
  }
  if (isSdb1560mHumiditySetQuery(q)) {
    add("2.3", "таблица 3.2", "SET", "UP", "DN", "00.0", "99.9");
  }
  if (isSdb1560mOpenDoorQuery(q)) {
    add("1.1.4.3.3", "2.3", "двер", "замок", "ключ", "световой сигнал");
  }
  if (isSdb1560mOperatingModesQuery(q)) {
    add("1.1.4", "режим «Хранения»", "режим «Осушения»", "режим «Регенерации»", "1.1.4.3.3");
  }
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
    (/включ/i.test(q) && !isSdb1560mAmbientTempQuery(q))
  ) {
    add("2.2", "подготовка изделия к использованию", "внешний осмотр", "меры безопасности");
  }
  if (/режим|осушител|регенерац|выключ|двер|сигнал|индикатор|настро|установ.*(?:влажност|азот|температур)/i.test(q)) {
    add("2.3", "использование изделия", "режим регенерации");
  }
  if (
    /дым|гар|пожар|искр|экстремальн/i.test(q) ||
    (/авари/i.test(q) && !isSdb1560mBlinkingRedQuery(q) && !isSdb1560mRedLightQuery(q) && !isSdb1560mYellowIndicatorQuery(q))
  ) {
    add("2.4", "действия в экстремальных условиях");
  }
  if (/(?:^|\s)то(?:[\s.!?]|$)|обслужив|периодич|калибр|протир|цеолит|замен/i.test(q)) {
    add("3.1", "техническое обслуживание", "регламент технического обслуживания");
  }
  if (/неисправ|не\s+работ|не\s+включ|не\s+сниж|ремонт|таблиц.*3\.2/i.test(q) && !isSdb1560mBlinkingRedQuery(q) && !isSdb1560mRedLightQuery(q)) {
    add("3.1.4", "типовые неисправности и методы их устранения", "4.1", "текущий ремонт");
  }
  if (/хранен|консервац/i.test(q) && !isSdb1560mNightOffQuery(q) && !isSdb1560mGettingStartedQuery(q)) {
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

function retrievalCardFilesForSdb1560mQuery(query) {
  const q = String(query || "");
  const files = [];
  const add = (...names) => {
    for (const name of names) {
      if (!files.includes(name)) {
        files.push(name);
      }
    }
  };

  if (isSdb1560mAmbientTempQuery(q) || isSdb1560mHotCaseQuery(q)) {
    add("temp-contrast.md", "ambient-temp.md", "heating-case.md");
  }
  if (isSdb1560mWheelsQuery(q) || isSdb1560mNitrogenKitQuery(q)) {
    add("feet-wheels.md", "nitrogen-option.md");
  }
  if (isSdb1560mGettingStartedQuery(q) || isSdb1560mTumblerQuery(q)) {
    add("power-on.md");
  }
  if (isSdb1560mBlinkingRedQuery(q) || isSdb1560mRedLightQuery(q)) {
    add("red-lamp.md", "yellow-and-w.md");
  }
  if (isSdb1560mYellowIndicatorQuery(q) || isSdb1560mWSymbolQuery(q) || isSdb1560mGreenIndicatorQuery(q)) {
    add("yellow-and-w.md", "red-lamp.md");
  }
  if (isSdb1560mSetStuckQuery(q) || isSdb1560mHumiditySetQuery(q)) {
    add("set-menu.md");
  }
  if (isSdb1560mOpenDoorQuery(q)) {
    add("red-lamp.md");
  }
  if (isSdb1560mOperatingModesQuery(q)) {
    add("yellow-and-w.md", "red-lamp.md");
  }
  if (isSdb1560mPuddleQuery(q)) {
    add("no-cooling.md");
  }
  if (isSdb1560mHumidityWaitQuery(q)) {
    add("humidity-time.md");
  }
  if (isSdb1560mSetpointVsAmbientQuery(q)) {
    add("setpoint-vs-ambient.md", "humidity-time.md");
  }
  if (isSdb1560mFanRestart1RhQuery(q)) {
    add("fan-restart-1rh.md");
  }
  if (isSdb1560mLoadHumidityRiseQuery(q) || isSdb1560mDoorCloseDryDelayQuery(q)) {
    add("door-close-dry.md");
  }
  if (isSdb1560mRhBelowSetpointQuery(q)) {
    add("rh-below-setpoint.md", "fan-restart-1rh.md");
  }
  if (isSdb1560mRegenDurationQuery(q) || isSdb1560mNightOffQuery(q)) {
    add("yellow-and-w.md");
  }

  return files;
}

function directContextHintsForSdb1560mMessage(message) {
  const hints = sectionHintsForSdb1560mMessage(message);
  return hints.length ? `Ищи подтверждение в разделах РЭ: ${hints.join(", ")}.` : "";
}

module.exports = {
  isSdb1560mEquipment,
  isSdb1560mAmbientTempQuery,
  isSdb1560mGettingStartedQuery,
  isSdb1560mBlinkingRedQuery,
  isSdb1560mRedLightQuery,
  isSdb1560mYellowIndicatorQuery,
  isSdb1560mWSymbolQuery,
  isSdb1560mGreenIndicatorQuery,
  isSdb1560mSetStuckQuery,
  isSdb1560mPuddleQuery,
  isSdb1560mWheelsQuery,
  isSdb1560mKitShelfCountQuery,
  isSdb1560mHumiditySetQuery,
  isSdb1560mOpenDoorQuery,
  isSdb1560mOperatingModesQuery,
  isSdb1560mNightOffQuery,
  isSdb1560mHotCaseQuery,
  isSdb1560mTumblerQuery,
  isSdb1560mNitrogenKitQuery,
  isSdb1560mRegenDurationQuery,
  isSdb1560mHumidityWaitQuery,
  isSdb1560mSetpointVsAmbientQuery,
  isSdb1560mFanRestart1RhQuery,
  isSdb1560mLoadHumidityRiseQuery,
  isSdb1560mDoorCloseDryDelayQuery,
  isSdb1560mRhBelowSetpointQuery,
  retrievalCardFilesForSdb1560mQuery,
  expandSdb1560mRetrievalSynonyms,
  directContextHintsForSdb1560mMessage,
  sectionHintsForSdb1560mMessage,
};
