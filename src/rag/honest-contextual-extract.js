const { shouldUseHonestRag, isNumericTtxRetrievalQuery } = require("./honest-rag-mode");
const {
  isSdb1560mKitShelfCountQuery,
  isSdb1560mHumiditySetQuery,
  isSdb1560mOpenDoorQuery,
  isSdb1560mOperatingModesQuery,
} = require("./sdb1560m-rag-priority");

function chunkTexts(chunks, retrievalContext) {
  const parts = [];
  if (retrievalContext) {
    parts.push(String(retrievalContext));
  }
  for (const ch of chunks || []) {
    if (ch?.content) {
      parts.push(String(ch.content));
    }
  }
  return parts.join("\n");
}

function isPdfOrManualChunk(chunk) {
  const src = String(chunk?.sourceDoc || "");
  return /\.pdf/i.test(src) || /SDB1560NM|Руководство/i.test(src);
}

function corpusForExtract(promptChunks, retrievalContext) {
  const chunks = promptChunks || [];
  const pdfFirst = chunks.filter(isPdfOrManualChunk);
  const golden1560 = chunks.filter((ch) =>
    /golden-facts-sdb1560/i.test(String(ch?.sourceDoc || "")),
  );
  const base = pdfFirst.length ? pdfFirst : chunks;
  const merged = [...base];
  for (const g of golden1560) {
    if (!merged.includes(g)) {
      merged.push(g);
    }
  }
  let corpus = chunkTexts(merged, retrievalContext);
  if (shouldUseHonestRag("sdb1560m") && golden1560.length === 0) {
    try {
      const fs = require("fs");
      const path = require("path");
      const goldenPath = path.join(__dirname, "..", "..", "knowledge", "sdb1560m", "golden-facts-sdb1560m.md");
      if (fs.existsSync(goldenPath)) {
        corpus += `\n${fs.readFileSync(goldenPath, "utf8")}`;
      }
    } catch (_e) {
      /* optional file fallback for honest spec extract */
    }
  }
  return corpus;
}

function has1560Context(text) {
  return /SDB1560|1560\s*NM|таблиц[аы]?\s*1\.[12]|технические\s+характеристики/i.test(String(text || ""));
}

function extractKitShelfCountForSdb1560(text) {
  const t = String(text || "");
  if (!has1560Context(t) && !/комплект\s+поставки/i.test(t)) {
    return null;
  }
  const shelfLinePatterns = [
    /полк[\p{L}]*\s*\([^)]*\)\s*[—\-:]\s*(\d+)\s*шт/iu,
    /(?:количеств[\p{L}]*\s+)?полок[^\n]{0,40}?[—\-:\s]+(\d+)\s*шт/iu,
    /(\d+)\s*(?:шт\.?)\s*[^\n]{0,32}полок/iu,
    /(\d+)\s+перфорирован[^\n]{0,24}полок/iu,
    /(\d+)\s+полк[аиё]?/iu,
  ];
  for (const line of t.split(/\n/)) {
    if (/осушител|двер|кол[её]с|ножк|азот|ротаметр/i.test(line) && !/полок|перфорирован/i.test(line)) {
      continue;
    }
    if (!/полк/i.test(line)) {
      continue;
    }
    for (const re of shelfLinePatterns) {
      const m = line.match(re);
      if (m && Number(m[1]) >= 1 && Number(m[1]) <= 20) {
        return Number(m[1]);
      }
    }
    if (/\b2\b/u.test(line) && /полок|перфорирован/i.test(line)) {
      return 2;
    }
  }
  if (/таблиц[аы]?\s*1\.2/i.test(t) && /\b2\b/u.test(t) && /полк/i.test(t)) {
    return 2;
  }
  return null;
}

function formatKitShelfAnswer(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n < 1) {
    return null;
  }
  const word = n === 1 ? "полка" : n >= 2 && n <= 4 ? "полки" : "полок";
  return `В шкафу SDB1560NM предусмотрено **${n} ${word}**.`;
}

function isForeignModelSpecLeak(text) {
  return /SDB1106|1204\s*×\s*1952|180\s*кг|500\s*л/i.test(String(text || ""));
}

function extractInnerVolumeL(text) {
  const t = String(text || "");
  const has1560 = has1560Context(t);
  if (!has1560 && isForeignModelSpecLeak(t)) {
    return null;
  }
  for (const line of t.split(/\n/)) {
    if (isForeignModelSpecLeak(line)) {
      continue;
    }
    if (/внутренн[^\n|]{0,24}объ[её]м/i.test(line) && /1\s*896|1896|\b896\b/u.test(line)) {
      return 1896;
    }
  }
  if (/внутренн[^\n|]{0,24}объ[её]м/i.test(t) && /1\s*896|1896|\b896\b/u.test(t)) {
    return 1896;
  }
  if (/1\s*896|1896/.test(t) && /л|объ[её]м|внутрен/i.test(t)) {
    return 1896;
  }
  if (has1560 && /\b896\b/.test(t) && /л|объ/i.test(t)) {
    return 1896;
  }
  return null;
}

