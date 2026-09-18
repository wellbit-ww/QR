const { getRagConfig } = require("./config");
const { getPool } = require("./pg-client");
const { embedText, vectorToSqlLiteral } = require("./embeddings");
const { rerankChunks, computeKeywordOverlapScore } = require("./rerank");
const { resolveParameter, PARAMETER_REGISTRY, normalizeParameterText } = require("./parameter-registry");
const { extractStructuredParameters } = require("./parameter-extraction");
const { retrievalCardFilesForSdb302nmQuery } = require("./sdb302nm-rag-priority");

function chunkMatchesSectionHints(chunk, hints) {
  if (!hints || hints.length === 0) {
    return true;
  }

  const haystack = `${chunk.section || ""}\n${chunk.content || ""}`;
  return hints.some((hint) => {
    const h = String(hint).trim();
    if (!h) {
      return false;
    }

    const escaped = h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
      `(?:^|[\\s\\u00A0>–—(\\[])${escaped}(?:\\.|\\)|\\s|$|[\\u00A0–—])`,
      "imu"
    ).test(haystack);
  });
}

/**
 * Эмбеддинг только из текста запроса — без intent/modes (шум и недетерминизм в vector space).
 * Лёгкое расширение для вопросов про осушитель/абсорбент без явного имени материала в запросе.
 */
function mergeEmbeddingQuery(originalQuery, intent, config) {
  void intent;
  void config;
  const q = String(originalQuery || "").trim();
  const materialDesiccantHint =
    /абсорбент|адсорбент|химическ(?:ое|ий)\s+веществ|сорбент|наполнител|поглощен(?:ие|ия|ию)\s+влаг|влаг.*поглощ|осушител.*карман|карман.*осушител|осушительн/i;
  if (materialDesiccantHint.test(q)) {
    return `${q}\nцеолит силикагель адсорбент осушение влага карман осушителя`;
  }
  if (
    /материал/i.test(q) &&
    /корпус|шкаф|конструкц/i.test(q) &&
    !/двер|стекл|вставк|прозрач|окон|ral|покрыт|окраск/i.test(q)
  ) {
    return `${q}\nкорпус сталь сварно-сборная конструкция антистатическое порошковое покрытие 1.1.4.2`;
  }
  if (/регенерац|1\.1\.4\.4/i.test(q)) {
    return `${q}\nрежим регенерации 60 минут желтый индикатор 1.1.4.4.3`;
  }
  if (/азот|ротаметр|концентрац/i.test(q)) {
    return `${q}\nсистема подачи азота ротаметр Рпос Ррег 1.1.2.6`;
  }
  if (/двер|звук|сигнал|пищит/i.test(q)) {
    return `${q}\n1.1.4.3.4 звуковая сигнализация открытие двери`;
  }
  if (/погруз|разгруз|конвекц|50\s*мм/i.test(q)) {
    return `${q}\nп. 2.1 погрузка разгрузка конвекция расстояние от стенок`;
  }
  return q;
}

function sanitizeChunk(row) {
  return {
    sourceDoc: row.source_doc,
    section: row.section || null,
    page: row.page || null,
    chunkIndex: row.chunk_index,
    content: row.content,
    metadata: row.metadata || {},
    score: Number(row.score) || 0,
  };
}

/** Max similarity across score fields (avoids `a ?? b` treating 0 as valid when vector score is higher). */
function chunkBestSimilarity(ch) {
  if (!ch) {
    return 0;
  }
  const nums = [ch.rerankScore, ch.routedScore, ch.score, ch.vectorScore, ch.rrfScore, ch.fusionScore, ch.lexicalScore]
    .map((v) => (typeof v === "number" && Number.isFinite(v) ? v : NaN))
    .filter((v) => !Number.isNaN(v));
  return nums.length ? Math.max(...nums) : 0;
}

function chunkRowDedupeKey(sourceDoc, chunkIndex) {
  return `${String(sourceDoc || "")}\u0000${Number(chunkIndex)}`;
}

/** AND-style phrase for plainto_tsquery (legacy path). */
function buildSimpleTsQueryString(query) {
  const words = String(query || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .filter((w) => !/^(и|в|на|по|для|как|что|или|а|не|из|за|от|до|ли|бы)$/iu.test(w))
    .slice(0, 16);
  if (!words.length) {
    return null;
  }
  return words.join(" ");
}

/** OR-joined operands for to_tsquery('simple', …) — better recall on natural questions. */
function buildSimpleOrTsqueryOperands(query) {
  const words = String(query || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]+/gu, ""))
    .filter((w) => w.length >= 2)
    .filter((w) => !/^(и|в|на|по|для|как|что|или|а|не|из|за|от|до|ли|бы)$/iu.test(w))
    .slice(0, 14);
  const uniq = [...new Set(words)];
  if (!uniq.length) {
    return null;
  }
  return uniq.join(" | ");
}

/** True if hybrid lexical pass is worth attempting (even when token filter is empty). */
function shouldAttemptLexicalHybrid(query) {
  const t = String(query || "").trim();
  return t.length >= 2 && /[\p{L}\p{N}]/u.test(t);
}

function tokensForIlikeFallback(queryText) {
  const ors = buildSimpleOrTsqueryOperands(queryText);
  if (ors) {
    return ors
      .split(/\s*\|\s*/)
      .map((s) => s.trim())
      .filter((w) => w.length >= 3)
      .slice(0, 6);
  }
  const flat = buildSimpleTsQueryString(queryText);
  if (flat) {
    return flat.split(/\s+/).filter((w) => w.length >= 3).slice(0, 6);
  }
  const hits = String(queryText || "")
    .toLowerCase()
    .match(/[\p{L}\p{N}]{3,}/gu);
  return hits ? [...new Set(hits)].slice(0, 6) : [];
}

