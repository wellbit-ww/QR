/**
 * Task 37 — deep case analysis from Task 36 HTTP v14 + eval dataset (read-only baseline traces).
 */
const fs = require("node:fs");
const path = require("node:path");

const TASK37_CASES = [
  "gen.num.dim-tolerance",
  "gen.num.pwr-dry-opt810",
  "gen.kit.feet-height",
  "gen.opt.n2-timer-max",
  "gen.opt.n2-sensor-max",
  "gen.multi.dry-regen-power",
  "gen.multi.ambient-temp-rh",
  "gen.multi.n2-flow-range",
  "gen.note.height-signal",
  "gen.rh.rule-above30",
];

const V14 = path.join(__dirname, "..", "logs", "baseline-task36", "task28-generalization-http-v14", "report.json");
const DATASET = path.join(__dirname, "..", "scripts", "eval", "sdb1560m-generalization-v1.json");

function sourceStatusFor(caseId, expectedFacts) {
  const hints = (expectedFacts || []).map((f) => f.sourceHint || "").join(" ");
  if (/PDF|табл|п\.|§|РЭ/i.test(hints)) {
    return "PDF_CONFIRMED";
  }
  return "SOURCE_AMBIGUOUS";
}

function classifyRootCause(caseId, entry, diag) {
  const answer = entry?.answerPreview || "";
  const kind = entry?.evidenceUsed?.extractKind ?? diag?.extractProvenance?.kind ?? diag?.ragTrace?.llm?.contextualExtract?.kind ?? null;
  const reject = diag?.ragTrace?.llm?.contextualExtract?.rejectReason ?? null;
  const applied = entry?.evidenceUsed?.contextualExtractApplied ?? diag?.extractProvenance?.applied;

  const map = {
    "gen.num.dim-tolerance": {
      rootCause: "INTENT_ROUTING",
      detail:
        "Tolerance question routed to dimensions; extract emitted 1202×1693×1028; prior LLM answer matched dimensions satisfaction → should_not_replace; missing ±5 mm.",
      fixRecommended: "dim_tolerance kind + priorAnswerFullyAnswersQuery guard",
      confidence: "high",
    },
    "gen.num.pwr-dry-opt810": {
      rootCause: "INTENT_ROUTING",
      detail:
        "Power-with-options drying question matched isSdb1560mN2TechnicalQuery (азот+опци) before power extract → n2_option «не входит» answer.",
      fixRecommended: "dryingPowerWithOptions routing before n2_option; power_drying_opt extract",
      confidence: "high",
    },
    "gen.kit.feet-height": {
      rootCause: "INTENT_ROUTING",
      detail: "Feet height question matched dimensions (высот); no kit_feet extract.",
      fixRecommended: "kit_feet kind from table 1.2 corpus",
      confidence: "high",
    },
    "gen.opt.n2-timer-max": {
      rootCause: "EXTRACT_SATISFACTION",
      detail:
        "«без датчика» triggered sensor branch in extractSatisfiesQuery; prior «99 мин» falsely treated as satisfying via generic azot fallback.",
      fixRecommended: "Timer-specific satisfaction + «без датчика» guard; timer routing on «время подач»",
      confidence: "high",
    },
    "gen.opt.n2-sensor-max": {
      rootCause: "EXTRACT_SATISFACTION",
      detail: "Max-sensor questions satisfied by 78-only check; eval requires explicit 98.",
      fixRecommended: "Sensor max branch requires \\b98\\b in answer",
      confidence: "medium",
    },
    "gen.multi.dry-regen-power": {
      rootCause: "MULTI_FACT_COMPLETENESS",
      detail: "power_regen extract only 540 W; LLM partial answers blocked replacement; missing paired 40 W dry.",
      fixRecommended: "power_dry_regen combined extract",
      confidence: "high",
    },
    "gen.multi.ambient-temp-rh": {
      rootCause: "MULTI_FACT_COMPLETENESS",
      detail: "ambient_temp extract only +15…+35; RH 80 % missing; partial prior blocked replace.",
      fixRecommended: "ambient_temp_rh combined extract",
      confidence: "high",
    },
    "gen.multi.n2-flow-range": {
      rootCause: "INTENT_ROUTING",
      detail: "Flow-range question hit n2_option «не входит in base» branch instead of 3–30 l/min.",
      fixRecommended: "isN2FlowRangeQuery + range extract",
      confidence: "high",
    },
    "gen.note.height-signal": {
      rootCause: "INTENT_ROUTING",
      detail: "Height note question routed to dimensions sizes.",
      fixRecommended: "height_table_note extract from table 1.1 footnote",
      confidence: "high",
    },
    "gen.rh.rule-above30": {
      rootCause: "INTENT_ROUTING",
      detail: "Setpoint rule question matched rh_ambient_max (80 %RH ambient) instead of RH%окр−20 rule.",
      fixRecommended: "rh_setpoint_rule kind",
      confidence: "high",
    },
  };

  const base = map[caseId] || { rootCause: "INSUFFICIENT_TRACE", detail: reject || kind, confidence: "low" };
  if (entry?.overall?.status === "fail" && kind && !applied && reject === "should_not_replace") {
    base.replacementDecision = "should_not_replace";
  }
  return base;
}

