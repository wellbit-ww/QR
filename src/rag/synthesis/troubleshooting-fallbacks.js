function joinedChunkText(chunks) {
  return (Array.isArray(chunks) ? chunks : [])
    .map((chunk) => String(chunk?.content || ""))
    .join("\n\n");
}

function buildPowerTroubleshootingFallback(chunks) {
  const text = joinedChunkText(chunks);
  if (!/розетк|кабель\s+сетевого\s+питания|предохранител|электросет|не\s+включ/iu.test(text)) {
    return "";
  }

  const checks = [];
  const causes = [];
  if (/напряжени[ея]\s+в\s+(?:электро)?сет|напряжени[ея]\s+в\s+розетк|розетк/iu.test(text)) {
    checks.push("Проверьте напряжение в розетке.");
    causes.push("Отсутствует напряжение в электросети.");
  }
  if (/кабель\s+сетевого\s+питания|разъем\s+осушител|вставить\s+до\s+упора/iu.test(text)) {
    checks.push("Проверьте соединение кабеля сетевого питания с разъемом осушителя; вставьте кабель до упора.");
    causes.push("Плохой контакт кабеля сетевого питания в разъеме осушителя.");
  }
  if (/неисправ(?:ен|ность).{0,80}кабель|кабель.{0,80}неисправ/iu.test(text)) {
    checks.push("Проверьте кабель сетевого питания.");
    causes.push("Неисправен кабель сетевого питания.");
  }
  if (/предохранител/iu.test(text)) {
    checks.push("Проверьте предохранитель в сетевой арматуре.");
    causes.push("Неисправен предохранитель в сетевой арматуре.");
  }

  const uniqueChecks = [...new Set(checks)].slice(0, 5);
  const uniqueCauses = [...new Set(causes)].slice(0, 5);
  if (!uniqueChecks.length) {
    return "";
  }
  return [
    "Что проверить:",
    ...uniqueChecks.map((line, idx) => `${idx + 1}. ${line}`),
    ...(uniqueCauses.length
      ? ["", "Возможные причины:", ...uniqueCauses.map((line, idx) => `${idx + 1}. ${line}`)]
      : []),
  ].join("\n");
}

const HUMIDITY_INSPECTION_STEPS = [
  "Проверить состояние резинового (магнитного) уплотнителя дверей на отсутствие повреждений (п. 2.2.2.2).",
  "Проверить плотность закрытия дверей замками; при необходимости отрегулировать ригель замка (п. 2.2.2.3).",
  "Провести визуальный осмотр кожуха и осушающего модуля (осушителя) на отсутствие внешних механических повреждений (п. 2.2.2.1; п. 1.1.4.2).",
];

