#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const OUT = __dirname;
const inv = JSON.parse(fs.readFileSync(path.join(OUT, "task41-inventory.json"), "utf8"));
const fin = JSON.parse(fs.readFileSync(path.join(OUT, "task41-final-classifications.json"), "utf8"));
const hist = JSON.parse(fs.readFileSync(path.join(OUT, "historical-regression.json"), "utf8"));
const clusters = JSON.parse(fs.readFileSync(path.join(OUT, "failure-clusters.json"), "utf8"));
const repo = JSON.parse(fs.readFileSync(path.join(OUT, "repo-metadata.json"), "utf8"));

const failMap = new Map(inv.failures.map((f) => [f.caseId, f]));
const failIds = inv.failures.map((f) => f.caseId).sort();

function mdEscape(s) {
  return String(s || "").replace(/\|/g, "\\|");
}

let invMd = `# Task 41 — Failure inventory (Task 40 Task 28 baseline)\n\n`;
invMd += `**Branch:** \`${repo.branch}\` · **HEAD:** \`${repo.head}\` (dirty ${repo.dirtyLineCount} lines)\n\n`;
invMd += `**Source:** \`${repo.authoritativeReport}\`\n\n`;
invMd += `**Verified summary:** total ${repo.verifiedSummary.total}, pass ${repo.verifiedSummary.pass}, **fail ${repo.verifiedSummary.fail}**, not_evaluable ${repo.verifiedSummary.not_evaluable}, infra ${repo.verifiedSummary.infrastructure_error}, leakage **${repo.crossModelLeakage.numerator}/${repo.crossModelLeakage.denominator}**.\n\n`;
invMd += `Full machine records: \`logs/baseline-task41/task41-inventory.json\`.\n\n---\n\n`;

for (const id of failIds) {
  const f = failMap.get(id);
  const cls = fin.byCaseId[id];
  invMd += `## ${id}\n\n`;
  invMd += `- **Primary (${cls.code}):** ${fin.labels[cls.code]} — ${cls.note} *(confidence: ${cls.confidence})*\n`;
  invMd += `- **Question:** ${mdEscape(f.question)}\n`;
  invMd += `- **Expected mode:** ${f.expectedMode}\n`;
  invMd += `- **Required facts:** ${(f.requiredFacts || []).map((r) => r.claimPattern).join(", ") || "—"}\n`;
  invMd += `- **Failing layer:** ${f.failingLayer}\n`;
  if (f.factualLayer?.missing?.length) {
    invMd += `- **Missing/contradicted:** ${f.factualLayer.missing.map((m) => `${m.claimPattern} (${m.reason || m.status})`).join("; ")}\n`;
  }
  if (f.groundingLayer?.status === "fail") {
    invMd += `- **Grounding (co-fail):** ${f.groundingLayer.detail}\n`;
  }
  invMd += `- **Answer preview:** ${mdEscape(f.answerPreview)}\n`;
  if (f.router) {
    invMd += `- **Router:** intent=${f.router.intent}, route=${f.router.route}, mode=${f.router.retrievalMode}\n`;
  }
  if (f.contextualExtractTrace) {
    invMd += `- **Contextual extract:** kind=${f.contextualExtractTrace.kind}, applied=${f.contextualExtractTrace.applied}, reject=${f.contextualExtractTrace.rejectReason || "—"}\n`;
  }
  invMd += `- **Chunks in diagnostics:** ${f.chunkTextCount ?? "unavailable"}\n`;
  invMd += `- **Top sources:** ${(f.sourceDocs || []).slice(0, 5).join(", ") || "—"}\n\n`;
}

fs.writeFileSync(path.join(OUT, "failure-inventory.md"), invMd, "utf8");

let rc = `# Task 41 — Root-cause analysis\n\n`;
rc += `Evidence from \`report.json\`, \`eval-rag-diagnostics.jsonl\`, and auditor review (\`task41-final-classifications.json\`).\n\n`;
rc += `## Primary distribution (36 fails)\n\n`;
rc += `| Code | Label | Count |\n|------|-------|------:|\n`;
for (const [code, n] of Object.entries(fin.counts)) {
  rc += `| ${code} | ${fin.labels[code]} | ${n} |\n`;
}
rc += `\n**Sum:** 36. **True grounding-only (factual pass, grounding fail):** 0.\n\n`;
rc += `## Cross-cutting themes\n\n`;
for (const [cid, c] of Object.entries(clusters.clusters)) {
  rc += `### ${cid}\n\n${c.title} (**${c.count}**): ${c.caseIds.join(", ")}\n\n`;
}
rc += `### Unclustered\n\n${(clusters.unclusteredFailIds || []).join(", ") || "none"}\n\n`;
rc += `## Historical regression\n\n`;
rc += `- Improved Task 39→40: **${hist.improvedTask39ToTask40.join(", ")}** (RH above30; not in remaining 36).\n`;
rc += `- Regressed Task 39→40 among current fails: **none**.\n`;
rc += `- Regained fail after Task 33 pass: **${hist.persistentSinceTask33.regainedFailAfterTask33Pass.join(", ")}**.\n`;
rc += `- Persistent fail since Task 33: **${hist.persistentSinceTask33.count}/36**.\n\n`;
rc += `Task 28 pass trajectory: 54 (T30) → 51 (T32, 3 infra) → 55 (T33) → 69 (T39) → **70 (T40)**.\n`;

fs.writeFileSync(path.join(OUT, "root-cause-analysis.md"), rc, "utf8");