async function fetchLexicalRankedChunks(pool, equipmentId, queryText, limit) {
  const rawPhrase = String(queryText || "").trim().slice(0, 400);

  if (rawPhrase.length >= 2) {
    try {
      const rWeb = await pool.query(
        `
        SELECT
          source_doc,
          section,
          page,
          chunk_index,
          content,
          metadata,
          ts_rank_cd(content_tsv, websearch_to_tsquery('simple', $2)) AS score
        FROM knowledge_chunks
        WHERE equipment_id = $1
          AND content_tsv @@ websearch_to_tsquery('simple', $2)
        ORDER BY score DESC NULLS LAST
        LIMIT $3
      `,
        [equipmentId, rawPhrase, limit]
      );
      if (rWeb.rows.length) {
        return rWeb.rows;
      }
    } catch (_e) {
      /* websearch_to_tsquery unsupported or bad input — fall through */
    }
  }

  const orOperands = buildSimpleOrTsqueryOperands(queryText);
  if (orOperands) {
    try {
      const rOr = await pool.query(
        `
        SELECT
          source_doc,
          section,
          page,
          chunk_index,
          content,
          metadata,
          ts_rank_cd(content_tsv, to_tsquery('simple', $2)) AS score
        FROM knowledge_chunks
        WHERE equipment_id = $1
          AND content_tsv @@ to_tsquery('simple', $2)
        ORDER BY score DESC NULLS LAST
        LIMIT $3
      `,
        [equipmentId, orOperands, limit]
      );
      if (rOr.rows.length) {
        return rOr.rows;
      }
    } catch (_e) {
      /* ignore */
    }
  }

  const tsQ = buildSimpleTsQueryString(queryText);
  if (tsQ) {
    try {
      const r = await pool.query(
        `
        SELECT
          source_doc,
          section,
          page,
          chunk_index,
          content,
          metadata,
          ts_rank_cd(
            content_tsv,
            plainto_tsquery('simple', $2)
          ) AS score
        FROM knowledge_chunks
        WHERE equipment_id = $1
          AND content_tsv @@ plainto_tsquery('simple', $2)
        ORDER BY score DESC NULLS LAST
        LIMIT $3
      `,
        [equipmentId, tsQ, limit]
      );
      if (r.rows.length) {
        return r.rows;
      }
    } catch (_e) {
      /* ignore fts errors */
    }
  }
  const uniq = tokensForIlikeFallback(queryText);
  if (!uniq.length) {
    return [];
  }
  const patterns = uniq.map((w) => `%${w.replace(/([%_\\])/g, "\\$1")}%`);
  const cond = patterns.map((_, i) => `content ILIKE $${i + 3} ESCAPE '\\'`).join(" OR ");
  const r2 = await pool.query(
    `
      SELECT source_doc, section, page, chunk_index, content, metadata, 0.02::float AS score
      FROM knowledge_chunks
      WHERE equipment_id = $1 AND (${cond})
      LIMIT $2
    `,
    [equipmentId, limit, ...patterns]
  );
  return r2.rows;
}

