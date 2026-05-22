const SYMPTOM_RULES = Object.freeze([
  { key: "beep", re: /пищит|звуков(?:ой|\s+сигнал)|сигнализац/iu },
  { key: "ethernet", re: /ethernet|нет\s+связ|сеть|локальн|соединени[ея]|пропада(?:ет|ть)|кабель\s+ethernet/iu },
  { key: "power", re: /не\s+включ|не\s+запуска|питани|напряжен/iu },
  { key: "humidity", re: /влажност|rh|осуш|суш|не\s+падает|не\s+держ|не\s+выходит|не\s+достигает/iu },
  { key: "indicator", re: /индикатор|индикац|светодиод|мигает|горит/iu },
  { key: "door", re: /двер|открыт|закрыт/iu },
]);

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function detectSymptoms(query) {
  const s = String(query || "");
  const found = [];
  for (const rule of SYMPTOM_RULES) {
    if (rule.re.test(s)) {
      found.push(rule.key);
    }
  }
  return unique(found);
}

function classifyTroubleshootingDomain(symptoms) {
  const arr = Array.isArray(symptoms) ? symptoms : [];
  if (arr.includes("humidity")) {
    return "humidity";
  }
  if (arr.includes("ethernet")) {
    return "ethernet";
  }
  if (arr.includes("power")) {
    return "power";
  }
  if (arr.includes("indicator")) {
    return "indicator";
  }
  return null;
}

function isAmbiguousTroubleshooting(query, symptoms) {
  const q = String(query || "").trim();
  const generic =
    q.length < 40 &&
    /^(шкаф\s+)?(?:пищит|не\s+работает|не\s+запускается|ошибка|сигнал)$/iu.test(q);
  return generic || (Array.isArray(symptoms) && symptoms.length === 0);
}

module.exports = {
  SYMPTOM_RULES,
  detectSymptoms,
  classifyTroubleshootingDomain,
  isAmbiguousTroubleshooting,
};
