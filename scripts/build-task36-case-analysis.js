/**
 * Build Task 36 case inventory from Task 35 HTTP report (read-only baseline).
 */
const fs = require("node:fs");
const path = require("node:path");

const REPORT = path.join(
  __dirname,
  "..",
  "logs",
  "baseline-task35",
  "task28-generalization-http-v12",
  "report.json",
);

const PRIORITY_A = ["gen.num.voltage", "gen.num.freq"];
const PRIORITY_B = [
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
const PRIORITY_C = [
  "gen.num.rh-range-high",
  "gen.env.pressure-kpa-min",
  "gen.env.pressure-kpa-max",
  "gen.num.ral",
  "gen.std.esd",
  "gen.rh.rule-below30",
  "gen.spare.fuse-heating",
  "gen.env.pressure-mmhg-min",
  "gen.env.pressure-mmhg-max",
  "gen.ind.green-only-storage",
  "gen.proc.open-door-symbol",
  "gen.proc.fan-symbol",
];
const PRIORITY_D = [
  "gen.unsup.bluetooth",
  "gen.unsup.sdb151-mass-for-1560",
  "gen.unsup.warehouse-humidity-setpoint",
  "gen.insuf.n2-without-option",
  "gen.unsup.blockchain",
  "gen.unsup.serial-format",
];

const ALL = [...PRIORITY_A, ...PRIORITY_B, ...PRIORITY_C, ...PRIORITY_D];

function classifyCase(entry, diag) {
  const id = entry.case.id;
  const status = entry.overall.status;
  const reason = entry.overall.reason;
  const answer = entry.answerPreview || "";
  const extractKind = entry.evidenceUsed?.extractKind ?? diag?.extractProvenance?.kind ?? null;
  const extractApplied = entry.evidenceUsed?.contextualExtractApplied ?? diag?.extractProvenance?.applied;
  const rejectReason = diag?.ragTrace?.llm?.contextualExtract?.rejectReason ?? null;

  if (PRIORITY_A.includes(id)) {
    if (status === "fail" && /не указан/i.test(answer)) {
      if (rejectReason === "should_not_replace" && /220/.test(diag?.ragTrace?.llm?.contextualExtract?.extractPreview || "")) {
        return {
          rootCause: "POSTPROCESSING_FAILURE",
          detail:
            "mains_power extract produced ± tolerances not in PDF grounding context; post-gate validation failed → MODEL_PARAM_NOT_SPECIFIED",
          confidence: "high",
          fixJustified: true,
        };
      }
    }
  }

  if (status === "pass") {
    return { rootCause: "N/A_PASS", detail: "Already passing at Task 35 baseline", confidence: "high", fixJustified: false };
  }

  if (reason === "abstention") {
    return { rootCause: "ABSTENTION_POLICY_OR_GATE", detail: answer.slice(0, 120), confidence: "medium", fixJustified: false };
  }

  if (reason === "factual" && extractKind && !extractApplied) {
    return { rootCause: "EXTRACT_SELECTION_FAILURE", detail: rejectReason || "extract not applied", confidence: "medium", fixJustified: false };
  }

  if (reason === "factual" && !extractKind) {
    return { rootCause: "EXTRACT_ROUTING_FAILURE", detail: "no extract kind in trace", confidence: "low", fixJustified: false };
  }

  return { rootCause: "INSUFFICIENT_TRACE", detail: reason, confidence: "low", fixJustified: false };
}

const report = JSON.parse(fs.readFileSync(REPORT, "utf8"));
const byId = Object.fromEntries(report.caseResults.map((r) => [r.case.id, r]));
const diag = report.diagnosticsByCaseId || {};

const cases = ALL.map((id) => {
  const entry = byId[id];
  if (!entry) {
    return { caseId: id, baselineStatus: "missing", classification: { rootCause: "INSUFFICIENT_TRACE" } };
  }
  const classification = classifyCase(entry, diag[id] || null);
  return {
    caseId: id,
    baselineStatus: entry.overall.status,
    baselineReason: entry.overall.reason,
    expectedMode: entry.case.expectedOutcome?.mode,
    answerPreview: entry.answerPreview,
    extractKind: entry.evidenceUsed?.extractKind ?? null,
    extractRejectReason: diag[id]?.ragTrace?.llm?.contextualExtract?.rejectReason ?? null,
    classification,
    traceRef: `logs/baseline-task35/task28-generalization-http-v12/report.json diagnosticsByCaseId.${id}`,
  };
});

const out = {
  task: 36,
  sourceReport: "logs/baseline-task35/task28-generalization-http-v12/report.json",
  generatedAt: new Date().toISOString(),
  priorityGroups: { A: PRIORITY_A, B: PRIORITY_B, C: PRIORITY_C, D: PRIORITY_D },
  cases,
  confirmedFixTask36: {
    id: "gen.num.voltage/gen.num.freq",
    rootCause: "POSTPROCESSING_FAILURE",
    mechanism:
      "extractMainsPowerAnswer emitted ±10%/±0,4 Гц from golden table; PDF chunk 2.2.1.3 has only «220 В, частотой 50 Гц»; validateSdb1560mAnswerAgainstContext grounding_numeric_fail; resolveAbstainAnswer → MODEL_PARAM",
    fix: "emit tolerances only when present in extract corpus; simplified 220 V / 50 Гц otherwise",
  },
};

const outDir = path.join(__dirname, "..", "logs", "baseline-task36");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "task36-case-analysis.json"), JSON.stringify(out, null, 2));
console.log("Wrote logs/baseline-task36/task36-case-analysis.json", cases.length, "cases");