/** Запросы с тех. аббревиатурами — усилить вклад FTS в RRF. */
function queryHasTechnicalAbbreviations(query) {
  return /(?:^|[\s(])(?:ГОСТ|GOST|IP\s*\d|IP\d|RH%?[тп]?|RH\b|Вт|кВт|Вт·|Бар|бар|кПа|SDB\d)/iu.test(
    String(query || "")
  );
}

function reciprocalRankFusionChunks(vectorRows, lexicalRows, sanitizeFn, k = 60, opts = {}) {
  const lexicalMultiplier = Math.max(1, Number(opts.lexicalRankMultiplier) || 1);
  const map = new Map();
  const bump = (rows, fromVector) => {
    if (!Array.isArray(rows)) {
      return;
    }
    rows.forEach((row, idx) => {
      const ch = sanitizeFn(row);
      const key = chunkRowDedupeKey(ch.sourceDoc, ch.chunkIndex);
      const rankWeight = fromVector ? 1 : lexicalMultiplier;
      const add = (rankWeight / (k + idx + 1));
      const cur = map.get(key);
      if (!cur) {
        map.set(key, {
          chunk: {
            ...ch,
            _vectorHitRank: fromVector ? idx + 1 : null,
            _lexicalHitRank: !fromVector ? idx + 1 : null,
          },
          rrf: add,
        });
      } else {
        cur.rrf += add;
        if (fromVector) {
          cur.chunk._vectorHitRank = idx + 1;
          cur.chunk.score = Math.max(Number(cur.chunk.score) || 0, Number(ch.score) || 0);
        } else {
          cur.chunk._lexicalHitRank = idx + 1;
        }
      }
    });
  };
  bump(vectorRows, true);
  bump(lexicalRows, false);
  return [...map.values()]
    .sort((a, b) => b.rrf - a.rrf)
    .map(({ chunk, rrf }) => ({
      ...chunk,
      rrfScore: Number(rrf.toFixed(6)),
      score: Math.min(0.995, Math.max(Number(chunk.score) || 0, rrf * 6)),
      hybridFused: true,
    }));
}

function getChunkBodyForPrompt(chunk) {
  const m = (chunk && chunk.metadata) || {};
  const parent = m.parentLlmContext;
  if (typeof parent === "string" && parent.trim().length > String(chunk.content || "").trim().length + 80) {
    return parent.trim();
  }
  return String((chunk && chunk.content) || "").trim();
}

function attachKeywordScores(chunks, query) {
  const q = String(query || "").trim();
  return chunks.map((ch) => ({
    ...ch,
    keywordScore: computeKeywordOverlapScore(q, ch),
  }));
}

function hasIpSignal(text) {
  return /\bIP\s?\d{2}\b/i.test(String(text || ""));
}

function hasGroundingContourSignal(text) {
  return /(?:не\s+более\s*)?4\s*ом|заземляющ(?:его|ий)\s+контур|сопротивлен(?:ие|ия)\s+заземлен/i.test(
    String(text || "")
  );
}

function normalizeChunkText(chunk) {
  return `${chunk?.content || ""}\n${chunk?.section || ""}`.toLowerCase();
}

function isOnboardingSignalChunk(chunk) {
  const t = normalizeChunkText(chunk);
  return /onboarding|startup|first[_\s-]?launch|power[_\s-]?on|preparation|setup|перв(?:ый|ого)\s+запуск|включ(?:ить|ение)|подготовк|подключ|тумблер|питани|вилка|кабель|индикатор/.test(
    t
  );
}

function isOnboardingNoiseChunk(chunk) {
  const t = normalizeChunkText(chunk);
  return /гаранти|услови[яе]\s+хранен|хранени|транспорт|коррози|климатическ|атмосферн|окружающ|влажност[ьи]\s+окружающ|диапазон\s+влажност|нагрузк[аи]\s+полк|мощност|кпа|мм\s*рт/.test(
    t
  );
}

function isHumidityTroubleshootingChunk(chunk) {
  const t = normalizeChunkText(chunk);
  const m = chunk?.metadata || {};
  if (m.humidityInspectionChecklist === true || m.possibleFaultsList === true) {
    return true;
  }
  return /осушител|осушени|drying|rh|влажност|уплотнит|регенерац|desiccant|влагопоглот|2\.2\.2\.[123]|перечень\s+возможных|симптом:/i.test(
    t
  );
}

function isPowerTroubleshootingChunk(chunk) {
  const t = normalizeChunkText(chunk);
  return /предохран|кабель|no power|питани[ея]|напряжен|fuse|power|розетк|220\s*в/i.test(t);
}

function isSafetyEmergencyQuery(query) {
  return /дым|гарь|задымлен|вспышк|нельзя|опасно/i.test(String(query || ""));
}

function isHighPrioritySafetyChunk(chunk) {
  const m = (chunk && chunk.metadata) || {};
  if (m.priority === "high") {
    return true;
  }
  const hay = `${chunk?.content || ""}\n${chunk?.section || ""}\n${m.parentLlmContext || ""}`;
  return /(?:^|[\s(])2\.2\.1\b|п\.?\s*2\.2\.1\b|мер[аы]\s+безопасност|(?:^|[\s(])2\.4\b|п\.?\s*2\.4\b|экстремальн(?:ых\s+услов|ные\s+услов)/i.test(
    hay
  );
}

async function fetchSection24EmergencyChunks(pool, equipmentId, cap = 6) {
  const lim = Math.max(1, Math.min(10, Math.floor(cap)));
  try {
    const r = await pool.query(
      `
        SELECT source_doc, section, page, chunk_index, content, metadata, 0.92::float AS score
        FROM knowledge_chunks
        WHERE equipment_id = $1
          AND (
            content ~* '(^|[^0-9])2\\.4([^0-9]|$)|экстремальн|действия\\s+при\\s+экстремальн'
          )
        ORDER BY
          CASE WHEN content ~* '2\\.4' THEN 0 ELSE 1 END,
          chunk_index
        LIMIT $2
      `,
      [equipmentId, lim]
    );
    return r.rows.map((row) => ({
      ...sanitizeChunk(row),
      safetyPriorityInjected: true,
      emergencySection24: true,
      score: Math.max(Number(row.score) || 0, 0.92),
    }));
  } catch (_e) {
    return [];
  }
}

async function fetchRegenerationForbiddenChunks(pool, equipmentId, cap = 4) {
  const lim = Math.max(1, Math.min(8, Math.floor(cap)));
  try {
    const r = await pool.query(
      `
        SELECT source_doc, section, page, chunk_index, content, metadata, 0.95::float AS score
        FROM knowledge_chunks
        WHERE equipment_id = $1
          AND (
            COALESCE(metadata->>'atomicSafety', '') = 'true'
            OR content ~* 'ЗАПРЕЩАЕТСЯ[^\\n]{0,200}регенерац'
            OR content ~* 'регенерац[^\\n]{0,200}ЗАПРЕЩАЕТСЯ'
            OR content ~* '1\\.1\\.4\\.4'
          )
        ORDER BY
          CASE WHEN content ~* 'ЗАПРЕЩАЕТСЯ' THEN 0 ELSE 1 END,
          chunk_index
        LIMIT $2
      `,
      [equipmentId, lim]
    );
    return r.rows.map((row) => ({
      ...sanitizeChunk(row),
      safetyPriorityInjected: true,
      regenerationForbidden: true,
      score: Math.max(Number(row.score) || 0, 0.95),
    }));
  } catch (_e) {
    return [];
  }
}

async function fetchIndicatorSectionChunks(pool, equipmentId, cap = 4) {
  const lim = Math.max(1, Math.min(6, Math.floor(cap)));
  try {
    const r = await pool.query(
      `
        SELECT source_doc, section, page, chunk_index, content, metadata, 0.91::float AS score
        FROM knowledge_chunks
        WHERE equipment_id = $1
          AND (
            content ~* '1\\.1\\.4\\.3\\.3|световых\\s+индикатор|режим\\s*[«"]?Хранен|режим\\s*[«"]?Осушен|режим\\s*[«"]?Регенерац'
            OR content ~* 'желтый\\s+световой|зеленый\\s+световой\\s+сигнал\\s+и\\s+мигающий'
          )
        ORDER BY chunk_index
        LIMIT $2
      `,
      [equipmentId, lim]
    );
    return r.rows.map((row) => ({
      ...sanitizeChunk(row),
      indicatorSectionInjected: true,
      score: Math.max(Number(row.score) || 0, 0.91),
    }));
  } catch (_e) {
    return [];
  }
}

async function fetchSdb302nmRetrievalCardChunks(pool, equipmentId, query, cap = 3) {
  if (equipmentId !== "w-700") {
    return [];
  }
  const take = Math.max(1, Math.min(4, Math.floor(cap)));
  try {
    const r = await pool.query(
      `
        SELECT source_doc, section, page, chunk_index, content, metadata, 0.89::float AS score
        FROM knowledge_chunks
        WHERE equipment_id = $1
          AND (
            COALESCE(metadata->>'retrievalCard', '') = 'true'
            OR source_doc ILIKE '%retrieval-cards%'
          )
        ORDER BY source_doc, chunk_index
        LIMIT 40
      `,
      [equipmentId]
    );
    const wanted = retrievalCardFilesForSdb302nmQuery(query);
    const scored = r.rows.map((row) => {
      const chunk = sanitizeChunk(row);
      const overlap = computeKeywordOverlapScore(query, chunk);
      const pinned = wanted.some((file) =>
        String(row.source_doc || "")
          .replace(/\\/g, "/")
          .toLowerCase()
          .endsWith(`/${String(file).toLowerCase()}`)
      );
      return { chunk, overlap, pinned };
    });
    const pinnedRows = scored.filter((item) => item.pinned);
    const picked = (pinnedRows.length ? pinnedRows : scored.filter((item) => item.overlap >= 0.18))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.overlap - a.overlap)
      .slice(0, take);
    return picked.map(({ chunk, overlap, pinned }) => ({
      ...chunk,
      sdb302RetrievalCardInjected: true,
      score: Math.max(Number(chunk.score) || 0, pinned ? 0.93 : 0.84 + Math.min(0.1, overlap * 0.15)),
    }));
  } catch (_e) {
    return [];
  }
}

async function fetchP1GoldenFactsChunks(pool, equipmentId, cap = 10) {
  const lim = Math.max(1, Math.min(16, Math.floor(cap)));
  try {
    const r = await pool.query(
      `
        SELECT source_doc, section, page, chunk_index, content, metadata, 0.91::float AS score
        FROM knowledge_chunks
        WHERE equipment_id = $1
          AND (
            source_doc ILIKE '%golden-facts-p1%'
            OR content ~* 'Золотые факты P1'
            OR content ~* 'Модель:\\s*SDB1106NM,\\s*Параметр:'
          )
        ORDER BY chunk_index
        LIMIT $2
      `,
      [equipmentId, lim]
    );
    return r.rows.map((row) => ({
      ...sanitizeChunk(row),
      p1GoldenFactsInjected: true,
      score: Math.max(Number(row.score) || 0, 0.91),
    }));
  } catch (_e) {
    return [];
  }
}

async function fetchTable11FlattenedChunks(pool, equipmentId, cap = 8) {
  const lim = Math.max(1, Math.min(12, Math.floor(cap)));
  try {
    const r = await pool.query(
      `
        SELECT source_doc, section, page, chunk_index, content, metadata, 0.93::float AS score
        FROM knowledge_chunks
        WHERE equipment_id = $1
          AND (
            metadata @> '{"tableFlattened": true}'::jsonb
            OR content ~* 'Модель:\\s*SDB1106NM,\\s*Параметр:'
            OR content ~* 'табл\\.\\s*1\\.1'
          )
        ORDER BY chunk_index
        LIMIT $2
      `,
      [equipmentId, lim]
    );
    return r.rows.map((row) => ({
      ...sanitizeChunk(row),
      table11FlattenInjected: true,
      score: Math.max(Number(row.score) || 0, 0.93),
    }));
  } catch (_e) {
    return [];
  }
}

async function fetchMaintenanceSectionChunks(pool, equipmentId, cap = 6) {
  const lim = Math.max(1, Math.min(10, Math.floor(cap)));
  try {
    const r = await pool.query(
      `
        SELECT source_doc, section, page, chunk_index, content, metadata, 0.9::float AS score
        FROM knowledge_chunks
        WHERE equipment_id = $1
          AND (
            content ~* '(^|[^0-9])1\\.1\\.2([^0-9]|$)|технич(?:еск)?(?:ие|\\.)?\\s+характеристик'
            OR content ~* '(^|[^0-9])3\\.1([^0-9]|$)|техническ(?:ое|ого)\\s+обслуживани'
            OR content ~* 'график\\s+техническ|замен(?:а|ить)\\s+блока\\s+осуш|36\\s+месяц'
            OR content ~* 'запасн(?:ые|ых)\\s+част|ресурс\\s+осушител'
          )
        ORDER BY
          CASE WHEN content ~* '3\\.1' THEN 0
               WHEN content ~* '1\\.1\\.2' THEN 1
               ELSE 2 END,
          chunk_index
        LIMIT $2
      `,
      [equipmentId, lim]
    );
    return r.rows.map((row) => ({
      ...sanitizeChunk(row),
      maintenanceSectionInjected: true,
      score: Math.max(Number(row.score) || 0, 0.9),
    }));
  } catch (_e) {
    return [];
  }
}

async function fetchPossibleFaultsListChunks(pool, equipmentId, cap = 8) {
  const lim = Math.max(1, Math.min(12, Math.floor(cap)));
  try {
    const r = await pool.query(
      `
        SELECT source_doc, section, page, chunk_index, content, metadata, 0.93::float AS score
        FROM knowledge_chunks
        WHERE equipment_id = $1
          AND (
            COALESCE(metadata->>'possibleFaultsList', '') = 'true'
            OR COALESCE(metadata->>'tableToText', '') = 'true'
            OR COALESCE(metadata->>'humidityInspectionChecklist', '') = 'true'
            OR content ~* 'Перечень возможных|типов(?:ые|ых)\\s+неисправ|Симптом:\\s*'
            OR content ~* '2\\.2\\.2\\.(?:1|2|3)|внешний\\s+осмотр'
            OR content ~* 'уплотнител.{0,40}двер|плотность.{0,40}закрыт.{0,40}замк'
            OR content ~* 'кожух.{0,40}осушител|осушающ'
          )
        ORDER BY
          CASE WHEN COALESCE(metadata->>'humidityInspectionChecklist', '') = 'true' THEN 0
               WHEN COALESCE(metadata->>'tableToText', '') = 'true' THEN 1
               WHEN content ~* '2\\.2\\.2\\.2' THEN 2
               ELSE 3 END,
          chunk_index
        LIMIT $2
      `,
      [equipmentId, lim]
    );
    return r.rows.map((row) => ({
      ...sanitizeChunk(row),
      possibleFaultsInjected: true,
      score: Math.max(Number(row.score) || 0, 0.93),
    }));
  } catch (_e) {
    return [];
  }
}

async function fetchHumidityStepChunks(pool, equipmentId, cap = 4) {
  const lim = Math.max(1, Math.min(6, Math.floor(cap)));
  try {
    const r = await pool.query(
      `
        SELECT source_doc, section, page, chunk_index, content, metadata, 0.86::float AS score
        FROM knowledge_chunks
        WHERE equipment_id = $1
          AND (
            content ~* '0[,.]1\\s*%\\s*RH|0[,.]1\\s*RH%|шаг[^\\n]{0,40}влажност|дискретност[^\\n]{0,30}влажност'
          )
        LIMIT $2
      `,
      [equipmentId, lim]
    );
    return r.rows.map((row) => ({
      ...sanitizeChunk(row),
      humidityStepInjected: true,
      score: Math.max(Number(row.score) || 0, 0.86),
    }));
  } catch (_e) {
    return [];
  }
}

async function fetchHighPrioritySafetyChunks(pool, equipmentId, cap = 6) {
  const lim = Math.max(1, Math.min(12, Math.floor(cap)));
  try {
    const r = await pool.query(
      `
        SELECT source_doc, section, page, chunk_index, content, metadata, 0.88::float AS score
        FROM knowledge_chunks
        WHERE equipment_id = $1
          AND (
            COALESCE(metadata->>'priority', '') = 'high'
            OR content ~* '(2\\.2\\.1|меры\\s+безопасност|2\\.4|экстремальн|ЗАПРЕЩАЕТСЯ|1\\.1\\.4\\.4)'
          )
        ORDER BY chunk_index
        LIMIT $2
      `,
      [equipmentId, lim]
    );
    return r.rows.map((row) => ({
      ...sanitizeChunk(row),
      safetyPriorityInjected: true,
      score: Math.max(Number(row.score) || 0, 0.88),
    }));
  } catch (_e) {
    return [];
  }
}

function mergeSafetyPriorityChunks(ranked, safetyRows, limit) {
  if (!safetyRows.length) {
    return ranked;
  }
  const seen = new Set(ranked.map((ch) => chunkRowDedupeKey(ch.sourceDoc, ch.chunkIndex)));
  const injected = [];
  for (const ch of safetyRows) {
    const key = chunkRowDedupeKey(ch.sourceDoc, ch.chunkIndex);
    if (!seen.has(key)) {
      seen.add(key);
      injected.push(ch);
    }
  }
  const merged = [...injected, ...ranked];
  return merged.slice(0, Math.max(limit, injected.length));
}

function applyOversizedChunkPenalty(chunks, intent) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return chunks;
  }
  const scope = intent?.queryScope;
  if (scope !== "narrow" && scope !== "medium") {
    return chunks;
  }
  const maxChunkCharactersForFact = 2800;
  const maxChunkCharactersForOnboarding = 3200;
  const threshold =
    intent?.intentType === "GETTING_STARTED_QUERY"
      ? maxChunkCharactersForOnboarding
      : maxChunkCharactersForFact;
  return chunks.map((ch) => {
    const len = Math.max(
      String(ch.content || "").length,
      String(ch.metadata?.parentLlmContext || "").length
    );
    if (len <= threshold) {
      return { ...ch, oversizedPenaltyScore: 0 };
    }
    const ratio = (len - threshold) / threshold;
    const penalty = Math.min(0.28, Math.max(0.05, ratio * 0.18));
    return { ...ch, oversizedPenaltyScore: penalty };
  });
}

