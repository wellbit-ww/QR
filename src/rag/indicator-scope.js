/**
 * П. 1.1.4.3.3 — штатные световые индикаторы (не путать с неисправностями).
 */

const FAULT_MARKERS_RE =
  /не\s+работ|неисправ|ошибк|сбой|пищит|аварийн|опасно|что\s+делать|сломал|поломк|не\s+включ|не\s+запуска/i;

function hasIndicatorTopic(text) {
  return /индикатор|индикац|световой\s+сигнал|светодиод|ламп[аы]|сигнализац/i.test(String(text || ""));
}

function hasFaultMarkers(text) {
  return FAULT_MARKERS_RE.test(String(text || ""));
}

/**
 * @returns {null | { mode: string, sectionHints: string[], labelRu: string }}
 */
function resolveNormalIndicatorMode(query) {
  const q = String(query || "").trim();
  if (!q || !hasIndicatorTopic(q) || hasFaultMarkers(q)) {
    return null;
  }

  const yellow =
    /желт[а-яё]*|yellow/i.test(q) &&
    (/индикатор|сигнал|ламп|горит|горит|включен/i.test(q) || hasIndicatorTopic(q));
  const green = /зелен[а-яё]*|green/i.test(q);
  const red = /красн[а-яё]*|red/i.test(q);
  const blinking = /мига|мигающ/i.test(q);

  if (yellow && !/зелен.*красн|красн.*зелен/i.test(q)) {
    return {
      mode: "regeneration",
      sectionHints: ["1.1.4.3.3", "регенерац", "желт", "индикатор"],
      labelRu: "режим «Регенерации» (жёлтый индикатор — норма)",
    };
  }

  if (green && (blinking || red)) {
    return {
      mode: "drying",
      sectionHints: ["1.1.4.3.3", "осушен", "зелен", "красн", "мига", "индикатор"],
      labelRu: "режим «Осушения» (зелёный + мигающий красный — норма)",
    };
  }

  if (green && !red && !blinking) {
    return {
      mode: "storage",
      sectionHints: ["1.1.4.3.3", "хранен", "зелен", "индикатор"],
      labelRu: "режим «Хранения» (зелёный индикатор — норма)",
    };
  }

  if (red && !yellow && !(green && blinking)) {
    return {
      mode: "door_open",
      sectionHints: ["1.1.4.3.3", "двер", "красн", "индикатор"],
      labelRu: "открыта дверь (красный индикатор — норма)",
    };
  }

  if (/что\s+(?:значит|означает)|какой\s+режим|штатн|нормальн|это\s+норм/i.test(q) && /желт|зелен|красн|мига|горит/i.test(q)) {
    return {
      mode: "indicator_info",
      sectionHints: ["1.1.4.3.3", "индикатор", "режим", "светов"],
      labelRu: "описание индикаторов п. 1.1.4.3.3",
    };
  }

  if ((/мигает|горит/i.test(q) || blinking) && hasIndicatorTopic(q) && !hasFaultMarkers(q)) {
    return {
      mode: "indicator_info",
      sectionHints: ["1.1.4.3.3", "индикатор", "осушен", "регенерац"],
      labelRu: "уточнить цвет индикаторов по п. 1.1.4.3.3",
    };
  }

  return null;
}

function isNormalIndicatorSymptomQuery(query) {
  return resolveNormalIndicatorMode(query) != null;
}

module.exports = {
  resolveNormalIndicatorMode,
  isNormalIndicatorSymptomQuery,
};
