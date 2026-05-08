const { fetchOllama } = require("./ollama-fetch");

function extractEmbeddingVector(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  if (Array.isArray(payload.embeddings) && payload.embeddings.length > 0) {
    const first = payload.embeddings[0];
    return Array.isArray(first) ? first : null;
  }

  if (Array.isArray(payload.embedding)) {
    return payload.embedding;
  }

  return null;
}

function truncateForEmbedding(text, maxChars) {
  const cleaned = String(text || "").replace(/\u0000/g, "").trim();
  if (!maxChars || maxChars <= 0 || cleaned.length <= maxChars) {
    return cleaned;
  }
  return cleaned.slice(0, maxChars);
}

function assertFiniteEmbedding(vector, context) {
  if (!Array.isArray(vector)) {
    throw new Error(`${context}: embedding is not an array`);
  }
  for (let i = 0; i < vector.length; i += 1) {
    const x = vector[i];
    if (!Number.isFinite(x)) {
      throw new Error(`${context}: non-finite value at index ${i}`);
    }
  }
}

function isRetryableEmbedFailure(error) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes("500") ||
    msg.includes("NaN") ||
    msg.includes("encode response") ||
    msg.includes("non-finite")
  );
}

async function embedTextOnce({ embeddingUrl, embeddingModel, input }) {
  const response = await fetchOllama(embeddingUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: embeddingModel,
      input,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Embedding request failed (${response.status} ${response.statusText}): ${details}`
    );
  }

  const payload = await response.json();
  const vector = extractEmbeddingVector(payload);

  if (!Array.isArray(vector) || vector.length !== 1024) {
    throw new Error(
      `Embedding model returned invalid vector size: ${
        Array.isArray(vector) ? vector.length : "unknown"
      }`
    );
  }

  assertFiniteEmbedding(vector, "embedTextOnce");
  return vector;
}

/**
 * @param {object} opts
 * @param {string} opts.embeddingUrl
 * @param {string} opts.embeddingModel
 * @param {string} opts.text
 * @param {number} [opts.maxInputChars] — truncate input; retries shorter on NaN/500 from Ollama
 */
async function embedText(opts) {
  const maxInputChars =
    typeof opts.maxInputChars === "number" && opts.maxInputChars > 0
      ? opts.maxInputChars
      : 24576;

  const base = truncateForEmbedding(opts.text, maxInputChars);
  if (!base) {
    throw new Error("Embedding input is empty after truncation.");
  }

  const tryLengths = [
    base.length,
    Math.floor(base.length / 2),
    Math.min(4000, base.length),
    Math.min(1500, base.length),
  ];
  const uniqueLengths = [...new Set(tryLengths.filter((n) => n > 0))];

  let lastError = null;
  for (const len of uniqueLengths) {
    const input = base.slice(0, len).trim();
    if (!input) {
      continue;
    }
    try {
      return await embedTextOnce({
        embeddingUrl: opts.embeddingUrl,
        embeddingModel: opts.embeddingModel,
        input,
      });
    } catch (error) {
      lastError = error;
      if (!isRetryableEmbedFailure(error)) {
        throw error;
      }
    }
  }

  throw lastError || new Error("Embedding failed after retries.");
}

/**
 * Batch embedding for Ollama /api/embed (input as string[] → embeddings[][]).
 */
async function embedTextsBatch({
  embeddingUrl,
  embeddingModel,
  texts,
  maxInputChars,
}) {
  if (!Array.isArray(texts) || texts.length === 0) {
    return [];
  }

  const limit =
    typeof maxInputChars === "number" && maxInputChars > 0
      ? maxInputChars
      : 24576;
  const trimmed = texts.map((t) => truncateForEmbedding(t, limit));

  const response = await fetchOllama(embeddingUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: embeddingModel,
      input: trimmed,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Embedding request failed (${response.status} ${response.statusText}): ${details}`
    );
  }

  const payload = await response.json();
  let vectors;

  if (Array.isArray(payload.embeddings) && payload.embeddings.length === texts.length) {
    vectors = payload.embeddings;
  } else if (
    texts.length === 1 &&
    Array.isArray(payload.embedding)
  ) {
    vectors = [payload.embedding];
  } else {
    throw new Error(
      `Unexpected embed batch response: expected ${texts.length} vectors`
    );
  }

  for (let i = 0; i < vectors.length; i += 1) {
    const vector = vectors[i];
    if (!Array.isArray(vector) || vector.length !== 1024) {
      throw new Error(
        `Embedding model returned invalid vector size at index ${i}: ${
          Array.isArray(vector) ? vector.length : "unknown"
        }`
      );
    }
    assertFiniteEmbedding(vector, `embedTextsBatch[${i}]`);
  }

  return vectors;
}

function vectorToSqlLiteral(vector) {
  assertFiniteEmbedding(vector, "vectorToSqlLiteral");
  return `[${vector.join(",")}]`;
}

module.exports = {
  embedText,
  embedTextsBatch,
  vectorToSqlLiteral,
};