function gatherStructuredEntries(chunk, parameterKey) {
  const metadataEntries = Array.isArray(chunk?.metadata?.structuredParameters)
    ? chunk.metadata.structuredParameters
    : [];
  const extractedEntries = extractStructuredParameters(`${chunk?.section || ""}\n${chunk?.content || ""}`);
  const entries = extractedEntries.some((e) => e?.parameterKey === parameterKey)
    ? extractedEntries
    : metadataEntries;
  return entries
    .filter((e) => e?.parameterKey === parameterKey)
    .map((e) => ({
      ...e,
      confidence: typeof e.confidence === "number" ? e.confidence : 0.72,
    }));
}

function scoreStructuredLexical(query, chunk, parameterKey, entry) {
  const q = normalizeParameterText(query);
  const hay = normalizeParameterText(`${chunk.content || ""} ${chunk.section || ""}`);
  const registry = PARAMETER_REGISTRY[parameterKey] || { aliases: [], expectedUnits: [] };

  let score = 0;
  for (const alias of registry.aliases || []) {
    const a = normalizeParameterText(alias);
    if (a && q.includes(a) && hay.includes(a)) {
      score += 0.18;
    }
  }

  const value = normalizeParameterText(entry?.value || "");
  const unit = normalizeParameterText(entry?.unit || "");
  if (value && hay.includes(value)) {
    score += 0.22;
  }
  if (unit && hay.includes(unit)) {
    score += 0.16;
  }
  for (const u of registry.expectedUnits || []) {
    if (hay.includes(normalizeParameterText(u))) {
      score += 0.08;
    }
  }

  if (/\bip\d{2}\b/.test(q) && /\bip\s?\d{2}\b/.test(hay)) {
    score += 0.18;
  }
  if (/rh%|rh/.test(q) && /rh%|rh/.test(hay)) {
    score += 0.12;
  }
  if (/гост/.test(q) && /гост/.test(hay)) {
    score += 0.1;
  }
  if (/\b220\s*в\b/.test(q) && /\b220\s*в\b/.test(hay)) {
    score += 0.12;
  }
  if (/\b50\s*гц\b/.test(q) && /\b50\s*гц\b/.test(hay)) {
    score += 0.12;
  }
  if (/\b4\s*ом\b/.test(q) && /\b4\s*ом\b/.test(hay)) {
    score += 0.16;
  }
  if (/усиленн/.test(q)) {
    score += /усиленн/.test(hay) ? 0.25 : -0.12;
  }
  if (/выдвижн/.test(q)) {
    score += /выдвижн/.test(hay) ? 0.25 : -0.12;
  }
  if (/стандартн/.test(q)) {
    score += /стандартн/.test(hay) ? 0.25 : -0.08;
  }
  if (/максимальн|макс\b|не\s+более|до\s+(?:плюс\s*)?\d/.test(q)) {
    score += entry?.qualifier === "max" ? 0.22 : 0;
  }
  if (/температур|окружающ|сред/.test(q)) {
    score += /температур|окружающ|сред/.test(hay) ? 0.18 : -0.06;
  }

  return Math.max(0, Math.min(1, Number(score.toFixed(4))));
}

