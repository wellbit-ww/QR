/**
 * Лёгкий семантический rerank поверх vector score: модель, режимы, тип чанка, конфигурационные маркеры.
 */

function normalizeForMatch(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function chunkModes(chunk) {
  const m = chunk?.metadata?.operatingModes;
  return Array.isArray(m) ? m : [];
}

function chunkKind(chunk) {
  const k = chunk?.metadata?.chunkKind;
  return typeof k === "string" ? k : "general";
}

/** Пересечение режимов чанка с режимами запроса; чанк «general» не конфликтует. */
function modeOverlapScore(chunk, queryModes, intentType) {
  if (intentType === "FACT_QUERY" || !queryModes.length) {
    return 0;
  }
  const cm = chunkModes(chunk);
  if (!cm.length || cm.includes("general")) {
    return 0.02;
  }
  let hits = 0;
  for (const q of queryModes) {
    if (cm.includes(q)) {
      hits += 1;
    }
  }
  if (hits === 0) {
    return -0.08;
  }
  return 0.04 + 0.03 * Math.min(hits, queryModes.length);
}

function modelAliasScore(chunk, aliases, intentType) {
  if (intentType === "FACT_QUERY") {
    return 0;
  }
  if (!aliases.length) {
    return 0;
  }
  const hay = normalizeForMatch(`${chunk.content || ""} ${chunk.section || ""}`);
  let bonus = 0;
  for (const a of aliases) {
    const t = normalizeForMatch(a);
    if (t.length >= 4 && hay.includes(t)) {
      bonus += 0.05;
    }
  }
  return Math.min(bonus, 0.12);
}

function kindPreferenceScore(chunk, preferredSet) {
  const k = chunkKind(chunk);
  if (!preferredSet || preferredSet.size === 0) {
    return 0;
  }
  return preferredSet.has(k) ? 0.05 : -0.02;
}

function nitrogenConsistencyScore(chunk, hints) {
  if (!hints) {
    return 0;
  }
  const text = String(chunk.content || "");
  const hasSensorPhrase = /азот.*датчик|датчик.*азот/i.test(text);
  const hasNoSensorPhrase = /азот.*без\s+датчик|без\s+датчик.*азот/i.test(text);

  let s = 0;
  if (hints.nitrogenSensor && hasSensorPhrase) {
    s += 0.06;
  }
  if (hints.nitrogenNoSensor && hasNoSensorPhrase) {
    s += 0.06;
  }
  if (hints.nitrogenSensor && hasNoSensorPhrase && !hasSensorPhrase) {
    s -= 0.07;
  }
  if (hints.nitrogenNoSensor && hasSensorPhrase && !hasNoSensorPhrase) {
    s -= 0.07;
  }
  return s;
}

function tableBoostForFactComparison(intentType, chunk) {
  const k = chunkKind(chunk);
  if (k !== "table") {
    return 0;
  }
  if (intentType === "FACT_QUERY" || intentType === "COMPARISON_QUERY") {
    return 0.04;
  }
  return 0;
}

/**
 * @param {object[]} chunks — элементы с полем score (косинусная близость)
 * @param {object} intent — результат classifyQueryIntent
 * @returns {object[]} тот же массив, отсортированный по rerankScore; добавлены vectorScore и rerankScore
 */
function rerankChunks(chunks, intent) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return chunks;
  }

  const preferredSet = new Set(intent?.preferredChunkKinds || []);
  const queryModes = intent?.queryOperatingModes || [];
  const aliases = intent?.equipmentAliases || [];
  const hints = intent?.configHints || {};
  const intentType = intent?.intentType || "FACT_QUERY";

  const scored = chunks.map((chunk) => {
    const vectorScore = Number(chunk.score) || 0;
    let adj =
      modeOverlapScore(chunk, queryModes, intentType) +
      modelAliasScore(chunk, aliases, intentType) +
      kindPreferenceScore(chunk, preferredSet) +
      nitrogenConsistencyScore(chunk, hints) +
      tableBoostForFactComparison(intentType, chunk);

    const rerankScore = Math.max(0, Math.min(1, vectorScore + adj));
    return {
      ...chunk,
      vectorScore,
      rerankScore,
      rerankAdjustment: adj,
    };
  });

  scored.sort((a, b) => b.rerankScore - a.rerankScore);
  return scored;
}

module.exports = {
  rerankChunks,
};