let road = `# Task 41 — Improvement roadmap (implementation proposals only)\n\n`;
road += `No changes applied in Task 41. Protected baselines: T27 32/32, Priority B 10/10, T28 ≥70/110, leakage 0/20, infra 0.\n\n`;
road += `## Ranked tasks\n\n`;
road += `### Task 42 (P0) — Spurious abstain recovery on must_answer\n\n`;
road += `- **Problem:** ${fin.counts.D} synthesis failures dominated by abstain-like answers while golden/PDF chunks are in prompt (see cluster \`spurious_abstain\`).\n`;
road += `- **Cases:** ${clusters.clusters.spurious_abstain?.caseIds.join(", ")}\n`;
road += `- **Modules:** \`src/rag/honest-contextual-extract.js\`, \`src/rag/synthesis/sdb1560-grounding-contract.js\`, \`src/rag/sdb1560m-post-gate.js\`\n`;
road += `- **Approach:** Expand early-extract kinds for kit/maintenance/paraphrase; tighten \`priorAnswerFullyAnswersQuery\` to reject context-deferral phrases when extract corpus contains table rows.\n`;
road += `- **Expected gain:** +8–12 on T28 if stable HTTP.\n`;
road += `- **Regression:** T27, Priority B, power smoke; watch for leakage on foreign model.\n\n`;
road += `### Task 43 (P0) — must_abstain wording alignment\n\n`;
road += `- **Problem:** 6× \`overall.reason=abstention\` — substantive or non-allowed abstain phrasing.\n`;
road += `- **Cases:** ${Object.keys(fin.byCaseId).filter((k) => fin.byCaseId[k].code === "F").join(", ")}\n`;
road += `- **Modules:** \`src/rag/sdb1560m-chat-gate.js\`, \`src/rag/guardrails/guardrail-engine.js\`, prompts.\n`;
road += `- **Approach:** Route \`gen.unsup.*\` / \`gen.insuf.*\` through unsupported-spec gate before LLM; normalize answers to \`MODEL_PARAM_NOT_SPECIFIED\` phrasing in dataset allowed patterns.\n`;
road += `- **Expected gain:** +4–6 must_abstain passes.\n\n`;
road += `### Task 44 (P1) — Environmental + RAL retrieval cards\n\n`;
road += `- **Cases:** gen.env.pressure-*, gen.num.ral, gen.std.esd\n`;
road += `- **Modules:** \`knowledge/sdb1560m/retrieval-cards/\`, \`src/rag/retrieval/unified-retriever.js\`\n`;
road += `- **Approach:** Dedicated cards for §1.1.2.8 pressure, RAL 7035, ESD; lexical boost for kPa/mmHg/бар.\n`;
road += `- **Expected gain:** +4–7.\n\n`;
road += `### Task 45 (P1) — RH setpoint below-30 routing (mirror Task 40 above-30)\n\n`;
road += `- **Cases:** gen.rh.rule-below30, secondary gen.num.rh-range-high, gen.num.rh-accuracy\n`;
road += `- **Modules:** \`src/rag/router/query-router.js\`, \`knowledge/.../setpoint-vs-ambient.md\`, contextual extract.\n\n`;
road += `### Task 46 (P1) — Cross-model TTX chunk demotion\n\n`;
road += `- **Cases:** ${clusters.clusters.cross_model_ttx_chunks?.caseIds.join(", ")}\n`;
road += `- **Modules:** \`src/rag/rerank.js\`, index metadata filter for \`SDB1560M\` row chunks vs \`SDB1106NM\` artifact rows.\n\n`;
road += `### Task 47 (P2) — Comparative power evaluator (document-only unless product accepts)\n\n`;
road += `- **Cases:** gen.disc.storage-vs-dry, gen.disc.810-storage-vs-dry\n`;
road += `- **Note:** Answers may be technically correct; Task 39 dual-W logic does not cover all comparative patterns — **dataset/evaluator** change requires explicit approval.\n\n`;
road += `### Task 48 (P2) — LCD symbol + procedure extracts\n\n`;
road += `- **Cases:** gen.proc.open-door-symbol, gen.proc.fan-symbol, gen.ind.green-only-storage\n`;
road += `- **Modules:** new retrieval cards for LCD legend §; procedure contextual extract kinds.\n\n`;
road += `### Task 49 (P2) — Single-field power gaps\n\n`;
road += `- **Cases:** gen.num.pwr-regen, gen.kit.shelves-perf, gen.opt.feeder-basket-*, gen.kit.power-cord\n`;
road += `- **Modules:** contextual extract kinds \`power_regen\`, \`kit_*\`, deterministic slices.\n\n`;
road += `## Safest sequence\n\n1. Task 43 (abstain — low regression risk on must_answer numerics). 2. Task 42 (largest pass-count upside). 3. Task 46 (cross-model demotion). 4. Task 44 env cards. 5. Task 45 RH below30. 6. Task 48 symbols. 7. Task 49 singles. 8. Task 47 only after stakeholder sign-off.\n`;

fs.writeFileSync(path.join(OUT, "improvement-roadmap.md"), road, "utf8");

// Update failure-clusters.json with final counts
clusters.primaryClassificationCountsFinal = fin.counts;
clusters.finalClassificationsRef = "logs/baseline-task41/task41-final-classifications.json";
clusters.historicalRegressionRef = "logs/baseline-task41/historical-regression.json";
fs.writeFileSync(path.join(OUT, "failure-clusters.json"), JSON.stringify(clusters, null, 2));

console.log("Wrote failure-inventory.md, root-cause-analysis.md, improvement-roadmap.md");
