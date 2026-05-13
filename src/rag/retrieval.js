const { getRagConfig } = require("./config");
const { getPool } = require("./pg-client");
const { embedText, vectorToSqlLiteral } = require("./embeddings");
const { rerankChunks, computeKeywordOverlapScore } = require("./rerank");
const { resolveParameter, PARAMETER_REGISTRY, normalizeParameterText } = require("./parameter-registry");
const { extractStructuredParameters } = require("./parameter-extraction");

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
 */
function mergeEmbeddingQuery(originalQuery, intent, config) {
  void intent;
  void config;
  return String(originalQuery || "").trim();
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
  return /осушител|осушени|drying|rh|влажност|уплотнит|регенерац|desiccant|влагопоглот/i.test(t);
}

function isPowerTroubleshootingChunk(chunk) {
  const t = normalizeChunkText(chunk);
  return /предохран|кабель|no power|питани[ея]|напряжен|fuse|power|розетк|220\s*в/i.test(t);
}

function applyOversizedChunkPenalty(chunks, intent) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return chunks;
  }
  const scope = intent?.queryScope;
  if (scope !== "narrow" && scope !== "medium") {
    return chunks;
  }
  const maxChunkCharactersForFact = 1800;
  const maxChunkCharactersForOnboarding = 2200;
  const threshold =
    intent?.intentType === "GETTING_STARTED_QUERY"
      ? maxChunkCharactersForOnboarding
      : maxChunkCharactersForFact;
  return chunks.map((ch) => {
    const len = String(ch.content || "").length;
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
  const limit = Number.isFinite(topK) && topK > 0 ? Math.floor(topK) : config.retrievalTopK;
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
        rerankScore: ch.fusionScore ?? ch.score,
        lexicalScore: ch.lexicalScore ?? null,
        fusionScore: ch.fusionScore ?? null,
        rerankComponents: ch.rerankComponents ?? null,
        snippet: String(ch.content || "").slice(0, 280),
      }));
      const top = structured[0];
      return {
        chunks: structured,
        topScore: top.fusionScore ?? 0,
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
        fusionScore: Number(top.fusionScore || 0),
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

  const result = await pool.query(
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

  let chunks = result.rows.map(sanitizeChunk);

  let sectionHintFiltered = false;
  if (hints.length > 0) {
    const filtered = chunks.filter((chunk) => chunkMatchesSectionHints(chunk, hints));
    sectionHintFiltered = filtered.length > 0;
    chunks = sectionHintFiltered ? filtered : chunks;
  }

  chunks = attachKeywordScores(chunks, originalQuery);
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
    rerankScore: ch.rerankScore ?? ch.score,
    rerankComponents: ch.rerankComponents ?? null,
    snippet: String(ch.content || "").slice(0, 280),
  }));

  ranked = ranked.slice(0, limit);

  const topScore = ranked.length > 0 ? ranked[0].rerankScore ?? ranked[0].score : 0;

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
    lexicalScore: 0,
    fusionScore: 0,
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
      lines.push(chunk.content);
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
};
