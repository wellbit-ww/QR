const { fetchOllama } = require("../ollama-fetch");

const OLLAMA_URL = "http://127.0.0.1:11434/api/chat";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:32b-instruct";
const OLLAMA_FALLBACK_MODEL = process.env.OLLAMA_FALLBACK_MODEL || "llama3.1:8b";

function parseNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function mergeIntentLlmOptions(base, intentLlmOptions) {
  if (!intentLlmOptions || typeof intentLlmOptions !== "object") {
    return base;
  }
  const out = { ...base };
  if (Number.isFinite(Number(intentLlmOptions.temperature))) {
    out.temperature = Number(intentLlmOptions.temperature);
  }
  if (Number.isFinite(Number(intentLlmOptions.top_p))) {
    out.top_p = Number(intentLlmOptions.top_p);
  }
  if (Number.isFinite(Number(intentLlmOptions.num_predict))) {
    out.num_predict = Number(intentLlmOptions.num_predict);
  }
  return out;
}

function generationOptionsForRoute(route, intentLlmOptions = null) {
  const base = {
    temperature: parseNumber(process.env.OLLAMA_TEMPERATURE, 0.1),
    top_p: parseNumber(process.env.OLLAMA_TOP_P, 0.85),
    num_ctx: parseNumber(process.env.OLLAMA_NUM_CTX, 8192),
  };
  const defaultPredict =
    route === "QUERY_REWRITE"
      ? 200
      : route === "TROUBLESHOOTING_QA"
        ? parseNumber(process.env.OLLAMA_TROUBLESHOOTING_PREDICT, 480)
        : route === "SAFETY_QA"
          ? 260
          : route === "PROCEDURAL_QA"
            ? parseNumber(process.env.OLLAMA_PROCEDURAL_PREDICT, 1024)
            : 420;
  if (route === "QUERY_REWRITE") {
    return mergeIntentLlmOptions(
      {
        ...base,
        temperature: 0,
        top_p: 0.9,
        num_predict: parseNumber(process.env.OLLAMA_QUERY_REWRITE_PREDICT, defaultPredict),
      },
      intentLlmOptions
    );
  }
  if (route === "SAFETY_QA") {
    const safetyTemp =
      intentLlmOptions && Number.isFinite(Number(intentLlmOptions.temperature))
        ? Number(intentLlmOptions.temperature)
        : 0;
    return mergeIntentLlmOptions(
      {
        ...base,
        temperature: safetyTemp,
        top_p:
          intentLlmOptions && Number.isFinite(Number(intentLlmOptions.top_p))
            ? Number(intentLlmOptions.top_p)
            : 0.85,
        num_predict: parseNumber(process.env.OLLAMA_SAFETY_PREDICT, defaultPredict),
      },
      intentLlmOptions
    );
  }
  if (intentLlmOptions && Number.isFinite(Number(intentLlmOptions.temperature))) {
    return mergeIntentLlmOptions(
      {
        ...base,
        temperature: Number(intentLlmOptions.temperature),
        top_p: Number.isFinite(Number(intentLlmOptions.top_p))
          ? Number(intentLlmOptions.top_p)
          : base.top_p,
        num_predict: parseNumber(process.env.OLLAMA_NUM_PREDICT, defaultPredict),
      },
      intentLlmOptions
    );
  }
  return mergeIntentLlmOptions(
    {
      ...base,
      num_predict: parseNumber(process.env.OLLAMA_NUM_PREDICT, defaultPredict),
    },
    intentLlmOptions
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isModelLoadFailure(errorText) {
  return /model failed to load|resource limitations|internal error/i.test(String(errorText || ""));
}

async function callOllamaRaw(body, outputSchema) {
  let response = await fetchOllama(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok && outputSchema && (response.status === 400 || response.status === 500)) {
    response = await fetchOllama(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, format: undefined }),
    });
  }

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Ollama request failed (${response.status} ${response.statusText}): ${err}`);
  }

  const payload = await response.json();
  const content = payload?.message?.content?.trim() || "";
  if (!content) {
    throw new Error("Ollama returned empty content.");
  }
  return content;
}

async function generate({
  route,
  context,
  systemPrompt,
  userMessage,
  outputSchema = null,
  intentLlmOptions = null,
}) {
  void context;
  const models = [OLLAMA_MODEL, OLLAMA_FALLBACK_MODEL].filter(Boolean);
  let lastError = null;

  for (const model of models) {
    const body = {
      model,
      stream: false,
      options: generationOptionsForRoute(route, intentLlmOptions),
      ...(outputSchema ? { format: "json" } : {}),
      messages: [
        {
          role: "system",
          content: String(systemPrompt || ""),
        },
        {
          role: "user",
          content: String(userMessage || ""),
        },
      ],
    };

    // Retries for transient model-load failures.
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const content = await callOllamaRaw(body, outputSchema);
        return {
          content,
          model,
        };
      } catch (error) {
        lastError = error;
        const details = error instanceof Error ? error.message : String(error);
        const retryable = isModelLoadFailure(details);
        if (!retryable || attempt >= maxAttempts) {
          break;
        }
        await sleep(300 * attempt);
      }
    }
  }

  throw lastError || new Error("Ollama request failed.");
}

module.exports = {
  generate,
};
