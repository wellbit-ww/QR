/**
 * Пилот «честного» RAG: equipment id из RAG_HONEST_EQUIPMENT (через запятую).
 * Для этих id отключается FAQ deterministic/post-gate recovery (см. docs/RAG_SDB1560M_HONEST_RESTORE.md).
 */

function parseHonestEquipmentIds() {
  const raw = String(process.env.RAG_HONEST_EQUIPMENT || "").trim();
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean);
}

function shouldUseHonestRag(equipmentId) {
  const id = String(equipmentId || "").trim().toLowerCase();
  if (!id) {
    return false;
  }
  return parseHonestEquipmentIds().includes(id);
}

function shouldDeferGuardrailsToPostGate(equipmentProfile, equipmentId) {
  if (!equipmentProfile?.deferGuardrailsToPostGate) {
    return false;
  }
  return true;
}

function shouldAutoDirectWhenNoPostgres(equipmentProfile, equipmentId) {
  if (!equipmentProfile?.autoDirectWhenNoPostgres) {
    return false;
  }
  if (shouldUseHonestRag(equipmentId)) {
    return false;
  }
  return true;
}

/** Числовые ТТХ / single-field: retrieval-cards не должны доминировать над PDF/таблицами. */
function isNumericTtxRetrievalQuery(query, intent) {
  const intentType = intent?.intentType;
  if (intentType === "SINGLE_FIELD_QUERY" || intentType === "QUICK_FACT_QUERY") {
    return true;
  }
  const fp = intent?.focusParameter;
  if (
    fp &&
    [
      "kit_shelf_count",
      "internal_volume",
      "full_volume",
      "dimensions",
      "voltage",
      "frequency",
      "humidity",
      "load",
      "pressure",
      "protection",
      "temperature",
      "grounding_resistance",
      "nitrogen",
      "power_storage",
      "power_regen",
    ].includes(fp)
  ) {
    return true;
  }
  const q = String(query || "");
  return /(?:сколько\s+полок|количеств\w*\s+полок|полок\s+в\s+комплект|объ[её]м|масс|вес|габарит|мощност|питани|частот|напряжен|шаг\s+влаж|диапазон\s+влаж|класс\s+защиты|\bip\s*\d)/iu.test(
    q,
  );
}

/** Honest 1560: skip retrieval-cards только для «голых» spec-чисел, не SET/дверь/режимы. */
function isHonestNumericSpecOnlyQuery(query, intent) {
  const intentType = intent?.intentType;
  if (intentType === "PROCEDURE_QUERY" || intentType === "CONFIGURATION_QUERY") {
    return false;
  }
  const q = String(query || "");
  if (
    /задать\s+порог|выставить.*влажност|как\s+открыть\s+двер|какие\s+режим|что\s+показывает\s+диспл/i.test(
      q,
    )
  ) {
    return false;
  }
  return isNumericTtxRetrievalQuery(query, intent);
}

function shouldSkipRetrievalCardsForHonest1560(equipmentId, query, intent, honestRag) {
  void honestRag;
  if (!shouldUseHonestRag(equipmentId)) {
    return false;
  }
  return isHonestNumericSpecOnlyQuery(query, intent);
}

module.exports = {
  parseHonestEquipmentIds,
  shouldUseHonestRag,
  shouldDeferGuardrailsToPostGate,
  shouldAutoDirectWhenNoPostgres,
  isNumericTtxRetrievalQuery,
  isHonestNumericSpecOnlyQuery,
  shouldSkipRetrievalCardsForHonest1560,
};
