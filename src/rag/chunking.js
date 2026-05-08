/**
 * Стратегия чанкинга для техдоков:
 * — таблицы markdown не режутся по середине; строки группируются с сохранением заголовка таблицы;
 * — проза режется окном с overlap;
 * — в metadata: chunkKind, operatingModes для фильтрации/rerank при retrieval.
 */

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

function buildChunkMeta(content, extra = {}) {
  return {
    operatingModes: detectOperatingModes(content),
    chunkKind: detectChunkKind(content),
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
  splitIntoChunks,
  splitDocumentIntoChunks,
  segmentMarkdownRegions,
  mergeSpecsAroundDimensionTable,
  detectOperatingModes,
  detectChunkKind,
  normalizeText,
};
