/** MAINTENANCE_QUERY: замена, расходники, ресурс — разделы 1.1.2 и 3.1. */

function isMaintenanceQuery(text) {
  const q = String(text || "").trim();
  if (!q) {
    return false;
  }
  if (
    /не\s+работ|не\s+включ|не\s+запуска|неисправ|ошибк|сбой|почему\s+не|что\s+делать\s+если/i.test(
      q
    )
  ) {
    return false;
  }
  return /(?:замен(?:а|ить|у|ы)|менять\s+блок|расходник|ресурс\s+(?:осушител|блока)|исчерпал\s+ресурс|срок\s+служб|запасн(?:ые|ых)\s+част|комплект\s+поставк|техническ(?:ое|ого)\s+обслуживани|график\s+обслуж|периодичност(?:ь|и)\s+замен|когда\s+менять|через\s+сколько\s+менять|36\s+месяц|блок\s+осуш)/iu.test(
    q
  );
}

function maintenanceSectionHintsForQuery() {
  return ["1.1.2", "3.1", "техническ", "обслуживани", "замен", "ресурс", "осушител"];
}

module.exports = {
  isMaintenanceQuery,
  maintenanceSectionHintsForQuery,
};
