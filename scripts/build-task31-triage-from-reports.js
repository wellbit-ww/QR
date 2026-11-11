#!/usr/bin/env node
/**
 * Build Task 31 case triage markdown from Task 30 HTTP artifacts.
 */
const fs = require("fs");
const path = require("path");

const T27 = path.join(__dirname, "..", "logs", "baseline-task30", "task27-regression-http-verified-v2-r2", "report.json");
const T28 = path.join(__dirname, "..", "logs", "baseline-task30", "task28-generalization-http-v1", "report.json");
const DIAG = path.join(__dirname, "..", "logs", "baseline-task30", "task28-generalization-http-v1", "eval-rag-diagnostics.jsonl");
const OUT = path.join(__dirname, "..", "logs", "baseline-task31", "task30-case-triage.md");

function loadDiag() {
  const map = {};
  if (!fs.existsSync(DIAG)) {
    return map;
  }
  for (const line of fs.readFileSync(DIAG, "utf8").split(/\n/)) {
    if (!line.trim()) continue;
    try {
      const j = JSON.parse(line);
      map[j.caseId] = j;
    } catch (_e) {
      /* skip */
    }
  }
  return map;
}

function layerFailReason(cr) {
  const o = cr.overall || {};
  const layers = cr.layers || {};
  if (o.status === "pass") return "—";
  const parts = [o.reason || o.status];
  if (layers.factual?.status === "fail") {
    parts.push(`factual: ${layers.factual.detail || ""} ${JSON.stringify(layers.factual.missing || layers.factual.matches || "")}`.slice(0, 120));
  }
  if (layers.forbiddenLeakage?.status === "fail") {
    parts.push(`leakage: ${JSON.stringify(layers.forbiddenLeakage.matches || [])}`);
  }
  if (layers.abstention?.status === "fail") {
    parts.push(`abstention: ${layers.abstention.detail || ""}`);
  }
  return parts.join("; ");
}

function diagSummary(id, diag) {
  if (!diag) return "no diagnostics row";
  const rt = diag.ragTrace || {};
  const route = rt.router?.route || diag.retrieval?.route || "?";
  const extract = rt.llm?.contextualExtract?.kind || "—";
  const chunks = rt.retrieval?.promptChunkSummaries?.length ?? 0;
  const src = (diag.sources || []).map((s) => s.sourceDoc).filter(Boolean).slice(0, 2).join(", ");
  return `route=${route}; extractKind=${extract}; promptChunkTrace=${chunks}; sources=${src || "?"}`;
}

function classifyFailure(cr) {
  const mode = cr.case?.expectedOutcome?.mode;
  const ans = String(cr.answerPreview || "");
  if (cr.layers?.forbiddenLeakage?.status === "fail") {
    if (cr.case?.id === "gen.disc.storage-vs-dry") {
      return { layer: "evaluator/dataset", note: "Correct comparative answer; forbidden «8» matched legitimate 8 W (question asks 8 vs 40)", conf: "high" };
    }
    return { layer: "forbiddenLeakage", note: "Forbidden pattern in answer", conf: "medium" };
  }
  if (mode === "must_abstain" && cr.layers?.abstention?.status === "fail") {
    if (/не указан|отсутств/i.test(ans)) return { layer: "evaluator (historical pattern)", note: "Abstain-like wording", conf: "low" };
    return { layer: "RAG policy/synthesis", note: "Substantive or wrong-model answer", conf: "medium" };
  }
  if (cr.layers?.factual?.status === "fail") {
    if (/не указан|параметр не указан/i.test(ans)) return { layer: "over-abstention", note: "Manual likely has fact", conf: "medium" };
    if (cr.case?.id === "exp.num.n2-timer-99") {
      return { layer: "LLM rounding + extract not applied", note: "Answer «99 мин» without .9; extractKind null in trace", conf: "high" };
    }
    return { layer: "factual/synthesis", note: "Missing required claim", conf: "medium" };
  }
  return { layer: "unknown", note: "", conf: "low" };
}

function row(cr, diag, priority) {
  const c = cr.case;
  const cl = classifyFailure(cr);
  return `| ${priority} | \`${c.id}\` | ${modeLabel(c)} | ${esc(cr.answerPreview?.slice(0, 100))} | ${esc(layerFailReason(cr))} | ${esc(diagSummary(c.id, diag))} | ${esc(cl.layer)} | ${cl.conf} | ${esc(cl.note)} |`;
}

function modeLabel(c) {
  return c.expectedOutcome?.mode === "must_abstain" ? "must_abstain" : "must_answer";
}

function esc(s) {
  return String(s || "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function main() {
  const t27 = JSON.parse(fs.readFileSync(T27, "utf8"));
  const t28 = JSON.parse(fs.readFileSync(T28, "utf8"));
  const diag = loadDiag();

  const lines = [
    "# Task 31 — Task 30 HTTP case triage",
    "",
    "Sources:",
    `- Task 27: \`${T27}\``,
    `- Task 28: \`${T28}\``,
    `- Diagnostics: \`${DIAG}\``,
    "",
    "## 1. Task 27 regression failure",
    "",
    "| P | Case | Mode | Answer (preview) | Evaluator | Diagnostics | Likely layer | Conf | Notes |",
    "|---|------|------|------------------|-----------|---------------|--------------|------|-------|",
  ];

  for (const cr of t27.caseResults) {
    if (cr.overall?.status !== "pass") {
      lines.push(row(cr, diag[cr.case.id] || t27.diagnosticsByCaseId?.[cr.case.id], 1));
    }
  }

  lines.push("", "## 2. Cross-model leakage (Task 28)", "");
  const leak = t28.caseResults.filter((cr) => cr.layers?.forbiddenLeakage?.status === "fail");
  lines.push("| P | Case | Mode | Answer (preview) | Evaluator | Diagnostics | Likely layer | Conf | Notes |");
  lines.push("|---|------|------|------------------|-----------|---------------|--------------|------|-------|");
  for (const cr of leak) {
    lines.push(row(cr, diag[cr.case.id], 1));
  }

  lines.push("", "## 3. Failed must_abstain (8)", "");
  lines.push("| P | Case | Mode | Answer (preview) | Evaluator | Diagnostics | Likely layer | Conf | Notes |");
  lines.push("|---|------|------|------------------|-----------|---------------|--------------|------|-------|");
  let p = 1;
  for (const cr of t28.caseResults) {
    if (cr.case?.expectedOutcome?.mode === "must_abstain" && cr.overall?.status === "fail") {
      lines.push(row(cr, diag[cr.case.id], p++));
    }
  }

  lines.push("", "## 4. Failed must_answer (44)", "");
  lines.push("_Full list; prioritize N2 / door / mass in Task 31 fixes._", "");
  lines.push("| P | Case | Mode | Answer (preview) | Evaluator | Diagnostics | Likely layer | Conf | Notes |");
  lines.push("|---|------|------|------------------|-----------|---------------|--------------|------|-------|");
  p = 1;
  for (const cr of t28.caseResults) {
    if (cr.case?.expectedOutcome?.mode === "must_answer" && cr.overall?.status === "fail") {
      lines.push(row(cr, diag[cr.case.id], p++));
    }
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, lines.join("\n"), "utf8");
  console.log("Wrote", OUT);
}

main();
