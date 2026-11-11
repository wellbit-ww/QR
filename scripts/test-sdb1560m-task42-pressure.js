/**
 * Task 42 — atmospheric pressure (п. 1.1.2.12) contextual extract + grounding.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.RAG_HONEST_EQUIPMENT = process.env.RAG_HONEST_EQUIPMENT || "sdb1560m";

const {
  resolveExtractKind,
  appendRetrievalCardSource,
  isSdb1560mAtmosphericPressureQuery,
  tryHonestContextualNumericFact,
} = require("../src/rag/honest-contextual-extract");
const { evaluateCaseLayers } = require("./sdb1560m-eval-runner-lib");

const root = path.join(__dirname, "..");
const cardPath = path.join(root, "knowledge", "sdb1560m", "retrieval-cards", "ambient-pressure.md");
const cardText = fs.readFileSync(cardPath, "utf8");

const cases = [
  {
    id: "gen.env.pressure-kpa-min",
    message: "Нижняя граница атмосферного давления для эксплуатации (кПа)?",
    claimPattern: "84",
  },
  {
    id: "gen.env.pressure-kpa-max",
    message: "Верхняя граница атмосферного давления (кПа)?",
    claimPattern: "106[,.]7",
  },
  {
    id: "gen.env.pressure-mmhg-min",
    message: "Нижняя граница давления в мм рт. ст.?",
    claimPattern: "630",
  },
  {
    id: "gen.env.pressure-mmhg-max",
    message: "Верхняя граница давления в мм рт. ст.?",
    claimPattern: "800",
  },
];

for (const c of cases) {
  assert.equal(isSdb1560mAtmosphericPressureQuery(c.message), true, c.id);
  assert.equal(resolveExtractKind(c.message, {}), "atmospheric_pressure", c.id);
  assert.equal(isSdb1560mAtmosphericPressureQuery("Сколько бар максимум на входе азота?"), false);
}

const sources = appendRetrievalCardSource([], "atmospheric_pressure");
assert.equal(sources.length, 1);
assert.match(sources[0].content, /84,0/u);
assert.match(sources[0].content, /106,7/u);
assert.match(sources[0].content, /630/u);
assert.match(sources[0].content, /800/u);

for (const c of cases) {
  const trace = {};
  const prior = "В предоставленном контексте не указано значение.";
  const answer = tryHonestContextualNumericFact({
    equipmentId: "sdb1560m",
    message: c.message,
    intent: {},
    promptChunks: [],
    retrievalContext: cardText,
    priorAnswer: prior,
    traceOut: trace,
  });
  assert.ok(answer, `${c.id} extract: ${trace.rejectReason || ""}`);
  assert.equal(trace.applied, true, c.id);
  const payload = {
    answer,
    sources,
    ragTrace: {
      llm: {
        groundingContract: {
          passes: ["contextual_extract_early"],
          contextualExtract: {
            applied: true,
            kind: "atmospheric_pressure",
            groundingCorpusExcerpt: cardText,
            extractPreview: answer,
          },
        },
      },
    },
  };
  const layers = evaluateCaseLayers(
    {
      id: c.id,
      message: c.message,
      expectedOutcome: { mode: "must_answer" },
      requiredFacts: [{ claimPattern: c.claimPattern }],
      forbiddenClaims: [],
    },
    payload,
  );
  assert.equal(layers.layers.factual.status, "pass", `${c.id} factual`);
  assert.equal(layers.layers.grounding.status, "pass", `${c.id} grounding`);
}

console.log("task42-pressure: OK");
