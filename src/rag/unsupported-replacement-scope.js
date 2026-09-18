/**
 * Замена/ремонт узла, для которого в РЭ нет операторской инструкции.
 * Не подменяет ТО и табл. 3.2 (осушитель, уплотнители, кабели) и не перехватывает
 * явные запросы контактов — их обрабатывает isContactSupportQuery.
 */
const { buildPortalContactSupportAnswer } = require("./portal-contact-support-answer");

const DOCUMENTED_OPERATOR_TOPIC =
  /(?:осушител|цеолит|блок[аеу]?\s+осуш|осушающ|уплотнител|кабел(?:ь|я|ю|е)?(?:\s+(?:питан|ethernet|сетев))?|ethernet|разъ[её]м|предохранител|датчик(?:а|у)?\s+влажност)/iu;

const UNSUPPORTED_PART =
  /(?:стекл|смотров\w*\s+окн|lcd|диспле|экран|панел[ьи]\s+управл|электронн\w*\s+блок|печатн\w*\s+плат|ручк[аиу]|замок|замк[аеи]|ключ(?:и|ей|а)?|полк[аиуе]|колес|колёс|ножк|ножек|подогрев|тэн|нагревател|ротаметр|клапан\s+азот|вентилятор|заслонк|корпус|кожух|освещен|светофор|браслет|датчик(?:а|у)?\s+двер|двер(?:ь|и|цу|ью)(?!\s+уплотнит))/iu;

const DAMAGE_OR_REPLACE_INTENT =
  /(?:как\s+(?:замен|помен|почин|отремонтир)|замен(?:ить|а|ите)\b|помен(?:ять|ите)|почин(?:ить|ка|ите)|отремонтир|разбил|треснул|лопнул|выбил|\bскол(?:а|у|е|ом|ы)?\b|слом(?:ался|алась|алось|ать)|отвалил|потерял[аи]?\s+ключ|дубликат\s+ключ|можно\s+ли\s+(?:сам[ао]?му?\s+)?(?:замен|помен|почин))/iu;

const FOLLOWUP_BROKEN =
  /(?:^|\s)(?:оно\s+|это\s+)?(?:разбил|треснул|лопнул|слом(?:алось|ался|алась)|отвалил)о?сь?\s*[.!?…]*$/iu;

const FOLLOWUP_HOW_REPLACE =
  /^(?:а\s+)?как\s+(?:это\s+)?(?:замен|помен|почин)/iu;

const TROUBLESHOOTING_NOT_REPLACEMENT =
  /(?:звук(?:ов)?\s+сигнал|пищит|влажност\s+не\s+(?:падает|сниж)|не\s+включает(?:ся)?|типов\w*\s+неисправ|табл(?:иц[аеы])?\s*3\.2|где\s+описан|в\s+каком\s+раздел|самостоятельн\w*\s+ремонт|текущ\w*\s+ремонт)/iu;

const SPEC_NOT_REPLACEMENT =
  /(?:сколько|какая\s+(?:нагрузк|масса)|выдержит|весит|укороченн|как\s+монтиру)/iu;

const PART_LABELS = [
  { re: /стекл|смотров\w*\s+окн/iu, label: "стекла двери" },
  { re: /lcd|диспле|экран/iu, label: "дисплея (LCD)" },
  { re: /панел[ьи]\s+управл/iu, label: "панели управления" },
  { re: /электронн\w*\s+блок|печатн\w*\s+плат/iu, label: "электронного блока" },
  { re: /ключ(?:и|ей|а)?/iu, label: "ключей" },
  { re: /замок|замк[аеи]|ручк/iu, label: "замка (ручки) двери" },
  { re: /полк/iu, label: "полки" },
  { re: /колес|колёс/iu, label: "колёс" },
  { re: /ножк|ножек/iu, label: "ножек" },
  { re: /подогрев|тэн|нагревател/iu, label: "опции подогрева" },
  { re: /ротаметр|клапан\s+азот|азот/iu, label: "системы азота" },
  { re: /вентилятор/iu, label: "вентилятора" },
  { re: /заслонк/iu, label: "заслонки осушителя" },
  { re: /освещен|светофор/iu, label: "освещения / светосигнальной колонны" },
  { re: /браслет/iu, label: "антистатического браслета" },
  { re: /датчик(?:а|у)?\s+двер/iu, label: "датчика двери" },
  { re: /корпус|кожух/iu, label: "корпуса" },
  { re: /двер/iu, label: "двери" },
];

