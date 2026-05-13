/**
 * Стратегия чанкинга для техдоков:
 * — таблицы markdown не режутся по середине; строки группируются с сохранением заголовка таблицы;
 * — проза режется окном с overlap;
 * — в metadata: chunkKind, operatingModes для фильтрации/rerank при retrieval.
 */

const { extractStructuredParameters } = require("./parameter-extraction");

function normalizeText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function detectOperatingModes(text) {
  const modes = new Set();
  const sample = String(text || "");

  if (/осушени|режим\s*осуш|осушк\w*|осушител/i.test(sample)) {
    modes.add("drying");
  }
  if (/хранени|режим\s*хран|хранилищ/i.test(sample)) {
    modes.add("storage");
  }
  if (/регенерац/i.test(sample)) {
    modes.add("regeneration");
  }

  if (modes.size === 0) {
    modes.add("general");
  }

  return [...modes];
}

/** Семантический тип блока для retrieval/rerank (параллельно legacy chunkKind). */
const BLOCK_TYPES = Object.freeze({
  TABLE_BLOCK: "TABLE_BLOCK",
  SPEC_BLOCK: "SPEC_BLOCK",
  PROCEDURE_BLOCK: "PROCEDURE_BLOCK",
  WARNING_BLOCK: "WARNING_BLOCK",
  GENERAL_BLOCK: "GENERAL_BLOCK",
});

function detectChunkKind(content) {
  const c = String(content || "");

  if (/^\s*\|[^\n]*\|/m.test(c) && /\|[\s\-:]+\|/.test(c)) {
    return "table";
  }

  const numberedLines = c.split("\n").filter((line) => /^\s*\d+\.\s+\S/.test(line)).length;
  if (
    numberedLines >= 2 ||
    (/^\s*(?:[-*+]|\d+\))\s+\S/m.test(c) &&
      c.split("\n").filter((line) => /^\s*(?:[-*+]|\d+\))\s/.test(line)).length >= 3)
  ) {
    return "procedure";
  }

  if (
    /требовани[яе]\s+(?:к\s+)?(?:безопасност|охран)|охран[ае]\s+труда|аварийн|ч\s*\.\?\s*п\.|п\s*\.\?\s*т\b/i.test(
      c
    )
  ) {
    return "safety";
  }

  if (/технич(?:еск)?(?:ие|\.)?\s+характеристик|таблиц(?:а|ы)\s*[\d.]|номинальн/i.test(c)) {
    return "spec";
  }

  return "general";
}

function chunkKindToBlockType(chunkKind) {
  switch (chunkKind) {
    case "table":
      return BLOCK_TYPES.TABLE_BLOCK;
    case "spec":
      return BLOCK_TYPES.SPEC_BLOCK;
    case "procedure":
      return BLOCK_TYPES.PROCEDURE_BLOCK;
    case "safety":
      return BLOCK_TYPES.WARNING_BLOCK;
    default:
      return BLOCK_TYPES.GENERAL_BLOCK;
  }
}

/** При множественных parameterTypes — один «ведущий» для скоринга (устранение multi-topic dominance). */
const PARAMETER_DOMINANCE_ORDER = [
  "grounding_resistance",
  "protection",
  "voltage",
  "frequency",
  "humidity",
  "temperature",
  "pressure",
  "load",
  "dimensions",
  "grounding",
  "nitrogen",
  "antistatic_resistor",
];

function inferPrimarySecondaryParameters(parameterTypes) {
  const pts = Array.isArray(parameterTypes)
    ? [...new Set(parameterTypes)].filter((p) => typeof p === "string")
    : [];
  pts.sort(
    (a, b) =>
      PARAMETER_DOMINANCE_ORDER.indexOf(a) - PARAMETER_DOMINANCE_ORDER.indexOf(b) ||
      a.localeCompare(b)
  );
  return {
    primaryParameter: pts[0] || null,
    secondaryParameter: pts[1] || null,
  };
}