async function retrieveStructuredParameterCandidates({
  pool,
  equipmentId,
  query,
  parameterKey,
  limit,
}) {
  const reg = PARAMETER_REGISTRY[parameterKey] || { aliases: [] };
  const aliases = [...new Set([parameterKey, ...(reg.aliases || [])])].filter(Boolean);
  const likePatterns = aliases.slice(0, 20).map((a) => `%${String(a).replace(/\s+/g, "%")}%`);
  const fetchLimit = Math.min(Math.max(limit * 10, 120), 300);

  const result = await pool.query(
    `
      SELECT
        source_doc,
        section,
        page,
        chunk_index,
        content,
        metadata,
        0::float AS score
      FROM knowledge_chunks
      WHERE equipment_id = $1
        AND (
          EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(metadata->'structuredParameters', '[]'::jsonb)) e
            WHERE e->>'parameterKey' = $2
          )
          OR content ILIKE ANY($3::text[])
        )
      LIMIT $4
    `,
    [equipmentId, parameterKey, likePatterns.length ? likePatterns : ["%%%"], fetchLimit]
  );

  const scoreRows = (rows) => {
    const scored = [];
    for (const row of rows) {
      const chunk = sanitizeChunk(row);
      const entries = gatherStructuredEntries(chunk, parameterKey);
      if (entries.length === 0) {
        continue;
      }
      let best = null;
      for (const entry of entries) {
        const lexicalScore = scoreStructuredLexical(query, chunk, parameterKey, entry);
        const parameterBoost = Math.min(0.35, 0.12 + (Number(entry.confidence) || 0) * 0.25);
        const semanticScore = Number(chunk.score) || 0;
        const fusionScore = semanticScore * 0.2 + lexicalScore * 0.6 + parameterBoost;
        const cand = {
          ...chunk,
          lexicalScore,
          fusionScore: Number(fusionScore.toFixed(4)),
          parameterEntry: entry,
        };
        if (!best || cand.fusionScore > best.fusionScore) {
          best = cand;
        }
      }
      if (best) {
        scored.push(best);
      }
    }
    scored.sort((a, b) => b.fusionScore - a.fusionScore);
    return scored;
  };

  let scored = scoreRows(result.rows);
  if (scored.length === 0) {
    const broad = await pool.query(
      `
        SELECT
          source_doc,
          section,
          page,
          chunk_index,
          content,
          metadata,
          0::float AS score
        FROM knowledge_chunks
        WHERE equipment_id = $1
        LIMIT $2
      `,
      [equipmentId, 1200]
    );
    scored = scoreRows(broad.rows);
  }

  const topScoped = scored.slice(0, limit);
  return topScoped;
}

/**
 * Жёсткий recall для SINGLE_FIELD: только spec/table и согласованные parameterTypes.
 */
function filterChunksForSingleFieldIntent(chunks, intent) {
  const diagnostics = {
    retrievalFilterReason: "none",
    rejectedByParameterMismatch: 0,
    rejectedByBlockType: 0,
  };
  if (!intent || intent.intentType !== "SINGLE_FIELD_QUERY" || !intent.focusParameter) {
    return { chunks, diagnostics };
  }
  const fp = intent.focusParameter;
  const filtered = chunks.filter((ch) => {
    const kind = ch.metadata?.chunkKind;
    if (kind === "safety") {
      diagnostics.rejectedByBlockType += 1;
      return false;
    }
    const groundingRelaxed = fp === "grounding_resistance";
    if (!groundingRelaxed && kind === "procedure") {
      diagnostics.rejectedByBlockType += 1;
      return false;
    }
    if (!groundingRelaxed && kind !== "spec" && kind !== "table") {
      diagnostics.rejectedByBlockType += 1;
      return false;
    }
    const pts = ch.metadata?.parameterTypes || [];
    const prim = ch.metadata?.primaryParameter;
    if (fp === "protection" && hasIpSignal(`${ch.content || ""} ${ch.section || ""}`)) {
      return true;
    }
    if (
      fp === "grounding_resistance" &&
      pts.includes("antistatic_resistor") &&
      !pts.includes("grounding_resistance") &&
      !hasGroundingContourSignal(`${ch.content || ""} ${ch.section || ""}`)
    ) {
      diagnostics.rejectedByParameterMismatch += 1;
      return false;
    }
    if (!groundingRelaxed && pts.length && !pts.includes(fp) && prim !== fp) {
      diagnostics.rejectedByParameterMismatch += 1;
      return false;
    }
    return true;
  });
  diagnostics.retrievalFilterReason = `single_field_${fp}`;
  if (fp === "grounding_resistance" && filtered.length < 2) {
    diagnostics.retrievalFilterReason = "single_field_grounding_resistance_soft_fallback";
    return {
      chunks: chunks.slice(0, Math.min(chunks.length, 30)),
      diagnostics,
    };
  }
  if (!filtered.length) {
    diagnostics.retrievalFilterReason = `single_field_${fp}_fallback_top15`;
    return {
      chunks: chunks.slice(0, Math.min(chunks.length, 15)),
      diagnostics,
    };
  }
  return { chunks: filtered, diagnostics };
}

