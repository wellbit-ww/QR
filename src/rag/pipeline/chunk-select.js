/**
 * Объединение пулов чанков для contextual-fact / grounding reground.
 */
function selectPromptChunksDeterministicFactFallback(
  fusedChunks,
  semanticChunks,
  preNarrowChunks,
  minCount = 4,
  maxCount = 6,
) {
  const pools = [
    Array.isArray(fusedChunks) ? fusedChunks : [],
    Array.isArray(semanticChunks) ? semanticChunks : [],
    Array.isArray(preNarrowChunks) ? preNarrowChunks : [],
  ];
  const seen = new Set();
  const out = [];
  const keyOf = (ch) => `${ch.sourceDoc}|${ch.chunkIndex}`;
  for (const pool of pools) {
    for (const ch of pool) {
      if (!ch) {
        continue;
      }
      const k = keyOf(ch);
      if (seen.has(k)) {
        continue;
      }
      seen.add(k);
      out.push(ch);
      if (out.length >= maxCount) {
        return out;
      }
    }
  }
  if (out.length >= minCount) {
    return out;
  }
  return out;
}

module.exports = {
  selectPromptChunksDeterministicFactFallback,
};