function detectChunkSeverity(text) {
  const c = String(text || "");
  if (/аварийн|опасно|электроудар|смерт|угроз[аы]\s+жизни/i.test(c)) {
    return "high";
  }
  if (/неисправност|ошибк[аи]|поврежден|не\s+включается/i.test(c)) {
    return "medium";
  }
  return "low";
}

function detectNormativeSpec(text) {
  const c = String(text || "");
  return /(?:ГОСТ|ТУ\s*\d|должен\s|не\s+допускается|запрещено|обязательно\s|требовани[яе])/i.test(c);
}

/** Типы параметров для фильтрации retrieval/rerank (совпадают с focusParameter в query-intent). */
function detectParameterTypes(text) {
  const sample = String(text || "");
  const rules = [
    ["humidity", /\bRH%\w*|влажност|осушител|диапазон\s+(?:влажност|\(.*влаж)/i],
    ["voltage", /напряжен(?:ие|ия)|питающ(?:ее|ая)\s+сеть|\d+\s*(?:±)?\s*В\b/i],
    ["frequency", /\bГц\b|\bгерц|\bгц\b|частот[ауеы]/i],
    ["pressure", /\bкПа\b|\bПа\b|мм\s*рт|давлен/i],
    ["load", /нагрузк|полк|макс\.\s*нагрузк|\d+\s*кг\b/i],
    ["protection", /\bIP\s*\d+|степень\s+защиты|класс\s+защиты/i],
    ["dimensions", /габарит|размер(?:ы)?|ширин|высот|глубин|\d+\s*(?:×|x)\s*\d+/i],
    [
      "grounding_resistance",
      /сопротивлен(?:ие|ия)\s+заземляющего\s+контура|заземляющ(?:ий|его)\s+контур|сопротивлен(?:ие|ия)\s+заземления\b/i,
    ],
    [
      "antistatic_resistor",
      /1\s*МОм|антистатическ(?:ий|ого|ая|ое)\s+браслет|функциональное\s+заземление|(?:антистат|МОм|мегом|браслет).{0,48}резистор|резистор.{0,48}(?:антистат|МОм|мегом|браслет)/i,
    ],
    ["grounding", /заземлен/i],
    ["nitrogen", /\bазот/i],
    ["temperature", /температур|°\s*[СC]|град\.?\s*цельс/i],
  ];
  const found = new Set();
  for (const [key, re] of rules) {
    if (re.test(sample)) {
      found.add(key);
    }
  }
  return [...found];
}

function enforceGroundingParameterPriority(parameterTypes, text) {
  const pts = new Set(Array.isArray(parameterTypes) ? parameterTypes : []);
  const sample = String(text || "");
  const groundingSignals =
    /(?:не\s+более\s*)?4\s*ом|заземляющ(?:его|ий)\s+контур|сопротивлен(?:ие|ия)\s+заземлен/i.test(sample);
  if (groundingSignals) {
    pts.add("grounding_resistance");
    pts.delete("antistatic_resistor");
  }
  return [...pts];
}

/** Доп. тема фрагмента для штрафов при onboarding-запросах. */
function detectSecondaryTopic(text) {
  const c = String(text || "");
  if (/аварийн|действия\s+при\s+авари|экстремальн(?:ых\s+услов|\s+ситуац)/i.test(c)) {
    return "emergency";
  }
  if (
    /типов(?:ые|ых)\s+неисправност|устранени[ея]\s+неисправност|не\s+включается|не\s+работает|диагностик/i.test(
      c
    )
  ) {
    return "troubleshooting";
  }
  if (/текущий\s+ремонт|ремонт\s+шкафа|замен(?:ить|а)\s+(?:блок|уплотнитель)/i.test(c)) {
    return "repair";
  }
  if (/техническ(?:ое|ого)\s+обслуживани|\bТО\b.*интервал|ежегодно\s+техобслуживани/i.test(c)) {
    return "maintenance";
  }
  return null;
}

function buildChunkMeta(content, extra = {}) {
  const chunkKind = detectChunkKind(content);
  const parameterTypes = enforceGroundingParameterPriority(detectParameterTypes(content), content);
  const { primaryParameter, secondaryParameter } = inferPrimarySecondaryParameters(parameterTypes);
  const structuredParameters = extractStructuredParameters(content);
  const secondaryTopic = detectSecondaryTopic(content);
  const blockType = chunkKindToBlockType(chunkKind);
  const severity = detectChunkSeverity(content);
  const isNormativeSpec = chunkKind === "spec" || chunkKind === "table" ? detectNormativeSpec(content) : false;

  return {
    operatingModes: detectOperatingModes(content),
    chunkKind,
    blockType,
    ...(parameterTypes.length ? { parameterTypes } : {}),
    ...(primaryParameter ? { primaryParameter } : {}),
    ...(secondaryParameter ? { secondaryParameter } : {}),
    ...(structuredParameters.length ? { structuredParameters } : {}),
    severity,
    isNormativeSpec,
    ...(secondaryTopic ? { secondaryTopic } : {}),
    ...extra,
  };
}

/** Простое окно по символам с overlap (проза). */
function splitProseWindow(text, chunkSize, overlap) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return [];
  }
  if (normalized.length <= chunkSize) {
    return [normalized];
  }

  const chunks = [];
  let start = 0;

  while (start < normalized.length) {
    let end = Math.min(start + chunkSize, normalized.length);

    if (end < normalized.length) {
      const slice = normalized.slice(start, end);
      const lastPara = slice.lastIndexOf("\n\n");
      if (lastPara > chunkSize * 0.45) {
        end = start + lastPara;
      }
    }

    const chunk = normalized.slice(start, end).trim();
    if (chunk) {
      chunks.push(chunk);
    }

    if (end >= normalized.length) {
      break;
    }
    start = Math.max(0, end - overlap);
  }

  return chunks;
}

