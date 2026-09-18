const SDB702NM = "SDB702NM";
const SDB1106NM = "SDB1106NM";
const SDB151NM = "SDB151NM";
const SDB302NM = "SDB302NM";

/** Запрос про серийный/заводской номер оборудования (не телефон компании Совтест). */
function isEquipmentSerialNumberQuery(message) {
  const m = String(message || "").trim();
  if (!m || m.length < 4) {
    return false;
  }

  if (/(?:^|\s)номер\s+совтест/iu.test(m)) {
    return false;
  }

  if (
    /(?:серийн[\p{L}]*\s+номер|заводск[\p{L}]*\s+(?:знак|номер|табличк)|табличк[\p{L}]*\s+издел|знак\s+издел)/iu.test(
      m,
    )
  ) {
    return true;
  }

  if (/(?:маркировк[\p{L}]*\s+шкаф|маркировк[\p{L}]*.*серийн)/iu.test(m)) {
    return true;
  }

  if (
    /(?:где\s+(?:найти|написан|указан|смотреть|находится)|как\s+(?:узнать|прочитать|найти)|какой\s+формат).*(?:серийн|номер\s+шкаф|заводск|табличк|маркиров)/iu.test(
      m,
    )
  ) {
    return true;
  }

  if (/^номер\s+шкафа[?.!…]*$/iu.test(m)) {
    return true;
  }

  if (/(?:серийн[\p{L}]*\s+.*(?:аккаунт|профил|портал|кабинет)|серийн[\p{L}]*\s+на\s+сайте)/iu.test(m)) {
    return true;
  }

  return false;
}

function isPortalAccountSerialQuery(message) {
  const m = String(message || "").trim();
  return /(?:серийн[\p{L}]*\s+.*(?:аккаунт|профил|личн[\p{L}]*\s+кабинет)|серийн[\p{L}]*\s+.*портал)/iu.test(
    m,
  );
}

function normalizeModelName(modelName) {
  const name = String(modelName || "")
    .replace(/[\s-]+/g, "")
    .toUpperCase();
  if (/1106/.test(name)) {
    return SDB1106NM;
  }
  if (/302/.test(name)) {
    return SDB302NM;
  }
  if (/151/.test(name)) {
    return SDB151NM;
  }
  if (/702/.test(name)) {
    return SDB702NM;
  }
  return SDB702NM;
}

function buildPortalAccountSerialAnswer() {
  return [
    "**Серийный номер** вашего экземпляра на портале указан в **личном кабинете**:",
    "",
    "• в блоке **«Серийные номера»** на странице аккаунта;",
    "• при отправке **запроса в поддержку** — в поле **«Серийный номер»** (подставляется из аккаунта или выбирается из списка).",
    "",
    "Это номер, закреплённый за вашей организацией на портале SOVA; он может отличаться от заводского номера на табличке шкафа.",
    "",
    "Если номера нет в списке — уточните его у **техподдержки SOVTEST ATE** (**8 (800) 200-54-17**, **info@sovtest-ate.ru**).",
  ].join("\n");
}

function buildFactorySerialNumberAnswer(modelName) {
  const model = normalizeModelName(modelName);
  return [
    `**Серийный номер** шкафа **${model}** указан на **заводском знаке (табличке изделия)** (раздел **«Маркировка»**, рис. 1.2 РЭ).`,
    "",
    "На табличке также указаны: изготовитель, наименование и модель шкафа, напряжение питания, дата изготовления, страна-изготовитель, сведения о сертификатах.",
    "",
    "**Формат серийного номера** (п. «Маркировка»):",
    "• **квартал** изготовления;",
    "• **год** изготовления;",
    "• **порядковый номер** изделия в квартале (**0–9999**).",
  ].join("\n");
}

function resolveSerialNumberAnswer(message, modelName = SDB702NM) {
  const m = String(message || "").trim();
  if (!isEquipmentSerialNumberQuery(m)) {
    return null;
  }

  if (isPortalAccountSerialQuery(m)) {
    return buildPortalAccountSerialAnswer();
  }

  const wantsFactory =
    /(?:заводск|табличк|маркиров|формат|где\s+(?:найти|указан|написан|смотреть)|как\s+(?:узнать|прочитать)|какой\s+формат)/iu.test(
      m,
    ) ||
    (/(?:серийн|номер\s+шкаф)/iu.test(m) && /(?:где|как|что\s+на)/iu.test(m));

  if (wantsFactory) {
    return buildFactorySerialNumberAnswer(modelName);
  }

  return buildFactorySerialNumberAnswer(modelName);
}

module.exports = {
  isEquipmentSerialNumberQuery,
  isPortalAccountSerialQuery,
  buildPortalAccountSerialAnswer,
  buildFactorySerialNumberAnswer,
  resolveSerialNumberAnswer,
};
