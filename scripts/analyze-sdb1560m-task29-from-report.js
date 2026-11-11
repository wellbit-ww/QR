#!/usr/bin/env node
/**
 * Task 29 — recompute Task 28 metrics and export per-case audit from report.json.
 * Usage: node scripts/analyze-sdb1560m-task29-from-report.js [reportPath] [outJson]
 */
const fs = require("fs");
const path = require("path");
const { computeMetrics } = require("./sdb1560m-eval-runner-lib");

const reportPath =
  process.argv[2] ||
  path.join(__dirname, "..", "logs", "baseline-task28", "http-verified-20261102-v3", "report.json");
const outPath =
  process.argv[3] ||
  path.join(__dirname, "..", "logs", "baseline-task29", "task28-v3-case-audit.json");

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const cases = report.caseResults;

function byMode(mode) {
  return cases.filter((r) => r.case.expectedOutcome?.mode === mode);
}

const mustAnswer = byMode("must_answer");
const mustAbstain = byMode("must_abstain");

const maPass = mustAnswer.filter((r) => r.overall.status === "pass");
const maFail = mustAnswer.filter((r) => r.overall.status === "fail");
const maNE = mustAnswer.filter((r) => r.overall.status === "not_evaluable");
const maInfra = mustAnswer.filter((r) => r.overall.status === "infrastructure_error");

const abPass = mustAbstain.filter((r) => r.overall.status === "pass");
const abFail = mustAbstain.filter((r) => r.overall.status === "fail");

const metrics = computeMetrics(cases);

const rows = cases.map((r) => ({
  id: r.case.id,
  category: r.case.category,
  mode: r.case.expectedOutcome?.mode,
  message: r.case.message,
  overall: r.overall,
  factual: r.layers?.factual,
  abstention: r.layers?.abstention,
  leakage: r.layers?.forbiddenLeakage,
  retrieval: r.layers?.retrieval,
  answerPreview: r.answerPreview,
  evidenceUsed: r.evidenceUsed || null,
  checksExecuted: r.checksExecuted,
}));

const abstainFails = rows.filter(
  (x) => x.mode === "must_abstain" && x.overall.status === "fail",
);
const alarmFails = rows.filter(
  (x) => x.category === "alarm_troubleshooting" && x.overall.status === "fail",
);
const n2Fails = rows.filter(
  (x) => x.id.startsWith("gen.opt.n2") && x.overall.status === "fail",
);

const audit = {
  reportPath,
  capturedAt: report.manifest?.capturedAt,
  recomputed: {
    total: cases.length,
    overallPass: cases.filter((r) => r.overall.status === "pass").length,
    overallFail: cases.filter((r) => r.overall.status === "fail").length,
    notEvaluable: cases.filter((r) => r.overall.status === "not_evaluable").length,
    infra: cases.filter((r) => r.overall.status === "infrastructure_error").length,
    mustAnswer: {
      total: mustAnswer.length,
      pass: maPass.length,
      fail: maFail.length,
      notEvaluable: maNE.length,
      infra: maInfra.length,
      note: "41/49 in Task 28 text = pass/fail counts, not a fraction; 41+49+3=93",
    },
    mustAbstain: { total: mustAbstain.length, pass: abPass.length, fail: abFail.length },
    metricsFromLib: metrics,
  },
  abstainFailIds: abstainFails.map((x) => x.id),
  alarmFailIds: alarmFails.map((x) => x.id),
  n2FailIds: n2Fails.map((x) => x.id),
  rows,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(audit, null, 2), "utf8");
console.log(JSON.stringify(audit.recomputed, null, 2));
console.log("wrote", outPath);