function filterChunksForGettingStartedIntent(chunks, intent) {
  const diagnostics = {
    retrievalFilterReason: "none",
    rejectedByParameterMismatch: 0,
    rejectedByBlockType: 0,
    retrievalMode: null,
  };
  if (!intent || intent.intentType !== "GETTING_STARTED_QUERY") {
    return { chunks, diagnostics };
  }
  diagnostics.retrievalMode = intent.retrievalMode || "onboarding_focused";
  diagnostics.retrievalFilterReason = "onboarding_focused";

  const prepared = chunks.filter((ch) => {
    const blockType = String(ch.metadata?.blockType || "");
    if (blockType === "WARNING_BLOCK") {
      diagnostics.rejectedByBlockType += 1;
      return false;
    }
    if (isOnboardingNoiseChunk(ch) && !isOnboardingSignalChunk(ch)) {
      diagnostics.rejectedByBlockType += 1;
      return false;
    }
    return true;
  });

  const onboardingRelated = prepared.filter((ch) => {
    const blockType = String(ch.metadata?.blockType || "");
    const kind = String(ch.metadata?.chunkKind || "");
    const procedural = blockType === "PROCEDURE_BLOCK" || kind === "procedure";
    return procedural || isOnboardingSignalChunk(ch);
  });

  const proceduralOnboarding = onboardingRelated.filter((ch) => {
    const blockType = String(ch.metadata?.blockType || "");
    const kind = String(ch.metadata?.chunkKind || "");
    return (blockType === "PROCEDURE_BLOCK" || kind === "procedure") && isOnboardingSignalChunk(ch);
  });

  if (proceduralOnboarding.length > 0) {
    diagnostics.retrievalFilterReason = "onboarding_focused_onboarding_only";
    return { chunks: onboardingRelated, diagnostics };
  }

  if (prepared.length < 2) {
    diagnostics.retrievalFilterReason = "onboarding_focused_fallback_unfiltered";
    return { chunks, diagnostics };
  }
  diagnostics.retrievalFilterReason = "onboarding_focused_prefer_related";
  return { chunks: prepared, diagnostics };
}

function filterTroubleshootingHumidity(chunks, intent) {
  const diagnostics = {
    retrievalFilterReason: "none",
    rejectedByParameterMismatch: 0,
    rejectedByBlockType: 0,
  };
  if (intent?.intentType !== "TROUBLESHOOTING_QUERY" || intent?.symptomDomain !== "humidity") {
    return { chunks, diagnostics };
  }
  diagnostics.retrievalFilterReason = "troubleshooting_humidity";
  const humidityChunks = chunks.filter((ch) => isHumidityTroubleshootingChunk(ch));
  if (humidityChunks.length > 0) {
    const prioritized = humidityChunks.concat(
      chunks.filter((ch) => !isPowerTroubleshootingChunk(ch) && !isHumidityTroubleshootingChunk(ch))
    );
    diagnostics.rejectedByBlockType = chunks.length - prioritized.length;
    return { chunks: prioritized, diagnostics };
  }
  return { chunks, diagnostics };
}

/**
 * @param {object} params
 * @param {string} params.equipmentId
 * @param {string} params.query
 * @param {number} [params.topK]
 * @param {string[]} [params.sectionHints]
 * @param {object|null} [params.intent] — classifyQueryIntent(...)
 * @param {object|null} [params.retrievalOverrides] — переопределения конфигурации для отладки
 */