function combinedUserText(message, history = []) {
  const recent = (Array.isArray(history) ? history : [])
    .filter((entry) => entry?.role === "user" && typeof entry.content === "string")
    .slice(-2)
    .map((entry) => String(entry.content || "").trim())
    .join(" ");
  return `${recent} ${String(message || "").trim()}`.replace(/\s+/g, " ").trim();
}

function matchPartLabel(text) {
  const match = PART_LABELS.find((item) => item.re.test(String(text || "")));
  return match ? match.label : null;
}

function inferUnsupportedPartLabel(message, history = []) {
  const current = String(message || "").trim();
  return matchPartLabel(current) || matchPartLabel(combinedUserText(current, history)) || "этого узла";
}

function modelNameFromEquipment(equipment) {
  const id = String(equipment?.id || "");
  const name = String(equipment?.name || "");
  if (id.includes("1106") || /sdb1106/i.test(name)) return "SDB1106NM";
  if (id.includes("702") || /sdb702/i.test(name)) return "SDB702NM";
  if (id.includes("151") || /sdb151/i.test(name)) return "SDB151NM";
  if (id === "w-700" || /sdb302/i.test(name) || id.includes("302")) return "SDB302NM";
  return String(name || "шкафа").replace(/\s+/g, "");
}

function isUnsupportedReplacementQuery(message, history = []) {
  const current = String(message || "").trim();
  if (!current || current.length < 4) {
    return false;
  }
  if (TROUBLESHOOTING_NOT_REPLACEMENT.test(current) || SPEC_NOT_REPLACEMENT.test(current)) {
    return false;
  }

  const ctx = combinedUserText(current, history);
  if (DOCUMENTED_OPERATOR_TOPIC.test(ctx) && !/стекл|lcd|диспле|замок|полк|колес/iu.test(ctx)) {
    return false;
  }

  if (DAMAGE_OR_REPLACE_INTENT.test(current) && UNSUPPORTED_PART.test(current)) {
    return true;
  }
  if (
    (FOLLOWUP_BROKEN.test(current) || FOLLOWUP_HOW_REPLACE.test(current)) &&
    UNSUPPORTED_PART.test(ctx) &&
    !DOCUMENTED_OPERATOR_TOPIC.test(ctx)
  ) {
    return true;
  }
  return false;
}

function buildUnsupportedReplacementAnswer(model, message, history = []) {
  const name = String(model || "шкафа").trim() || "шкафа";
  const part = inferUnsupportedPartLabel(message, history);
  const combined = combinedUserText(message, history);
  const mechanical = /(?:разбил|треснул|лопнул|выбил|скол|слом|отвалил)/iu.test(combined);
  const lines = [
    `В руководстве по эксплуатации **${name}** нет инструкции по замене **${part}**. Самостоятельный ремонт этого узла оператору **не предусмотрен**.`,
  ];
  if (mechanical) {
    lines.push(
      "При механическом повреждении осмотр выполняйте только при **отключённом питании**, **обесточьте шкаф** и не разбирайте шкаф самостоятельно.",
    );
  }
  lines.push("", "Обратитесь в техподдержку:", "", buildPortalContactSupportAnswer());
  return lines.join("\n");
}

module.exports = {
  isUnsupportedReplacementQuery,
  buildUnsupportedReplacementAnswer,
  inferUnsupportedPartLabel,
  modelNameFromEquipment,
};