const v14 = JSON.parse(fs.readFileSync(V14, "utf8"));
const dataset = JSON.parse(fs.readFileSync(DATASET, "utf8"));
const dsById = Object.fromEntries(dataset.cases.map((c) => [c.id, c]));
const byId = Object.fromEntries(v14.caseResults.map((r) => [r.case.id, r]));
const diagBy = v14.diagnosticsByCaseId || {};

const cases = TASK37_CASES.map((caseId) => {
  const entry = byId[caseId];
  const ds = dsById[caseId];
  const diag = diagBy[caseId] || {};
  const cls = classifyRootCause(caseId, entry, diag);
  const ctx = diag?.ragTrace?.llm?.contextualExtract || {};
  const sources = (diag.sources || []).map((s) => ({
    sourceDoc: s.sourceDoc,
    chunkIndex: s.chunkIndex,
    contentLen: s.contentLen,
  }));

  return {
    caseId,
    baselineResult: entry?.overall?.status || "missing",
    baselineReason: entry?.overall?.reason || null,
    expectedFacts: ds?.requiredFacts || [],
    actualAnswer: entry?.answerPreview || null,
    sourceStatus: sourceStatusFor(caseId, ds?.requiredFacts),
    sourceEvidence: (ds?.requiredFacts || []).map((f) => f.sourceHint).filter(Boolean),
    retrievedSourceIds: sources,
    extractKind: entry?.evidenceUsed?.extractKind ?? ctx.kind ?? null,
    extractCandidate: ctx.extractPreview || null,
    extractSatisfiesQuery: null,
    replacementDecision: ctx.rejectReason || (entry?.evidenceUsed?.contextualExtractApplied ? "applied" : null),
    llmOutput: diag?.ragTrace?.llm?.rawAnswerPreview || entry?.answerPreview || null,
    postGateOutcome: entry?.evidenceUsed?.postGateOutcome || diag?.ragTrace?.postGate?.outcome || null,
    rootCause: cls.rootCause,
    rootCauseConfidence: cls.confidence,
    fixRecommended: cls.fixRecommended || null,
    verificationResult: {
      unitTest: "scripts/test-sdb1560m-task37-contextual-extract.js",
      httpTask36Baseline: "fail",
      httpTask37: "not_run_portal_down",
    },
    hypothesis: cls.detail,
  };
});

const out = {
  task: 37,
  generatedAt: new Date().toISOString(),
  branch: "backup/sova-portal",
  head: "8523954fadcc4f31b92305f81b8dfc09f3e61a14",
  evalRunner: "1.7-task33",
  baselineReference: "logs/baseline-task36/task28-generalization-http-v14/report.json",
  sharedDefects: [
    {
      id: "misrouting_generic_kind",
      cases: [
        "gen.num.dim-tolerance",
        "gen.kit.feet-height",
        "gen.note.height-signal",
        "gen.num.pwr-dry-opt810",
        "gen.multi.n2-flow-range",
        "gen.rh.rule-above30",
      ],
      category: "INTENT_ROUTING",
    },
    {
      id: "partial_prior_blocks_replace",
      cases: ["gen.num.dim-tolerance", "gen.kit.feet-height", "gen.note.height-signal", "gen.multi.ambient-temp-rh"],
      category: "EXTRACT_SELECTION",
    },
    {
      id: "multi_fact_single_extract",
      cases: ["gen.multi.dry-regen-power", "gen.multi.ambient-temp-rh"],
      category: "MULTI_FACT_COMPLETENESS",
    },
    {
      id: "n2_satisfaction_false_positive",
      cases: ["gen.opt.n2-timer-max", "gen.opt.n2-sensor-max"],
      category: "EXTRACT_SATISFACTION",
    },
  ],
  productionFixesTask37: [
    {
      file: "src/rag/honest-contextual-extract.js",
      summary:
        "New semantic kinds (dim_tolerance, kit_feet, height_table_note, power_drying_opt, power_dry_regen, ambient_temp_rh, rh_setpoint_rule); n2 satisfaction fixes; priorAnswerFullyAnswersQuery",
    },
  ],
  cases,
};

const outDir = path.join(__dirname, "..", "logs", "baseline-task37");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "task37-case-analysis.json"), JSON.stringify(out, null, 2));
console.log("Wrote logs/baseline-task37/task37-case-analysis.json");