async function retrieveEquipmentContext({
  equipmentId,
  query,
  topK,
  sectionHints,
  intent,
  retrievalOverrides,
}) {
  const baseConfig = getRagConfig();
  const config =
    retrievalOverrides && typeof retrievalOverrides === "object"
      ? { ...baseConfig, ...retrievalOverrides }
      : baseConfig;
  const defaultTopK = Math.max(
    Math.floor(config.retrievalTopK || 15),
    Math.floor(config.technicalRetrievalTopK || 15)
  );
  const limit = Number.isFinite(topK) && topK > 0 ? Math.floor(topK) : defaultTopK;
  const pool = getPool(config.postgresUrl);

  if (!pool) {
    return {
      chunks: [],
      topScore: 0,
      retrievalLatencyMs: 0,
      selectedTopK: limit,
      sectionHints: [],
      sectionHintFiltered: false,
      rerankApplied: false,
      fetchLimit: 0,
      telemetryCandidates: [],
      reason: "RAG disabled: POSTGRES_URL is not set.",
    };
  }

  const startedAt = Date.now();
  const originalQuery = String(query || "").trim();
  const isSingleField = intent?.intentType === "SINGLE_FIELD_QUERY";
  const resolvedParameter = isSingleField
    ? resolveParameter(originalQuery, intent?.focusParameter || null)
    : null;

  if (resolvedParameter && isSingleField) {
    const structured = await retrieveStructuredParameterCandidates({
      pool,
      equipmentId,
      query: originalQuery,
      parameterKey: resolvedParameter.parameterKey,
      limit,
    });

    if (structured.length > 0) {
      const telemetryCandidates = structured.slice(0, Math.min(40, structured.length)).map((ch) => ({
        sourceDoc: ch.sourceDoc,
        section: ch.section,
        chunkIndex: ch.chunkIndex,
        chunkKind: ch.metadata?.chunkKind ?? null,
        blockType: ch.metadata?.blockType ?? null,
        primaryParameter: ch.metadata?.primaryParameter ?? null,
        rerankScore: chunkBestSimilarity(ch),
        lexicalScore: ch.lexicalScore ?? null,
        fusionScore: ch.fusionScore ?? null,
        rerankComponents: ch.rerankComponents ?? null,
        snippet: String(ch.content || "").slice(0, 280),
      }));
      const top = structured[0];
      const structuredTopSim = chunkBestSimilarity(top) || Number(top.fusionScore) || Number(top.score) || 0;
      return {
        chunks: structured,
        topScore: structuredTopSim,
        retrievalLatencyMs: Date.now() - startedAt,
        selectedTopK: limit,
        sectionHints: [],
        sectionHintFiltered: false,
        rerankApplied: false,
        fetchLimit: structured.length,
        telemetryCandidates,
        retrievalFilterReason: `parameter_first_${resolvedParameter.parameterKey}`,
        retrievalMode: "parameter_first",
        rejectedByParameterMismatch: 0,
        rejectedByBlockType: 0,
        embeddingAugmented: false,
        originalQuery,
        embedQuery: originalQuery,
        reason: "",
        parameterLookupAttempted: true,
        parameterResolved: true,
        parameterKey: resolvedParameter.parameterKey,
        parameterSource: "structured_index",
        parameterConfidence: Number(resolvedParameter.confidence || top.parameterEntry?.confidence || 0.8),
        lexicalScore: Number(top.lexicalScore || 0),
        fusionScore: structuredTopSim,
        vectorTopSimilarity: Number(top.score) || Number(top.fusionScore) || 0,
        chunksBeforeSingleFieldNarrowing:
          structured.length > 1 ? structured.slice(0, Math.min(12, structured.length)) : null,
      };
    }
  }

  const embedQuery = mergeEmbeddingQuery(originalQuery, intent, config);

  const queryEmbedding = await embedText({
    embeddingUrl: config.embeddingUrl,
    embeddingModel: config.embeddingModel,
    text: embedQuery,
    maxInputChars: config.embedMaxChars,
  });

  const hints =
    Array.isArray(sectionHints) && sectionHints.length > 0
      ? sectionHints.map((h) => String(h).trim()).filter(Boolean)
      : [];

  const mult = Math.max(1, Math.min(12, config.retrievalCandidateMultiplier || 4));
  let fetchLimit = Math.min(limit * mult, 200);
  if (hints.length > 0) {
    fetchLimit = Math.min(Math.max(fetchLimit, limit * 5), 200);
  }
  if (intent?.intentType === "SINGLE_FIELD_QUERY") {
    fetchLimit = Math.min(Math.max(fetchLimit, limit * 8, 80), 200);
    if (intent?.focusParameter === "grounding_resistance") {
      fetchLimit = Math.min(Math.max(fetchLimit, limit * 10, 120), 200);
    }
  }
  if (intent?.intentType === "GETTING_STARTED_QUERY" || intent?.intentType === "TROUBLESHOOTING_QUERY") {
    fetchLimit = Math.min(Math.max(fetchLimit, limit * 6, 60), 200);
  }

  const vectorLiteral = vectorToSqlLiteral(queryEmbedding);

  const vecRes = await pool.query(
    `
      SELECT
        source_doc,
        section,
        page,
        chunk_index,
        content,
        metadata,
        1 - (embedding <=> $1::vector) AS score
      FROM knowledge_chunks
      WHERE equipment_id = $2
      ORDER BY embedding <=> $1::vector
      LIMIT $3
    `,
    [vectorLiteral, equipmentId, fetchLimit]
  );

  const vectorSanitized = vecRes.rows.map(sanitizeChunk);
  const vectorTopSimilarity = vectorSanitized.length ? Number(vectorSanitized[0].score) || 0 : 0;
  let hybridLexicalMax = 0;
  let chunks;
  const hybridOn = Boolean(config.hybridSearchRrf) && shouldAttemptLexicalHybrid(originalQuery);
  if (hybridOn) {
    try {
      const lexRows = await fetchLexicalRankedChunks(pool, equipmentId, originalQuery, fetchLimit);
      hybridLexicalMax = lexRows.length ? Math.max(...lexRows.map((r) => Number(r.score) || 0)) : 0;
      if (!lexRows.length) {
        chunks = vectorSanitized.map((c) => ({ ...c, hybridVectorOnlyFallback: true }));
      } else {
        const lexicalBoost = queryHasTechnicalAbbreviations(originalQuery)
          ? Math.max(1.5, Number(config.rrfLexicalBoostAbbrev) || 2)
          : 1;
        chunks = reciprocalRankFusionChunks(vecRes.rows, lexRows, sanitizeChunk, config.rrfK || 60, {
          lexicalRankMultiplier: lexicalBoost,
        });
      }
    } catch (_e) {
      chunks = vectorSanitized.map((c) => ({ ...c, hybridVectorOnlyFallback: true }));
    }
  } else {
    chunks = vectorSanitized;
  }

  let sectionHintFiltered = false;
  if (hints.length > 0) {
    const filtered = chunks.filter((chunk) => chunkMatchesSectionHints(chunk, hints));
    sectionHintFiltered = filtered.length > 0;
    chunks = sectionHintFiltered ? filtered : chunks;
  }

  chunks = attachKeywordScores(chunks, originalQuery);
  const chunksBeforeSingleFieldNarrowing =
    intent?.intentType === "SINGLE_FIELD_QUERY"
      ? chunks.slice(0, Math.min(24, chunks.length)).map((ch) => ({ ...ch }))
      : null;
  const singleFieldFiltered = filterChunksForSingleFieldIntent(chunks, intent);
  chunks = singleFieldFiltered.chunks;
  const gettingStartedFiltered = filterChunksForGettingStartedIntent(chunks, intent);
  chunks = gettingStartedFiltered.chunks;
  const troubleshootingHumidityFiltered = filterTroubleshootingHumidity(chunks, intent);
  chunks = troubleshootingHumidityFiltered.chunks;
  chunks = applyOversizedChunkPenalty(chunks, intent);

  const filterDiagnostics = {
    retrievalFilterReason:
      troubleshootingHumidityFiltered.diagnostics.retrievalFilterReason !== "none"
        ? troubleshootingHumidityFiltered.diagnostics.retrievalFilterReason
        : gettingStartedFiltered.diagnostics.retrievalFilterReason !== "none"
        ? gettingStartedFiltered.diagnostics.retrievalFilterReason
        : singleFieldFiltered.diagnostics.retrievalFilterReason,
    retrievalMode: gettingStartedFiltered.diagnostics.retrievalMode || intent?.retrievalMode || null,
    rejectedByParameterMismatch:
      (singleFieldFiltered.diagnostics.rejectedByParameterMismatch || 0) +
      (gettingStartedFiltered.diagnostics.rejectedByParameterMismatch || 0) +
      (troubleshootingHumidityFiltered.diagnostics.rejectedByParameterMismatch || 0),
    rejectedByBlockType:
      (singleFieldFiltered.diagnostics.rejectedByBlockType || 0) +
      (gettingStartedFiltered.diagnostics.rejectedByBlockType || 0) +
      (troubleshootingHumidityFiltered.diagnostics.rejectedByBlockType || 0),
  };

  const rerankApplied =
    Boolean(config.ragRerankEnabled) && Boolean(intent && intent.intentType);
  let ranked = rerankApplied ? rerankChunks(chunks, intent, { query: originalQuery }) : chunks;

  const telemetryCandidates = ranked.slice(0, Math.min(40, ranked.length)).map((ch) => ({
    sourceDoc: ch.sourceDoc,
    section: ch.section,
    chunkIndex: ch.chunkIndex,
    chunkKind: ch.metadata?.chunkKind ?? null,
    blockType: ch.metadata?.blockType ?? null,
    primaryParameter: ch.metadata?.primaryParameter ?? null,
    rerankScore: chunkBestSimilarity(ch),
    rerankComponents: ch.rerankComponents ?? null,
    snippet: String(ch.content || "").slice(0, 280),
  }));

  const boosters = intent?.retrievalBoosters || {};
  let injectedRows = [];
  if (boosters.emergencySmoke || (isSafetyEmergencyQuery(originalQuery) && /дым|гарь|задымлен|вспышк/i.test(originalQuery))) {
    injectedRows = await fetchSection24EmergencyChunks(pool, equipmentId, Math.max(limit, 6));
  } else if (isSafetyEmergencyQuery(originalQuery)) {
    injectedRows = await fetchHighPrioritySafetyChunks(pool, equipmentId, Math.max(limit, 6));
  }
  if (boosters.regenerationShutdown) {
    const regRows = await fetchRegenerationForbiddenChunks(pool, equipmentId, 4);
    injectedRows = [...regRows, ...injectedRows];
  }
  if (boosters.humidityStep || (intent?.focusParameter === "humidity" && /шаг/i.test(originalQuery))) {
    const humRows = await fetchHumidityStepChunks(pool, equipmentId, 4);
    injectedRows = [...humRows, ...injectedRows];
  }
  if (
    boosters.troubleshootingPossibleFaults ||
    intent?.intentType === "TROUBLESHOOTING_QUERY"
  ) {
    const faultRows = await fetchPossibleFaultsListChunks(pool, equipmentId, 8);
    injectedRows = [...faultRows, ...injectedRows];
  }
  if (boosters.maintenanceSections || intent?.intentType === "MAINTENANCE_QUERY") {
    const maintRows = await fetchMaintenanceSectionChunks(pool, equipmentId, 6);
    injectedRows = [...maintRows, ...injectedRows];
  }
  if (boosters.indicatorNormalMode) {
    const indRows = await fetchIndicatorSectionChunks(pool, equipmentId, 4);
    injectedRows = [...indRows, ...injectedRows];
  }
  if (boosters.table11Flatten) {
    const t11Rows = await fetchTable11FlattenedChunks(pool, equipmentId, 8);
    injectedRows = [...t11Rows, ...injectedRows];
  }
  if (boosters.p1GoldenFacts) {
    const p1Rows = await fetchP1GoldenFactsChunks(pool, equipmentId, 10);
    injectedRows = [...p1Rows, ...injectedRows];
  }
  if (boosters.sdb302RetrievalCards || equipmentId === "w-700") {
    const cardRows = await fetchSdb302nmRetrievalCardChunks(pool, equipmentId, originalQuery, 3);
    injectedRows = [...cardRows, ...injectedRows];
  }
  if (injectedRows.length) {
    ranked = mergeSafetyPriorityChunks(ranked, injectedRows, limit);
  } else {
    ranked = ranked.slice(0, limit);
  }

  if (!ranked.length && vectorTopSimilarity >= 0.6) {
    ranked = vectorSanitized.slice(0, limit);
  }

  const rankedTopSim = ranked.length ? chunkBestSimilarity(ranked[0]) : 0;
  const topScore = Math.max(rankedTopSim, vectorTopSimilarity, hybridLexicalMax);
  const fusionScore = Math.max(rankedTopSim, vectorTopSimilarity, hybridLexicalMax);

  return {
    chunks: ranked,
    topScore,
    retrievalLatencyMs: Date.now() - startedAt,
    selectedTopK: limit,
    sectionHints: hints,
    sectionHintFiltered,
    rerankApplied,
    fetchLimit,
    telemetryCandidates,
    retrievalFilterReason: filterDiagnostics.retrievalFilterReason,
    retrievalMode: filterDiagnostics.retrievalMode,
    rejectedByParameterMismatch: filterDiagnostics.rejectedByParameterMismatch,
    rejectedByBlockType: filterDiagnostics.rejectedByBlockType,
    embeddingAugmented: false,
    originalQuery,
    embedQuery,
    reason: "",
    parameterLookupAttempted: Boolean(resolvedParameter && isSingleField),
    parameterResolved: false,
    parameterKey: resolvedParameter?.parameterKey || null,
    parameterSource: null,
    parameterConfidence: Number(resolvedParameter?.confidence || 0),
    lexicalScore: hybridLexicalMax,
    fusionScore,
    vectorTopSimilarity,
    chunksBeforeSingleFieldNarrowing,
  };
}

