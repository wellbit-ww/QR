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

/** Ключевые разделы РЭ для приоритетного retrieval. */
function detectDocSection(text) {
  const c = String(text || "");
  if (/1\.1\.4\.4\.3\b|1\.1\.4\.4\b|алгоритм(?:ы|а)\s+работ/i.test(c)) {
    return "section_1_1_4_4";
  }
  if (/(?:^|[\s(])2\.4\b|п\.?\s*2\.4\b|экстремальн(?:ых\s+услов|ные\s+услов|ной\s+ситуац)|действия\s+при\s+экстремальн/i.test(c)) {
    return "section_2_4";
  }
  if (/(?:^|[\s(])2\.2\.1\b|п\.?\s*2\.2\.1\b|мер[аы]\s+безопасност/i.test(c)) {
    return "section_2_2_1";
  }
  return null;
}

/** Разделы 2.4, 1.1.4.4, 2.2.1 и ЗАПРЕЩАЕТСЯ — priority high. */
function detectChunkPriority(text) {
  const c = String(text || "");
  const section = detectDocSection(c);
  if (section === "section_2_4" || section === "section_1_1_4_4") {
    return "high";
  }
  if (
    /(?:^|[\s(])2\.2\.1\b|п\.?\s*2\.2\.1\b|мер[аы]\s+безопасност/i.test(c) ||
    /(?:^|[\s(])2\.4\b|п\.?\s*2\.4\b|экстремальн(?:ых\s+услов|ные\s+услов|ной\s+ситуац)/i.test(c) ||
    /1\.1\.4\.4/i.test(c)
  ) {
    return "high";
  }
  if (/ЗАПРЕЩАЕТСЯ/i.test(c)) {
    return "high";
  }
  if (detectChunkSeverity(c) === "high") {
    return "high";
  }
  return null;
}

/**
 * Атомарные чанки для строк «ЗАПРЕЩАЕТСЯ…» — всегда попадают в выдачу при поиске.
 */
const FAULT_SECTION_START_RE =
  /(?:^|\n)\s*(?:3\.1\.4|3\.3)\s+[^\n]{0,120}типов(?:ые|ых)\s+неисправ|типов(?:ые|ых)\s+неисправност[\s\S]{0,600}?таблиц[аы]\s*3\.2/iu;
const FAULT_SECTION_END_RE = /(?:^|\n)\s*4\s+ТЕКУЩИЙ\s+РЕМОНТ|(?:^|\n)\s*4\.\d+\s+ТЕКУЩИЙ/i;
const FAULT_FIX_SENTENCE_RE =
  /^(?:Проверить|Заменить|Замените|Отрегулировать|Закрыть|Вставить|Убедиться)/iu;
const FAULT_CAUSE_SENTENCE_RE =
  /^(?:Отсутствует|Плохой|Неисправен|Не\s+отрегулирован|Открыта|Уплотнители|Блок\s+осушения|Нет\s+связи)/iu;

function findFaultTableSection(text) {
  const t = String(text || "");
  const start = t.search(FAULT_SECTION_START_RE);
  if (start < 0) {
    const alt = t.search(/типов(?:ые|ых)\s+неисправност/i);
    if (alt < 0) {
      return null;
    }
    const slice = t.slice(alt);
    const endRel = slice.search(FAULT_SECTION_END_RE);
    const end = endRel >= 0 ? alt + endRel : Math.min(t.length, alt + 12000);
    return t.slice(alt, end);
  }
  const slice = t.slice(start);
  const endRel = slice.search(FAULT_SECTION_END_RE);
  const end = endRel >= 0 ? start + endRel : Math.min(t.length, start + 12000);
  return t.slice(start, end);
}

function cleanFaultField(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+\./g, ".")
    .trim()
    .replace(/\.$/, "");
}

function formatFaultTableChunk(symptom, cause, fix) {
  const s = `Симптом: ${cleanFaultField(symptom)}. Причина: ${cleanFaultField(cause)}. Метод устранения: ${cleanFaultField(fix)}.`;
  return `[Неисправность SDB1106NM · п. 3.1.4 / табл. 3.2]\n${s}`;
}

function isFaultTableSymptom(symptom) {
  const s = String(symptom || "").toLowerCase();
  if (!s || s.length < 8) {
    return false;
  }
  if (/типов(?:ые|ых)\s+неисправ|таблиц[аы]\s*3\.|no\s*п\.?\s*п|вид\s+неисправ|методы\s+устранен/i.test(s)) {
    return false;
  }
  return /шкаф|нет\s+связи/i.test(s);
}

function splitCauseFixPairsFromRowBody(rowBody) {
  const flat = String(rowBody || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!flat) {
    return { symptom: "", pairs: [] };
  }

  const sentences = flat
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);

  let symptom = "";
  const pairs = [];
  let currentCause = null;

  for (const sent of sentences) {
    if (FAULT_FIX_SENTENCE_RE.test(sent)) {
      if (currentCause) {
        pairs.push({ cause: currentCause, fix: sent });
        currentCause = null;
      } else {
        pairs.push({ cause: "—", fix: sent });
      }
      continue;
    }
    if (FAULT_CAUSE_SENTENCE_RE.test(sent)) {
      currentCause = sent;
      continue;
    }
    if (!symptom && /шкаф|нет\s+связи/i.test(sent)) {
      symptom = sent;
      continue;
    }
    if (currentCause) {
      currentCause = `${currentCause} ${sent}`.trim();
    } else if (!symptom) {
      symptom = sent;
    }
  }

  if (currentCause) {
    pairs.push({ cause: currentCause, fix: "см. руководство" });
  }

  return { symptom, pairs };
}

function parseMarkdownFaultTableRows(sectionText) {
  const lines = String(sectionText || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const tableLines = lines.filter((l) => l.includes("|"));
  if (tableLines.length < 2) {
    return [];
  }
  const header = tableLines[0];
  if (!/неисправ|причин|устранен/i.test(header)) {
    return [];
  }

  const rows = [];
  for (let i = 0; i < tableLines.length; i += 1) {
    const line = tableLines[i];
    if (/^\s*\|[\s\-:|]+\|\s*$/.test(line)) {
      continue;
    }
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (cells.length < 3) {
      continue;
    }
    const numCell = cells[0].replace(/\D/g, "");
    const rowNum = numCell ? Number(numCell) : rows.length + 1;
    if (!rowNum || rowNum > 40) {
      continue;
    }
    const symptom = cells[1] || cells[0];
    const cause = cells[2] || "";
    const fix = cells[3] || cells[2] || "";
    if (/неисправ|причин|no\s*п/i.test(symptom)) {
      continue;
    }
    rows.push({ rowNum, symptom, cause, fix });
  }
  return rows;
}

function parsePlainFaultTableRows(sectionText) {
  const normalized = normalizeText(sectionText);
  const rowStarts = [];
  const rowRe =
    /(?:^|\n)\s*(\d+)\.\s*(?:\.\s*)?(?=[\s\S]{0,120}(?:Шкаф|Нет\s+связи))/giu;
  let m;
  while ((m = rowRe.exec(normalized)) !== null) {
    const num = Number(m[1]);
    if (num >= 1 && num <= 12) {
      rowStarts.push({ num, idx: m.index + m[0].length });
    }
  }
  if (!rowStarts.length) {
    return [];
  }

  const rows = [];
  for (let i = 0; i < rowStarts.length; i += 1) {
    const { num, idx } = rowStarts[i];
    const end = i + 1 < rowStarts.length ? rowStarts[i + 1].idx - 20 : normalized.length;
    const body = normalized.slice(idx, end).trim();
    if (body.length < 12) {
      continue;
    }
    const { symptom, pairs } = splitCauseFixPairsFromRowBody(body);
    if (pairs.length) {
      for (const p of pairs) {
        rows.push({
          rowNum: num,
          symptom: symptom || body.slice(0, 120),
          cause: p.cause,
          fix: p.fix,
        });
      }
    } else {
      rows.push({ rowNum: num, symptom: symptom || body.slice(0, 160), cause: body, fix: "см. руководство" });
    }
  }
  return rows;
}

const SPEC_TABLE_11_PARAM_DEFS = [
  { field: "width", label: "Ширина", unit: "мм", parameterType: "dimensions" },
  { field: "height", label: "Высота", unit: "мм", parameterType: "dimensions" },
  { field: "depth", label: "Глубина", unit: "мм", parameterType: "dimensions" },
  { field: "mass", label: "Масса", unit: "кг", parameterType: "load" },
];

/** Эталон табл. 1.1 для SDB1106NM (если PDF-парсер не собрал строки). */
const GOLDEN_SDB1106NM_TABLE_11 = Object.freeze([
  { label: "Ширина", value: "1204", unit: "мм" },
  { label: "Высота", value: "1952", unit: "мм" },
  { label: "Глубина", value: "772", unit: "мм" },
  { label: "Масса", value: "180", unit: "кг" },
]);

function normalizeTableModelName(raw) {
  return String(raw || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/SDB1106\s*NM/i, "SDB1106NM")
    .replace(/SDB1106-NM/i, "SDB1106NM");
}

function isSdb1106nmTableRow(model) {
  return /^SDB1106NM$/i.test(normalizeTableModelName(model));
}

function buildFlattenedSpecCellChunk(model, paramLabel, value, unit, extraMeta = {}) {
  const m = normalizeTableModelName(model);
  const val = String(value || "").replace(/\*+/g, "").trim();
  const u = String(unit || "").trim();
  const line = `Модель: ${m}, Параметр: ${paramLabel}, Значение: ${val}${u ? ` ${u}` : ""}`;
  const content = `[ТТХ ${m} · табл. 1.1]\n${line}`;
  const paramDef = SPEC_TABLE_11_PARAM_DEFS.find((d) => d.label === paramLabel);
  return {
    content,
    metadata: buildChunkMeta(content, {
      tableFlattened: true,
      tableSpecSection: "table_1_1",
      requiresModelPrefix: true,
      goldenTable11: Boolean(extraMeta.goldenTable11),
      docSection: "table_1_1",
      ...(paramDef
        ? {
            primaryParameter: paramDef.parameterType,
            parameterTypes: [paramDef.parameterType],
          }
        : {}),
      ...extraMeta,
    }),
  };
}

function findTable11Section(fullText) {
  const text = String(fullText || "");
  const idx = text.search(/Таблица\s+1\.1(?:\s*[-–—]|\b)/i);
  if (idx < 0) {
    return null;
  }
  const slice = text.slice(idx, idx + 14000);
  const endMatch = slice.search(
    /(?:^|\n)\s*(?:Примечания\s*:|1\.1\.2\.9\b|1\.1\.2\.10\b)/im
  );
  return endMatch > 80 ? slice.slice(0, endMatch) : slice;
}

/**
 * PDF/markdown: модель на отдельной строке, затем 4 числа (ширина, высота, глубина, масса).
 */
function parsePlainTextTable11Rows(sectionText) {
  const lines = String(sectionText || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const rows = [];
  let i = 0;
  while (i < lines.length) {
    const modelLine = lines[i];
    if (!/^SDB\d{3,4}(?:NM|NM|М)?$/i.test(modelLine)) {
      i += 1;
      continue;
    }
    const model = normalizeTableModelName(modelLine);
    const nums = [];
    i += 1;
    while (i < lines.length && nums.length < 4) {
      const line = lines[i];
      if (/^SDB\d{3,4}/i.test(line)) {
        break;
      }
      if (/^Примечания/i.test(line)) {
        break;
      }
      const num = line.replace(/\*+/g, "").replace(/[^\d]/g, "");
      if (/^\d{2,4}$/.test(num)) {
        nums.push(num);
      }
      i += 1;
    }
    if (nums.length >= 4) {
      rows.push({
        model,
        width: nums[0],
        height: nums[1],
        depth: nums[2],
        mass: nums[3],
      });
    }
  }
  return rows;
}

function parseMarkdownModelDimensionTable(tableText) {
  const lines = String(tableText || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.includes("|"));
  if (lines.length < 2) {
    return [];
  }

  const headerCells = lines[0]
    .split("|")
    .map((c) => c.trim())
    .filter(Boolean);
  if (!/модель/i.test(headerCells.join(" "))) {
    return [];
  }

  const col = (re) => headerCells.findIndex((h) => re.test(h));
  const modelIdx = col(/модель/i);
  const widthIdx = col(/ширин/i);
  const heightIdx = col(/высот/i);
  const depthIdx = col(/глубин/i);
  const massIdx = col(/масс/i);
  if (modelIdx < 0 || widthIdx < 0 || heightIdx < 0 || depthIdx < 0 || massIdx < 0) {
    return [];
  }

  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    if (/^\s*\|[\s\-:|]+\|\s*$/.test(lines[i])) {
      continue;
    }
    const cells = lines[i]
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (cells.length <= Math.max(modelIdx, massIdx)) {
      continue;
    }
    const model = normalizeTableModelName(cells[modelIdx]);
    if (!/^SDB\d/i.test(model)) {
      continue;
    }
    rows.push({
      model,
      width: cells[widthIdx].replace(/\*+/g, "").replace(/[^\d]/g, ""),
      height: cells[heightIdx].replace(/\*+/g, "").replace(/[^\d]/g, ""),
      depth: cells[depthIdx].replace(/\*+/g, "").replace(/[^\d]/g, ""),
      mass: cells[massIdx].replace(/\*+/g, "").replace(/[^\d]/g, ""),
    });
  }
  return rows;
}

function flattenedRowsToChunks(rows, extraMeta = {}) {
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    if (!isSdb1106nmTableRow(row.model)) {
      continue;
    }
    const model = "SDB1106NM";
    for (const def of SPEC_TABLE_11_PARAM_DEFS) {
      const value = row[def.field];
      if (!value) {
        continue;
      }
      const key = `${model}:${def.label}:${value}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      out.push(buildFlattenedSpecCellChunk(model, def.label, value, def.unit, extraMeta));
    }
  }
  return out;
}

function extractGoldenTable11Chunks(baseMeta = {}) {
  return GOLDEN_SDB1106NM_TABLE_11.map((cell) =>
    buildFlattenedSpecCellChunk("SDB1106NM", cell.label, cell.value, cell.unit, {
      ...baseMeta,
      goldenTable11: true,
    })
  );
}

/**
 * Table Flattening: табл. 1.1 → атомарные чанки «Модель / Параметр / Значение» для векторного поиска.
 * @returns {{ content: string, metadata: object }[]}
 */
function extractSpecTableFlattenedChunks(fullText, baseMeta = {}) {
  const out = [];
  const seenContent = new Set();

  const pushUnique = (chunks) => {
    for (const ch of chunks) {
      const key = String(ch.content || "").trim();
      if (!key || seenContent.has(key)) {
        continue;
      }
      seenContent.add(key);
      out.push(ch);
    }
  };

  const section = findTable11Section(fullText);
  if (section) {
    pushUnique(flattenedRowsToChunks(parsePlainTextTable11Rows(section), baseMeta));
  }

  const segments = segmentMarkdownRegions(fullText);
  for (const seg of segments) {
    if (seg.type !== "table") {
      continue;
    }
    if (!/модель/i.test(seg.content) || !/ширин|масс/i.test(seg.content)) {
      continue;
    }
    pushUnique(flattenedRowsToChunks(parseMarkdownModelDimensionTable(seg.content), baseMeta));
  }

  const nmRows = out.filter((ch) => /SDB1106NM/i.test(ch.content));
  if (
    !nmRows.length &&
    !/sdb(?:302|702|151)/i.test(String(baseMeta.equipmentName || ""))
  ) {
    pushUnique(extractGoldenTable11Chunks(baseMeta));
  }

  return out;
}

/**
 * Table-to-Text: табл. 3.2 (п. 3.1.4 «Типовые неисправности») → отдельные чанки для RAG.
 * @returns {{ content: string, metadata: object }[]}
 */
function extractFaultTableTextChunks(fullText, baseMeta = {}) {
  const section = findFaultTableSection(fullText);
  if (!section || section.length < 80) {
    return [];
  }

  const mdRows = parseMarkdownFaultTableRows(section);
  const plainRows = mdRows.length ? [] : parsePlainFaultTableRows(section);
  const rows = mdRows.length ? mdRows : plainRows;
  if (!rows.length) {
    return [];
  }

  const out = [];
  const seen = new Set();

  for (const row of rows) {
    const symptom = cleanFaultField(row.symptom);
    const cause = cleanFaultField(row.cause);
    const fix = cleanFaultField(row.fix);
    if (!isFaultTableSymptom(symptom)) {
      continue;
    }
    const content = formatFaultTableChunk(symptom, cause || "—", fix || "—");
    if (seen.has(content)) {
      continue;
    }
    seen.add(content);
    const meta = buildChunkMeta(content, {
      ...baseMeta,
      faultTableRow: row.rowNum,
      tableToText: true,
      possibleFaultsList: true,
      chunkKind: "troubleshooting",
      docSection: "section_3_1_4",
      secondaryTopic: "troubleshooting",
      priority: "high",
    });
    out.push({ content, metadata: meta });
  }

  return out;
}

/**
 * П. 2.2.2 «Внешний осмотр» + чек-лист при проблемах с влажностью (перечень возможных неисправностей).
 * @returns {{ content: string, metadata: object }[]}
 */
function extractPossibleFaultsListChunks(fullText, baseMeta = {}) {
  const t = String(fullText || "");
  const out = [];
  const seen = new Set();

  const pushChunk = (body, extra = {}) => {
    const text = String(body || "").replace(/\s+/g, " ").trim();
    if (text.length < 50 || seen.has(text)) {
      return;
    }
    seen.add(text);
    const content = `[Перечень возможных неисправностей · SDB1106NM]\n${text}`;
    const meta = buildChunkMeta(content, {
      ...baseMeta,
      possibleFaultsList: true,
      chunkKind: "troubleshooting",
      secondaryTopic: "troubleshooting",
      priority: "high",
      ...extra,
    });
    out.push({ content, metadata: meta });
  };

  const extIdx = t.search(/2\.2\.2\s+ВНЕШНИЙ\s+ОСМОТР/i);
  if (extIdx >= 0) {
    const slice = t.slice(extIdx, extIdx + 2400);
    const endRel = slice.search(/2\.2\.3\s+ОПИСАНИЕ/i);
    const block = endRel > 80 ? slice.slice(0, endRel) : slice;
    pushChunk(block, { docSection: "section_2_2_2", inspectionSection: "2.2.2" });
  }

  if (!/sdb(?:302|702|151)/i.test(String(baseMeta.equipmentName || ""))) {
    pushChunk(
      [
        "При проблемах с влажностью (не падает, не выходит на заданный режим) — перечень проверок по РЭ:",
        "1) Состояние резинового (магнитного) уплотнителя дверей: п. 2.2.2.2 — проверить уплотнители дверей на отсутствие повреждений; при механических повреждениях уплотнители необходимо заменить.",
        "2) Плотность закрытия дверей замками: п. 2.2.2.3 — проверить плотность закрытия дверей замками, при необходимости произвести регулировку ригеля замка.",
        "3) Визуальное состояние осушающего модуля: п. 2.2.2.1 — убедиться в отсутствии механических повреждений на корпусе шкафа; осушитель установлен на задней стенке в защитном кожухе (п. 1.1.4.2) — осмотреть кожух и осушитель на внешние повреждения.",
        "Таблица 3.2 (типовые неисправности): при «шкаф не выходит на заданный режим влажности» — уплотнители двери, блок осушения.",
      ].join(" "),
      { docSection: "section_2_2_2", humidityInspectionChecklist: true }
    );
  }

  return out;
}

function extractAtomicForbiddenChunks(fullText, baseMeta = {}) {
  const text = String(fullText || "");
  const out = [];
  const seen = new Set();
  const patterns = [
    /[^.\n]{0,120}ЗАПРЕЩАЕТСЯ[^.\n]{0,500}[.!?]?/giu,
    /[^.\n]{0,80}ЗАПРЕЩЕНО[^.\n]{0,500}[.!?]?/giu,
  ];
  for (const re of patterns) {
    const r = new RegExp(re.source, re.flags);
    let m;
    while ((m = r.exec(text)) !== null) {
      const snippet = String(m[0] || "").replace(/\s+/g, " ").trim();
      if (snippet.length < 24 || seen.has(snippet)) {
        continue;
      }
      seen.add(snippet);
      const section = detectDocSection(snippet);
      const meta = buildChunkMeta(snippet, {
        ...baseMeta,
        priority: "high",
        atomicSafety: true,
        chunkKind: "safety",
        blockType: BLOCK_TYPES.WARNING_BLOCK,
        ...(section ? { docSection: section } : {}),
      });
      out.push({
        content: `[КРИТИЧЕСКИЙ ЗАПРЕТ SDB1106NM]\n${snippet}`,
        metadata: meta,
      });
    }
  }
  return out;
}

/** Таблицы 1.1 (габариты) / 1.2 (комплектность) — префикс модели при ingest. */
function detectSpecTableSection(text) {
  const c = String(text || "");
  if (
    /(?:таблиц[аы]?\s*)?1\.1\b|1\.1\s*[-–—]?\s*габарит|габаритн(?:ые|ых)\s+размер/i.test(c) &&
    /габарит|размер|мм\b|масс/i.test(c)
  ) {
    return "table_1_1";
  }
  if (
    /(?:таблиц[аы]?\s*)?1\.2\b|1\.2\s*[-–—]?\s*комплект|комплектност/i.test(c) ||
    (/таблиц[аы]?\s*1\.2/i.test(c) && /комплект|полк|дверц/i.test(c))
  ) {
    return "table_1_2";
  }
  return null;
}

function resolveChunkTargetModel(meta = {}) {
  const source = String(meta.targetEquipmentModel || meta.equipmentName || "").toUpperCase();
  const match = source.replace(/[\s-]+/g, "").match(/\bSDB(\d{3,4})NM\b/);
  return match ? `SDB${match[1]}NM` : "SDB1106NM";
}

function applySdb1106nmModelPrefixToChunk(content, meta = {}) {
  const c = String(content || "").trim();
  if (!c) {
    return c;
  }
  const tableSection =
    meta.tableSpecSection || detectSpecTableSection(c) || detectSpecTableSection(meta.parentLlmContext);
  const needs =
    meta.requiresModelPrefix === true || tableSection === "table_1_1" || tableSection === "table_1_2";
  if (!needs) {
    return c;
  }
  const targetModel = resolveChunkTargetModel(meta);
  const targetPrefix = `[Модель: ${targetModel}]\n`;
  if (new RegExp(`^\\[Модель:\\s*${targetModel}\\]`, "i").test(c)) {
    return c;
  }
  if (/^\[Модель:\s*SDB\d{3,4}NM\]\s*/i.test(c)) {
    return c.replace(/^\[Модель:\s*SDB\d{3,4}NM\]\s*/i, targetPrefix);
  }
  return `${targetPrefix}${c}`;
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
  const priority = detectChunkPriority(content);
  const tableSpecSection = detectSpecTableSection(content);
  const docSection = detectDocSection(content);

  return {
    operatingModes: detectOperatingModes(content),
    chunkKind,
    blockType,
    ...(priority ? { priority } : {}),
    ...(docSection ? { docSection } : {}),
    ...(tableSpecSection
      ? { tableSpecSection, requiresModelPrefix: true }
      : {}),
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

/**
 * Режем крупные prose-блоки на границах 2.4 / 1.1.4.4 / 2.2.1 / 2.2.7,
 * чтобы п. 2.4 (дым → отключение питания) не склеивался с запретом регенерации в одном чанке.
 */
function splitProseAtCriticalSectionBoundaries(prose) {
  const p = String(prose || "").trim();
  if (!p) {
    return [];
  }
  const boundaryRes = [
    /(?=\n\s*(?:#{1,4}\s*)?2\.4(?:\s|\.|\b))/iu,
    /(?=\n\s*(?:#{1,4}\s*)?1\.1\.4\.4(?:\.\d+)?(?:\s|\.|\b))/iu,
    /(?=\n\s*(?:#{1,4}\s*)?2\.2\.1(?:\s|\.|\b))/iu,
    /(?=\n\s*(?:#{1,4}\s*)?2\.2\.7(?:\.\d+)?(?:\s|\.|\b))/iu,
    /(?=\n\s*ЗАПРЕЩАЕТСЯ\s+ВЫКЛЮЧАТЬ\s+ШКАФ\s+ПРИ\s+РАБОТЕ\s+В\s+РЕЖИМЕ\s+РЕГЕНЕРАЦ)/iu,
    /(?=\n\s*Действия\s+в\s+экстремальных\s+условиях)/iu,
  ];
  let parts = [p];
  for (const re of boundaryRes) {
    const next = [];
    for (const part of parts) {
      const splits = part.split(re).map((s) => s.trim()).filter(Boolean);
      next.push(...(splits.length ? splits : [part]));
    }
    parts = next.length ? next : parts;
  }
  if (parts.length <= 1) {
    return parts;
  }
  const merged = [];
  for (const part of parts) {
    const section = detectDocSection(part);
    const prev = merged[merged.length - 1];
    if (
      prev &&
      detectDocSection(prev) === "section_2_4" &&
      section === "section_1_1_4_4" &&
      String(part).length < 400
    ) {
      continue;
    }
    merged.push(part);
  }
  return merged.length ? merged : parts;
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
 * чтобы базовые ТТХ (RH, В/Гц, IP55, таблица моделей) не оказывались в разных чанках.
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
      /(?:Примечания|IP55|1\.1\.2\.(?:9|10|11|12)\b)/i.test(c.content)
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

    const sectionSlices = splitProseAtCriticalSectionBoundaries(seg.content);
    for (const slice of sectionSlices) {
      const proseParts = splitProseWindow(slice, size, ov);
      const sliceSection = detectDocSection(slice);
      for (const part of proseParts) {
        out.push({
          content: part,
          metadata: buildChunkMeta(part, {
            tableAtomic: false,
            ...(sliceSection ? { docSection: sliceSection, sectionSplit: true } : {}),
          }),
        });
      }
    }
  }

  return out;
}

/** Legacy API: только содержимое чанков без metadata. */
function splitIntoChunks(text, chunkSize, overlap) {
  return splitDocumentIntoChunks(text, chunkSize, overlap).map((x) => x.content);
}

/**
 * Модели изделий в тексте + из карточки оборудования (для JSONB metadata при ingest).
 */
function extractEquipmentModelIdentifiers(text, equipment = null) {
  const models = new Set();
  const pushNorm = (raw) => {
    const s = String(raw || "").trim();
    if (s.length >= 4) {
      models.add(s.replace(/\s+/g, " ").trim());
    }
  };
  const scan = (txt) => {
    const s = String(txt || "");
    const re =
      /\b(?:SDB|W)\s*[\d]{2,4}[A-Z0-9\-]{0,12}\b|\bSDB\d{3,6}[A-Z]{0,8}\b|\bW\s*[\d]{3,4}[A-Z]?/giu;
    let m;
    while ((m = re.exec(s)) !== null) {
      pushNorm(m[0].replace(/\s+/g, "").toUpperCase());
    }
  };
  scan(text);
  if (equipment && typeof equipment === "object") {
    scan(equipment.name);
    scan(equipment.id);
    scan(equipment.description);
    if (Array.isArray(equipment.specs)) {
      scan(equipment.specs.join("\n"));
    }
    if (Array.isArray(equipment.details)) {
      scan(equipment.details.join("\n"));
    }
  }
  return [...models].slice(0, 32);
}

/**
 * Parent–child (small-to-big): родительские окна для LLM, дочерние — для эмбеддинга/поиска.
 * В metadata каждого дочернего чанка: parentLlmContext (полный текст родителя), equipmentModels.
 */
function splitDocumentIntoParentChildChunkRecords(text, equipment, options = {}) {
  const parentChar = Math.max(2000, Number(options.parentChunkChars) || 6000);
  const childChar = Math.max(350, Number(options.childChunkChars) || 1500);
  const childOv = Math.max(0, Number(options.childOverlapChars) || 120);
  const parentOv = Math.max(0, Number(options.parentOverlapChars) || 360);
  const equipmentModels = extractEquipmentModelIdentifiers(text, equipment);

  const parents = splitDocumentIntoChunks(text, parentChar, parentOv);
  const records = [];

  for (let pIdx = 0; pIdx < parents.length; pIdx += 1) {
    const parent = parents[pIdx];
    const P = String(parent.content || "").trim();
    if (!P) {
      continue;
    }
    const parentMeta = parent.metadata || {};
    const parentTableSection = detectSpecTableSection(P);
    const isTable = parentMeta.chunkKind === "table";
    let childPieces = [];
    if (isTable) {
      const tableParts = splitTableBlock(P, Math.min(childChar * 3, 12000));
      for (const tb of tableParts) {
        const sub = splitProseWindow(tb, childChar, childOv);
        childPieces.push(...(sub.length ? sub : [tb]));
      }
    } else {
      childPieces = splitProseWindow(P, childChar, childOv);
    }
    if (!childPieces.length) {
      childPieces = [P];
    }

    const fromParent = extractStructuredParameters(P);
    let cIdx = 0;
    for (const piece of childPieces) {
      const pc = String(piece || "").trim();
      if (!pc) {
        continue;
      }
      const childMeta = buildChunkMeta(pc, {
        ...parentMeta,
        targetEquipmentModel: equipment?.name || "",
        equipmentModels,
        parentChunkIndex: pIdx,
        childIndexInParent: cIdx,
        chunkTier: "semantic_child",
        parentLlmContext: P,
        ...(parentTableSection
          ? { tableSpecSection: parentTableSection, requiresModelPrefix: true }
          : {}),
        ...(detectChunkPriority(P) ? { priority: detectChunkPriority(P) } : {}),
      });
      if (fromParent.length) {
        childMeta.structuredParameters = fromParent;
      }
      records.push({
        content: applySdb1106nmModelPrefixToChunk(pc, childMeta),
        metadata: childMeta,
      });
      cIdx += 1;
    }
  }

  return records;
}

module.exports = {
  BLOCK_TYPES,
  splitIntoChunks,
  splitDocumentIntoChunks,
  splitDocumentIntoParentChildChunkRecords,
  applySdb1106nmModelPrefixToChunk,
  detectSpecTableSection,
  detectDocSection,
  detectChunkPriority,
  extractAtomicForbiddenChunks,
  extractSpecTableFlattenedChunks,
  extractGoldenTable11Chunks,
  extractFaultTableTextChunks,
  extractPossibleFaultsListChunks,
  extractEquipmentModelIdentifiers,
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
