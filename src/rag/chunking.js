function normalizeText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitIntoChunks(text, chunkSize, overlap) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return [];
  }

  const chunks = [];
  let start = 0;

  while (start < normalized.length) {
    const end = Math.min(start + chunkSize, normalized.length);
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

module.exports = {
  splitIntoChunks,
};
