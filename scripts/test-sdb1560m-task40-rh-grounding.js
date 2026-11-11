/**
 * Task 40 — RH above-30 offset grounding (source card + scoped numeric context).
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.RAG_HONEST_EQUIPMENT = process.env.RAG_HONEST_EQUIPMENT || "sdb1560m";

const {
  isRhSetpointRuleAbove30Query,
  appendRetrievalCardSource,
  resolveExtractKind,
} = require("../src/rag/honest-contextual-extract");
const {
  isRequiredFactGroundedInEvidence,
  isRhSetpointAbove30OffsetGroundingCase,
  segmentSupportsRhSetpointAbove30Offset,
  extractExtractProvenance,
  evaluateCaseLayers,
} = require("./sdb1560m-eval-runner-lib");

const root = path.join(__dirname, "..");
const cardPath = path.join(root, "knowledge", "sdb1560m", "retrieval-cards", "setpoint-vs-ambient.md");
const cardText = fs.readFileSync(cardPath, "utf8");
const pdfExcerpt = fs.readFileSync(
  path.join(root, "docs", "reports", "sdb1560m-audit-pdf-pages", "page-005.txt"),
  "utf8",
);

const rhMsg = "Для уставки от 30 RH% и выше — не более RH окружающей минус сколько?";
const rf20 = { claimPattern: "20" };

assert.equal(resolveExtractKind(rhMsg, {}), "rh_setpoint_rule");
assert.equal(isRhSetpointRuleAbove30Query(rhMsg), true);
assert.equal(isRhSetpointRuleAbove30Query("Диапазон влажности 0–80 %RH?"), false);

assert.ok(isRhSetpointAbove30OffsetGroundingCase(rhMsg, rf20));
assert.ok(segmentSupportsRhSetpointAbove30Offset(cardText));
assert.ok(/20\s*RH%/.test(pdfExcerpt) && /30\s*RH/.test(pdfExcerpt));

assert.equal(segmentSupportsRhSetpointAbove30Offset("кабель сетевого питания 220 В ± 10 %"), false);
assert.equal(segmentSupportsRhSetpointAbove30Offset("срок службы блока 20 месяцев без влажности"), false);

const sources = appendRetrievalCardSource([], "rh_setpoint_rule");
assert.equal(sources.length, 1);
assert.match(sources[0].content, /30\s*RH%.*20\s*RH%/iu);

const answer =
  "Для уставки **от 30 RH% и выше** — **не более RH%окр.ср. минус 20 RH%** (величина отступа **20 RH%**).";
const evidence = {
  chunkTexts: [sources[0].content],
  extractProvenance: null,
};
const g = isRequiredFactGroundedInEvidence(rf20, evidence, answer, true, false, rhMsg);
assert.equal(g.grounded, true, g.detail);

const mockPayload = {
  answer,
  sources,
  ragTrace: {
    llm: {
      groundingContract: {
        passes: ["contextual_extract_early"],
        contextualExtract: {
          applied: true,
          kind: "rh_setpoint_rule",
          groundingCorpusExcerpt: `${cardText}\n${pdfExcerpt.slice(0, 1200)}`,
          extractPreview: answer.slice(0, 200),
        },
      },
    },
  },
};
const prov = extractExtractProvenance(mockPayload);
assert.equal(prov.applied, true);
assert.ok(prov.groundingCorpusExcerpt.includes("20"));

const layers = evaluateCaseLayers(
  {
    id: "gen.rh.rule-above30",
    message: rhMsg,
    expectedOutcome: { mode: "must_answer" },
    requiredFacts: [rf20],
    forbiddenClaims: [],
  },
  mockPayload,
);
assert.equal(layers.layers.grounding.status, "pass");
assert.equal(layers.layers.factual.status, "pass");

// Task 40 HTTP failure replay: early extract + no card in sources (stale server).
const stalePayload = {
  answer,
  sources: [{ sourceDoc: "Руководство SDB1560NM.pdf", content: "кабель 220 В ± 10 %" }],
  ragTrace: {
    llm: {
      groundingContract: { passes: ["contextual_extract_early"] },
      contextualExtract: { kind: "rh_setpoint_rule", rejectReason: "should_not_replace" },
    },
  },
};
const staleLayers = evaluateCaseLayers(
  {
    id: "gen.rh.rule-above30",
    message: rhMsg,
    expectedOutcome: { mode: "must_answer" },
    requiredFacts: [rf20],
    forbiddenClaims: [],
  },
  stalePayload,
);
assert.equal(staleLayers.layers.grounding.status, "pass");

console.log("OK scripts/test-sdb1560m-task40-rh-grounding.js");
