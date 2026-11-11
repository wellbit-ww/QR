/**
 * Build logs/baseline-task32/grounding-failure-analysis.md from Task 31 HTTP report.
 */
const fs = require("fs");
const path = require("path");

const REPORT = path.join(
  __dirname,
  "..",
  "logs",
  "baseline-task31",
  "task27-regression-http-verified-v2",
  "report.json",
);
const OUT = path.join(__dirname, "..", "logs", "baseline-task32", "grounding-failure-analysis.md");

const TARGET_IDS = [
  "exp.num.mass.direct",
  "exp.num.pwr-storage-8",
  "exp.num.pwr-dry-base-40",
  "exp.num.pwr-regen-540",
  "exp.num.shelf-load-100",
  "exp.multi.mass-and-width",
  "exp.para.dry-no-options",
  "exp.maint.desicc-36mo",
  "exp.leak.mass-180",
  "exp.num.pwr-storage-with-opt-810",
  "exp.num.n2-timer-99",
];

const CLASSIFICATION = {
  "exp.num.mass.direct": "grounding matcher limitation (joined-chunk alternate-numeric false conflict)",
  "exp.num.pwr-storage-8": "grounding matcher limitation",
  "exp.num.pwr-dry-base-40": "grounding matcher limitation",
  "exp.num.pwr-regen-540": "grounding matcher limitation",
  "exp.num.shelf-load-100": "grounding matcher limitation",
  "exp.multi.mass-and-width": "grounding matcher limitation",
  "exp.para.dry-no-options": "grounding matcher limitation",
  "exp.maint.desicc-36mo": "grounding matcher limitation",
  "exp.leak.mass-180": "grounding matcher limitation",
  "exp.num.pwr-storage-with-opt-810": "grounding matcher limitation",
  "exp.num.n2-timer-99": "evaluator defect (ASCII decimal in claimPattern vs comma in answer/chunks)",
};

function main() {
  const report = JSON.parse(fs.readFileSync(REPORT, "utf8"));
  const lines = [
    "# Task 32 — Task 31 grounding failure analysis (Stage A)",
    "",
    `Source: \`${REPORT}\``,
    "",
    "Task 31 activated grounding on prompt chunk bodies. Failures below had **factual pass** except N2 timer.",
    "",
  ];
  for (const id of TARGET_IDS) {
    const row = report.caseResults.find((r) => r.case.id === id);
    if (!row) {
      lines.push(`## ${id}`, "", "_missing in report_", "");
      continue;
    }
    lines.push(`## ${id}`);
    lines.push("");
    lines.push(`- **Question:** ${row.case.message}`);
    lines.push(`- **Answer preview:** ${row.answerPreview || "—"}`);
    lines.push(`- **Factual:** ${row.layers.factual?.status} — ${row.layers.factual?.detail || ""}`);
    lines.push(`- **Grounding (Task 31):** ${row.layers.grounding?.status} — ${row.layers.grounding?.detail || ""}`);
    lines.push(`- **chunkTextCount:** ${row.evidenceUsed?.chunkTextCount ?? row.layers._chunkTextCount ?? "?"}`);
    lines.push(`- **extractKind:** ${row.evidenceUsed?.extractKind ?? "—"}`);
    lines.push(`- **Classification:** ${CLASSIFICATION[id] || "TBD"}`);
    lines.push("");
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, lines.join("\n"), "utf8");
  console.log("Wrote", OUT);
}

main();
