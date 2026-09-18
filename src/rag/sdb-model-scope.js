const SDB_MODEL_RE = /\bSDB\s*(\d{3,4})(?:\s*[-\s]?\s*NM)?\b/giu;

function canonicalSdbModel(value) {
  const compact = String(value || "").toUpperCase().replace(/[\s-]/g, "");
  const match = compact.match(/^SDB(\d{3,4})(?:NM)?$/);
  return match ? `SDB${match[1]}NM` : "";
}

function modelsMentioned(text) {
  const found = new Set();
  const re = new RegExp(SDB_MODEL_RE.source, "giu");
  let match;
  while ((match = re.exec(String(text || ""))) !== null) {
    found.add(`SDB${match[1]}NM`);
  }
  return [...found];
}

function foreignSdbModels(text, equipment) {
  const target = canonicalSdbModel(equipment?.name || equipment?.id);
  if (!target) {
    return [];
  }
  return modelsMentioned(text).filter((model) => model !== target);
}

function buildForeignModelReply(equipment) {
  return `Я специализируюсь только на модели ${equipment?.name || "выбранного шкафа"}. Могу подсказать параметры и эксплуатацию именно этого устройства.`;
}

function anchorQueryToEquipmentModel(query, equipment) {
  const model = canonicalSdbModel(equipment?.name || equipment?.id);
  let normalized = String(query || "").trim();
  if (!model) {
    return normalized;
  }

  const foreign = foreignSdbModels(normalized, equipment);
  if (foreign.length) {
    normalized = normalized.replace(SDB_MODEL_RE, " ").replace(/\s+/g, " ").trim();
  }
  const modelBase = model.replace(/NM$/, "");
  if (!new RegExp(`\\b${modelBase}(?:\\s*[-\\s]?\\s*NM)?\\b`, "iu").test(normalized)) {
    normalized = `${normalized} ${model}`.trim();
  }
  return normalized.replace(/\s+/g, " ").trim();
}

module.exports = {
  anchorQueryToEquipmentModel,
  buildForeignModelReply,
  canonicalSdbModel,
  foreignSdbModels,
  modelsMentioned,
};