function buildHumidityTroubleshootingFallback(chunks) {
  const text = joinedChunkText(chunks);
  if (!/влажност|RH%|осушител|регенерац|уплотнител|2\.2\.2/i.test(text)) {
    return "";
  }

  const steps = [...HUMIDITY_INSPECTION_STEPS];
  if (/двер|закрытии\s+двер|открытии\s+двер/iu.test(text)) {
    steps.push("Проверьте, что дверь закрыта: при открытии двери вентилятор осушителя отключается, а после закрытия отсчет ускоренного осушения начинается заново.");
  }
  if (/мен(?:ьше|ее)\s+чем\s+на\s+1\s*RH%|меньше\s+1\s*RH%|динамик[а-яё\s]+снижени[яе]\s+влажност/iu.test(text)) {
    steps.push("Если влажность выше порога и снижается меньше чем на 1RH% за 30 минут, шкаф переходит в режим регенерации осушителя.");
  }
  if (/режим[ае]?\s+«?Регенерации|регенерац/iu.test(text)) {
    steps.push("Не выключайте шкаф во время режима регенерации.");
  }
  if (/ТЭН|заслонк[аи]\s+осушителя|45\s*±\s*1\s+минут|60\s*±\s*1\s+минут/iu.test(text)) {
    steps.push("Дождитесь окончания регенерации: в этом режиме включается ТЭН и открываются заслонки осушителя.");
  }
  if (/RH%т\s*=\s*RH%п|порогов[а-яё\s]+значени[яе]\s+влажност/iu.test(text)) {
    steps.push("Сравните текущую влажность RH%т с установленным порогом RH%п и проверьте, что порог задан корректно.");
  }

  if (/уплотнител|2\.2\.2\.2/i.test(text) && !steps.some((s) => /уплотнител/i.test(s))) {
    steps.push(
      "Проверить уплотнители дверей на отсутствие повреждений; при повреждениях — заменить (п. 2.2.2.2)."
    );
  }
  if (/плотность|замк|2\.2\.2\.3/i.test(text) && !steps.some((s) => /замк/i.test(s))) {
    steps.push("Проверить плотность закрытия дверей замками (п. 2.2.2.3).");
  }
  if (/блок\s+осуш|исчерпал\s+ресурс|уплотнители\s+двери/i.test(text)) {
    steps.push(
      "По табл. 3.2: проверить уплотнители двери и состояние блока осушения (замена при неисправности или исчерпании ресурса)."
    );
  }

  const unique = [...new Set(steps)].slice(0, 7);
  const finalSteps =
    unique.length >= 3
      ? unique
      : [
          ...HUMIDITY_INSPECTION_STEPS,
          "Проверьте закрытие двери и корректность установленного порога влажности RH%п.",
          "Если влажность выше порога и снижается недостаточно быстро, дождитесь режима регенерации осушителя.",
          "Не выключайте шкаф во время регенерации.",
        ].slice(0, 7);

  return [
    "Что проверить (перечень возможных неисправностей, п. 2.2.2, табл. 3.2):",
    ...finalSteps.map((line, idx) => `${idx + 1}. ${line}`),
  ].join("\n");
}

function buildEthernetTroubleshootingFallback(chunks) {
  const text = joinedChunkText(chunks);
  if (!/ethernet|локальн(?:ой|ая)\s+сет|разъем\s+для\s+подключения\s+шкафа\s+к\s+сети/iu.test(text)) {
    return "";
  }
  const causes = [];
  const checks = [];

  if (/плохой\s+контакт\s+ethernet\s+кабеля\s+в\s+разъ[её]ме\s+шкафа/iu.test(text)) {
    causes.push("Плохой контакт Ethernet-кабеля в разъеме шкафа.");
    checks.push("Проверьте контакт Ethernet-кабеля в разъеме шкафа.");
  }
  if (/неисправен\s+ethernet\s+кабель/iu.test(text)) {
    causes.push("Неисправен Ethernet-кабель.");
    checks.push("Проверьте Ethernet-кабель.");
  }
  if (/разъ[её]м\s+для\s+подключения\s+шкафа\s+к\s+сети\s+ethernet|подключить\s+кабель\s+ethernet\s+к\s+сетевому\s+разъ[её]му/iu.test(text)) {
    checks.push("Проверьте подключение кабеля Ethernet к сетевому разъему шкафа.");
  }
  if (/локальн(?:ой|ая)\s+сет|удаленн(?:ый|ого)\s+доступ|dry storage/iu.test(text)) {
    checks.push("Проверьте подключение шкафа к локальной сети Ethernet и доступ через Dry Storage.");
  }

  const uniqueChecks = [...new Set(checks)].slice(0, 5);
  const uniqueCauses = [...new Set(causes)].slice(0, 5);
  if (!uniqueChecks.length && !uniqueCauses.length) {
    return "";
  }

  return [
    ...(uniqueCauses.length
      ? ["Возможные причины:", ...uniqueCauses.map((line, idx) => `${idx + 1}. ${line}`), ""]
      : []),
    "Что проверить:",
    ...uniqueChecks.map((line, idx) => `${idx + 1}. ${line}`),
  ].join("\n");
}

function buildTroubleshootingFallback(symptom, chunks) {
  if (symptom === "power") {
    return buildPowerTroubleshootingFallback(chunks);
  }
  if (symptom === "humidity") {
    return buildHumidityTroubleshootingFallback(chunks);
  }
  if (symptom === "ethernet") {
    return buildEthernetTroubleshootingFallback(chunks);
  }
  return "";
}

module.exports = {
  buildTroubleshootingFallback,
  buildPowerTroubleshootingFallback,
  buildHumidityTroubleshootingFallback,
  buildEthernetTroubleshootingFallback,
};
