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

async function embedText({ embeddingUrl, embeddingModel, text }) {
  const response = await fetch(embeddingUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: embeddingModel,
      input: text,
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

  return vector;
}

function vectorToSqlLiteral(vector) {
  return `[${vector.join(",")}]`;
}

module.exports = {
  embedText,
  vectorToSqlLiteral,
};