function formatContextForPrompt(chunks) {
  if (!chunks.length) {
    return "Релевантный контекст не найден.";
  }

  return chunks
    .map((chunk, index) => {
      const sourceParts = [chunk.sourceDoc];
      if (chunk.section) {
        sourceParts.push(`раздел: ${chunk.section}`);
      }
      if (Number.isInteger(chunk.page)) {
        sourceParts.push(`стр: ${chunk.page}`);
      }

      const meta = chunk.metadata || {};
      const modes = Array.isArray(meta.operatingModes) ? meta.operatingModes.join(", ") : "";
      const kind = meta.chunkKind ? String(meta.chunkKind) : "";
      const blockType = meta.blockType ? String(meta.blockType) : "";
      const prim = meta.primaryParameter ? String(meta.primaryParameter) : "";
      const metaLine =
        modes || kind || blockType || prim
          ? [
              `Метаданные фрагмента:`,
              kind && `тип: ${kind}`,
              blockType && `блок: ${blockType}`,
              modes && `режимы (индекс): ${modes}`,
              prim && `primaryParameter: ${prim}`,
            ]
              .filter(Boolean)
              .join(" ")
          : "";

      const lines = [
        `[Фрагмент ${index + 1}]`,
        `Источник: ${sourceParts.join(", ")}`,
      ];
      if (metaLine) {
        lines.push(metaLine);
      }
      lines.push(getChunkBodyForPrompt(chunk));
      return lines.join("\n");
    })
    .join("\n\n");
}

function extractSources(chunks) {
  const seen = new Set();
  const sources = [];

  for (const chunk of chunks) {
    const key = `${chunk.sourceDoc}|${chunk.page || ""}|${chunk.section || ""}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    sources.push({
      sourceDoc: chunk.sourceDoc,
      page: chunk.page,
      section: chunk.section,
      score: chunk.rerankScore ?? chunk.score,
    });
  }

  return sources;
}

module.exports = {
  retrieveEquipmentContext,
  formatContextForPrompt,
  extractSources,
  getChunkBodyForPrompt,
  chunkBestSimilarity,
};