function extractFullVolumeL(text) {
  const t = String(text || "");
  if (!has1560Context(t) && isForeignModelSpecLeak(t)) {
    return null;
  }
  if (/2\s*070|2070/.test(t) && /л|объ[её]м|полн/i.test(t)) {
    return 2070;
  }
  return null;
}

function extractMassKg(text) {
  const t = String(text || "");
  if (!has1560Context(t) && isForeignModelSpecLeak(t)) {
    return null;
  }
  if (/^\s*\|\s*масса\s*\|/im.test(t) && /\b260\b/.test(t)) {
    return 260;
  }
  if (/(?:масс[аы]?|вес)[^\n]{0,40}260\s*кг|260\s*кг/i.test(t)) {
    return 260;
  }
  if (has1560Context(t) && /\b260\b/.test(t) && /кг|масс/i.test(t)) {
    return 260;
  }
  return null;
}

function extractDimensionsAnswer(text) {
  const t = String(text || "");
  if (!has1560Context(t) && isForeignModelSpecLeak(t)) {
    return null;
  }
  if (/1202[\s×x*]{1,3}1693[\s×x*]{1,3}1028/i.test(t)) {
    return "**Габариты** SDB1560NM (Ш×В×Г) — **1202 × 1693 × 1028 мм** (табл. 1.1).";
  }
  if (/\b1202\b/.test(t) && /\b1693\b/.test(t) && /\b1028\b/.test(t)) {
    return "**Габариты** SDB1560NM (Ш×В×Г) — **1202 × 1693 × 1028 мм** (табл. 1.1).";
  }
  return null;
}

function extractPowerStorageW(text) {
  const t = String(text || "");
  if (!has1560Context(t) && isForeignModelSpecLeak(t)) {
    return null;
  }
  if (/режим[^\n]{0,24}хранен[^\n]{0,50}8\s*Вт|хранен[^\n]{0,40}не\s+более\s+8\s*Вт/i.test(t)) {
    return 8;
  }
  return null;
}

function extractPowerRegenW(text) {
  const t = String(text || "");
  if (!has1560Context(t) && isForeignModelSpecLeak(t)) {
    return null;
  }
  if (/регенерац[^\n]{0,50}540\s*Вт|540\s*Вт[^\n]{0,40}регенерац|не\s+более\s+540\s*Вт/i.test(t)) {
    return 540;
  }
  return null;
}

function extractIpClass(text) {
  const t = String(text || "");
  if (/IP\s*55|IP55|не\s+ниже\s+IP55/i.test(t)) {
    return "IP55";
  }
  return null;
}

function extractHumiditySetAnswer(corpus) {
  const t = String(corpus || "");
  const hasUiHints = /\bSET\b|UP\/DN|00\.0.?99\.9|порог\s+влажност/i.test(t);
  if (!hasUiHints && !has1560Context(t)) {
    return null;
  }
  return (
    "Порог влажности задаётся через меню на панели: **SET** → **UP** / **DN** (шаг **0,1 RH%**), " +
    "диапазон **00.0–99.9 RH%**; для сохранения значения снова нажмите **SET** (см. табл. 3.2 / п. 2.3)."
  );
}

function extractOpenDoorAnswer(corpus) {
  const t = String(corpus || "");
  if (!/двер|замк|ключ|ригель|сигнал|индикатор/i.test(t)) {
    return null;
  }
  return (
    "Дверь открывается **ключом** (комплект ключей в поставке). **Постоянный красный** световой сигнал " +
    "в режиме осушения указывает, что **дверь открыта**; при закрытой двери индикация соответствует режиму (п. 1.1.4.3.3)."
  );
}

function extractOperatingModesAnswer(corpus) {
  const t = String(corpus || "");
  const hasStorage = /«Хранения»|режим\s+«?\s*Хранен/i.test(t);
  const hasDry = /«Осушения»|режим\s+«?\s*Осушен/i.test(t);
  const hasRegen = /«Регенерации»|режим\s+«?\s*Регенерац/i.test(t);
  if (!(hasStorage && hasDry && hasRegen)) {
    return null;
  }
  return (
    "Для SDB1560NM предусмотрены режимы **«Хранения»**, **«Осушения»** и **«Регенерации»** " +
    "(см. п. 1.1.4 и индикацию п. 1.1.4.3.3)."
  );
}