/**
 * Разбиение блока таблицы markdown: каждый подчанк содержит шапку (первая строка + строка |---| если есть).
 */
function splitTableBlock(tableText, maxChars) {
  const raw = String(tableText || "").trim();
  if (!raw) {
    return [];
  }

  const lines = raw.split("\n").filter((l) => l.trim());
  if (!lines.length) {
    return [];
  }

  let headerIdx = 0;
  let headerLines = [];
  if (lines[0].includes("|")) {
    headerLines.push(lines[0]);
    headerIdx = 1;
    if (
      lines.length > 1 &&
      /^\s*\|[\s\-:|]+\|\s*$/.test(lines[1])
    ) {
      headerLines.push(lines[1]);
      headerIdx = 2;
    }
  }

  const prefix = headerLines.join("\n");
  const bodyRows = lines.slice(headerIdx);

  if (!bodyRows.length) {
    return [prefix.trim()].filter(Boolean);
  }

  const chunks = [];
  let batch = [];
  let batchChars = prefix.length + (prefix ? 1 : 0);

  const flush = () => {
    if (!batch.length) {
      return;
    }
    const piece = `${prefix}\n${batch.join("\n")}`.trim();
    chunks.push(piece);
    batch = [];
    batchChars = prefix.length + (prefix ? 1 : 0);
  };

  for (const row of bodyRows) {
    if (!row.includes("|")) {
      batch.push(row);
      batchChars += row.length + 1;
      continue;
    }
    if (batchChars + row.length + 1 > maxChars && batch.length > 0) {
      flush();
    }
    batch.push(row);
    batchChars += row.length + 1;
  }
  flush();

  return chunks.length ? chunks : [raw];
}

/** Разбить текст на чередование prose | table по строкам. */
function segmentMarkdownRegions(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return [];
  }

  const lines = normalized.split("\n");
  const segments = [];
  let proseBuf = [];

  const flushProse = () => {
    const p = proseBuf.join("\n").trim();
    if (p) {
      segments.push({ type: "prose", content: p });
    }
    proseBuf = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trimStart().startsWith("|")) {
      flushProse();
      const tbl = [];
      while (i < lines.length && lines[i].trimStart().startsWith("|")) {
        tbl.push(lines[i]);
        i += 1;
      }
      i -= 1;
      segments.push({ type: "table", content: tbl.join("\n") });
    } else {
      proseBuf.push(line);
    }
  }
  flushProse();

  return segments;
}

