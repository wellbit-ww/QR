const { fetchOllama } = require("../ollama-fetch");

const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/chat";

const ALLOWED = new Set([
  "DETERMINISTIC_PARAMETER",
  "PROCEDURAL_QA",
  "TROUBLESHOOTING_QA",
  "REASONING_QA",
  "SAFETY_QA",
  "FACT_QA",
]);

function extractJsonObject(text) {
  const s = String(text || "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch (_e) {
    return null;
  }
}

/**
 * Cheap second stage when regex routing is UNKNOWN — single short Ollama call, JSON route only.
 */
async function classifyRouteWithLlm(query, equipment) {
  const model =
    process.env.OLLAMA_ROUTER_MODEL || process.env.OLLAMA_FALLBACK_MODEL || "llama3.1:8b";
  const eqName = equipment?.name ? String(equipment.name) : "";
  const system = [
    "You classify user questions about industrial drying/storage cabinets into exactly one route.",
    "Reply with ONE JSON object only, no markdown fences, no explanation.",
    'Schema: {"route":"<ENUM>"}',
    "ENUM must be one of:",
    "DETERMINISTIC_PARAMETER — asking for a single numeric/spec value (voltage, IP, weight, RH range, etc.).",
    "PROCEDURAL_QA — how to start, install, connect, sequence of steps, preparation.",
    "TROUBLESHOOTING_QA — device misbehaves, errors, no power, humidity not reached, beeps, Ethernet down.",
    "REASONING_QA — why / what happens if / causal explanation.",
    "SAFETY_QA — only emergency: smoke, fire, injury, electric shock, ТБ/авария. NOT ambient temperature, 24/7 operation, specs, or ordinary 'what to check before power-on'.",
    "FACT_QA — general factual question about the product not fitting the above.",
  ].join("\n");

  const user = [`Equipment: ${eqName || "unknown"}.`, `Question: ${String(query || "").trim()}`].join(
    "\n"
  );

  const body = {
    model,
    stream: false,
    options: { temperature: 0, top_p: 0.85, num_predict: 96, num_ctx: 2048 },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };

  const response = await fetchOllama(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Router LLM failed: ${response.status} ${err}`);
  }
  const payload = await response.json();
  const content = payload?.message?.content?.trim() || "";
  const parsed = extractJsonObject(content);
  const route = typeof parsed?.route === "string" ? parsed.route.trim() : "";
  if (!ALLOWED.has(route)) {
    return null;
  }
  if (route === "FACT_QA") {
    return "REASONING_QA";
  }
  return route;
}

module.exports = {
  classifyRouteWithLlm,
};