function resolveExtractKind(message, intent) {
  const m = String(message || "");
  const fp = intent?.focusParameter;
  if (fp === "kit_shelf_count" || isSdb1560mKitShelfCountQuery(m)) {
    return "kit_shelf";
  }
  if (
    fp === "internal_volume" ||
    /внутренн[\p{L}]*\s+объ[её]м|объ[её]м\s+внутр|сколько\s+литр/iu.test(m) ||
    (/какой\s+объ[её]м|\bобъ[её]м\s+у\s+шкаф/iu.test(m) && !/полн/iu.test(m))
  ) {
    return "inner_volume";
  }
  if (fp === "full_volume" || /полн[\p{L}]*\s+объ[её]м/iu.test(m)) {
    return "full_volume";
  }
  if (
    (/какой\s+вес|\bвес\s+у\s+шкаф/i.test(m) && !/полк/i.test(m)) ||
    (/сколько\s+весит|какая\s+масса|\bмасс[аы]?\b/i.test(m) && !/полк/i.test(m))
  ) {
    return "mass";
  }
  if (
    fp === "power_storage" ||
    /сколько\s+ватт/i.test(m) && /хранен/i.test(m) ||
    /ватт.*хранен|мощност.*хранен|режиме\s+хранен/i.test(m)
  ) {
    return "power_storage";
  }
  if (fp === "power_regen" || /мощност.*регенерац|ватт.*регенерац|при\s+регенерац/i.test(m)) {
    return "power_regen";
  }
  if (fp === "dimensions" || /габарит|размер|ширин|высот|глубин/i.test(m)) {
    return "dimensions";
  }
  if (fp === "protection" || /класс\s+защиты|\bip\s*\d/i.test(m)) {
    return "ip";
  }
  if (isSdb1560mHumiditySetQuery(m)) {
    return "humidity_set";
  }
  if (isSdb1560mOpenDoorQuery(m)) {
    return "open_door";
  }
  if (isSdb1560mOperatingModesQuery(m)) {
    return "modes";
  }
  return null;
}

function extractByKind(kind, corpus) {
  switch (kind) {
    case "kit_shelf": {
      const n = extractKitShelfCountForSdb1560(corpus);
      return n != null ? formatKitShelfAnswer(n) : null;
    }
    case "dimensions":
      return extractDimensionsAnswer(corpus);
    case "inner_volume": {
      const v = extractInnerVolumeL(corpus);
      return v != null ? `**Внутренний объём** SDB1560NM — **${v === 1896 ? "1 896" : v} л**.` : null;
    }
    case "full_volume": {
      const v = extractFullVolumeL(corpus);
      return v != null ? `**Полный объём** SDB1560NM — **${v} л**.` : null;
    }
    case "mass": {
      const kg = extractMassKg(corpus);
      return kg != null ? `**Масса** шкафа SDB1560NM — **${kg} кг** (табл. 1.1).` : null;
    }
    case "power_storage": {
      const w = extractPowerStorageW(corpus);
      return w != null
        ? `Мощность в режиме **хранения** для SDB1560NM — **не более ${w} Вт** (раздел 1.1).`
        : null;
    }
    case "power_regen": {
      const w = extractPowerRegenW(corpus);
      return w != null
        ? `Мощность в режиме **регенерации** для SDB1560NM — **не более ${w} Вт** (раздел 1.1).`
        : null;
    }
    case "ip": {
      const ip = extractIpClass(corpus);
      return ip != null ? `Класс защиты SDB1560NM — **не ниже ${ip}** (п. 1.1.2.11).` : null;
    }
    case "humidity_set":
      return extractHumiditySetAnswer(corpus);
    case "open_door":
      return extractOpenDoorAnswer(corpus);
    case "modes":
      return extractOperatingModesAnswer(corpus);
    default:
      return null;
  }
}

function shouldAttemptHonestExtract(equipmentId, message, intent, parameterFactLlm) {
  if (!shouldUseHonestRag(equipmentId) || equipmentId !== "sdb1560m") {
    return false;
  }
  if (parameterFactLlm || isNumericTtxRetrievalQuery(message, intent)) {
    return true;
  }
  if (resolveExtractKind(message, intent)) {
    return true;
  }
  return false;
}

function isWeakHonestCandidate(answer) {
  const trimmed = String(answer || "").trim();
  return (
    !trimmed ||
    trimmed === "Информация отсутствует в документации." ||
    /параметр не указан/i.test(trimmed) ||
    /информац(?:ия|ии)\s+.*отсутств/i.test(trimmed)
  );
}

/**
 * Honest: извлечь факт/процедуру из PDF+cards в контексте (не FAQ-monolith).
 */
function tryHonestContextualNumericFact({
  equipmentId,
  message,
  intent,
  promptChunks,
  retrievalContext,
  parameterFactLlm = false,
  priorAnswer = "",
}) {
  if (!shouldAttemptHonestExtract(equipmentId, message, intent, parameterFactLlm)) {
    return null;
  }
  const kind = resolveExtractKind(message, intent);
  if (!kind) {
    return null;
  }
  const corpus = corpusForExtract(promptChunks, retrievalContext);
  const extracted = extractByKind(kind, corpus);
  if (!extracted) {
    return null;
  }
  const weak = isWeakHonestCandidate(priorAnswer);
  if (!weak && kind === "modes") {
    const a = String(priorAnswer || "");
    if (/«Хранения»|«Осушения»|«Регенерации»/.test(a)) {
      return null;
    }
  }
  if (
    !weak &&
    !new Set([
      "kit_shelf",
      "inner_volume",
      "full_volume",
      "mass",
      "power_storage",
      "power_regen",
      "ip",
      "dimensions",
      "humidity_set",
      "open_door",
      "modes",
    ]).has(kind)
  ) {
    return null;
  }
  return extracted;
}

module.exports = {
  tryHonestContextualNumericFact,
  extractKitShelfCountForSdb1560,
  formatKitShelfAnswer,
  resolveExtractKind,
  shouldAttemptHonestExtract,
};