/** Убрать вводной текст перед блоком ТТХ 1.1.2 (меньше шума в эмбеддинге). */
function trimLeadingIntroBeforeTechSpecs(prose) {
  const p = String(prose || "").trim();
  const specHead = p.search(/##\s*1\.1\.2\s+ТЕХНИЧЕСКИЕ\s+ХАРАКТЕРИСТИКИ/i);
  if (specHead >= 0) {
    return p.slice(specHead).trim();
  }
  const bullet = p.search(/-\s*1\.1\.2\.1\b/);
  if (bullet >= 0) {
    return p.slice(bullet).trim();
  }
  return p;
}

/**
 * Склеивает «проза со спецификациями → таблица габаритов → проза с IP/условиями»,
 * чтобы базовые ТТХ (RH, В/Гц, IP65, таблица моделей) не оказывались в разных чанках.
 */
function mergeSpecsAroundDimensionTable(segments) {
  const out = [];

  for (let i = 0; i < segments.length; i += 1) {
    const a = segments[i];
    const b = segments[i + 1];
    const c = segments[i + 2];

    if (
      a?.type === "prose" &&
      b?.type === "table" &&
      c?.type === "prose" &&
      /-\s*1\.1\.2\.1\b[\s\S]{0,12000}Таблица\s+1\.1/i.test(a.content) &&
      /\|\s*Модель\s*\|/i.test(b.content) &&
      /(?:Примечания|IP65|1\.1\.2\.(?:9|10|11|12)\b)/i.test(c.content)
    ) {
      const mergedText = [
        trimLeadingIntroBeforeTechSpecs(a.content),
        b.content,
        c.content,
      ].join("\n\n");
      if (mergedText.length <= 22000) {
        out.push({ type: "spec_bundle", content: mergedText });
        i += 2;
        continue;
      }
    }

    out.push(a);
  }

  return out;
}

/**
 * Полный пайплайн: регионы → чанки с metadata для ingest.
 * @returns {{ content: string, metadata: object }[]}
 */
function splitDocumentIntoChunks(text, chunkSize, overlap) {
  const size = Number.isFinite(chunkSize) && chunkSize > 200 ? Math.floor(chunkSize) : 1200;
  const ov = Number.isFinite(overlap) && overlap >= 0 ? Math.floor(overlap) : 200;

  const segments = mergeSpecsAroundDimensionTable(segmentMarkdownRegions(text));
  if (!segments.length) {
    return [];
  }

  const out = [];

  for (const seg of segments) {
    if (seg.type === "spec_bundle") {
      const meta = buildChunkMeta(seg.content, {
        specSheetMerged: true,
      });
      meta.chunkKind = "spec";
      meta.blockType = BLOCK_TYPES.SPEC_BLOCK;
      out.push({
        content: seg.content.trim(),
        metadata: meta,
      });
      continue;
    }

    if (seg.type === "table") {
      const parts = splitTableBlock(seg.content, Math.min(size * 2, 8000));
      for (const part of parts) {
        out.push({
          content: part,
          metadata: buildChunkMeta(part, { tableAtomic: true }),
        });
      }
      continue;
    }

    const proseParts = splitProseWindow(seg.content, size, ov);
    for (const part of proseParts) {
      out.push({
        content: part,
        metadata: buildChunkMeta(part, { tableAtomic: false }),
      });
    }
  }

  return out;
}

/** Legacy API: только содержимое чанков без metadata. */
function splitIntoChunks(text, chunkSize, overlap) {
  return splitDocumentIntoChunks(text, chunkSize, overlap).map((x) => x.content);
}

module.exports = {
  BLOCK_TYPES,
  splitIntoChunks,
  splitDocumentIntoChunks,
  segmentMarkdownRegions,
  mergeSpecsAroundDimensionTable,
  detectOperatingModes,
  detectChunkKind,
  chunkKindToBlockType,
  inferPrimarySecondaryParameters,
  detectParameterTypes,
  enforceGroundingParameterPriority,
  detectSecondaryTopic,
  normalizeText,
};
