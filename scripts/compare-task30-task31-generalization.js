/**
 * Stage D — cases that passed Task 30 HTTP but failed Task 31 HTTP (generalization).
 */
const fs = require("fs");
const path = require("path");

const T30 = path.join(
  __dirname,
  "..",
  "logs",
  "baseline-task30",
  "task28-generalization-http-v1",
  "report.json",
);
const T31 = path.join(
  __dirname,
  "..",
  "logs",
  "baseline-task31",
  "task28-generalization-http-v1",
  "report.json",
);
const OUT = path.join(__dirname, "..", "logs", "baseline-task32", "task30-vs-task31-regressions.json");

function layerDelta(t30, t31) {
  const keys = ["factual", "grounding", "forbiddenLeakage", "abstention", "retrieval"];
  const d = {};
  for (const k of keys) {
    if (t30?.[k]?.status !== t31?.[k]?.status) {
      d[k] = { task30: t30?.[k]?.status, task31: t31?.[k]?.status };
    }
  }
  return d;
}

function main() {
  const r30 = JSON.parse(fs.readFileSync(T30, "utf8"));
  const r31 = JSON.parse(fs.readFileSync(T31, "utf8"));
  const by30 = new Map(r30.caseResults.map((r) => [r.case.id, r]));
  const regressions = [];
  for (const r31row of r31.caseResults) {
    const id = r31row.case.id;
    const r30row = by30.get(id);
    if (!r30row) {
      continue;
    }
    if (r30row.overall.status === "pass" && r31row.overall.status === "fail") {
      regressions.push({
        id,
        task30Reason: r30row.overall.reason,
        task31Reason: r31row.overall.reason,
        answerChanged: (r30row.answerPreview || "") !== (r31row.answerPreview || ""),
        layerDelta: layerDelta(r30row.layers, r31row.layers),
        task30Preview: (r30row.answerPreview || "").slice(0, 160),
        task31Preview: (r31row.answerPreview || "").slice(0, 160),
        task30ChunkCount: r30row.evidenceUsed?.chunkTextCount ?? 0,
        task31ChunkCount: r31row.evidenceUsed?.chunkTextCount ?? 0,
      });
    }
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ count: regressions.length, regressions }, null, 2), "utf8");
  console.log("Regressions:", regressions.length, "→", OUT);
}

main();
