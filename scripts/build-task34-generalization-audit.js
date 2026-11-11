#!/usr/bin/env node
/**
 * Task 34 — read-only generalization failure audit from Task 33 HTTP artifacts.
 * Does not modify RAG, evaluator, or datasets.
 */
const fs = require("fs");
const path = require("path");

const REPORT_PATH = path.join(
  __dirname,
  "..",
  "logs",
  "baseline-task33",
  "task28-generalization-http-v9",
  "report.json",
);
const DIAG_PATH = path.join(
  __dirname,
  "..",
  "logs",
  "baseline-task33",
  "task28-generalization-http-v9",
  "eval-rag-diagnostics.jsonl",
);
const OUT_CLASS = path.join(__dirname, "..", "logs", "baseline-task34", "task28-failure-classification.json");
const OUT_PLAN = path.join(__dirname, "..", "logs", "baseline-task34", "task35-priority-plan.json");

const lib = require("./sdb1560m-eval-runner-lib");

const ROOT_CAUSE_LABELS = {
  A: "Retrieval failure",
  B: "Contextual extract failure",
  C: "Generation / interpretation failure",
  D: "Abstention / unsupported-spec failure",
  E: "Grounding evaluator issue",
  F: "Factual evaluator / dataset issue",
  G: "Documentation gap",
  H: "Insufficient observability",
};

function loadDiagnostics() {
  const map = new Map();
  if (!fs.existsSync(DIAG_PATH)) {
    return map;
  }
  for (const line of fs.readFileSync(DIAG_PATH, "utf8").split(/\n/)) {
    const t = line.trim();
    if (!t) {
      continue;
    }
    try {
      const j = JSON.parse(t);
      if (j.caseId) {
        map.set(j.caseId, j);
      }
    } catch (_e) {
      /* skip bad line */
    }
  }
  return map;
}

function snippetHaystack(diag) {
  if (!diag?.sources?.length) {
    return "";
  }
  return diag.sources.map((s) => String(s.snippet || "")).join("\n");
}

function requiredFactInSnippetHaystack(caseNorm, hay) {
  if (!hay.trim() || !caseNorm.requiredFacts?.length) {
    return { any: false, perFact: [] };
  }
  const perFact = [];
  for (const rf of caseNorm.requiredFacts) {
    const r = lib.evaluateRequiredFact(rf, hay, { forbiddenClaims: [] });
    perFact.push({ claimPattern: rf.claimPattern, status: r.status, reason: r.reason || r.detail });
  }
  return { any: perFact.some((p) => p.status === "pass"), perFact };
}

function isSubstantiveAnswer(answer) {
  return lib.hasSubstantiveClaimBeyondAbstain(answer);
}

function classifyMustAbstain(row, diag) {
  const c = lib.normalizeCase(row.case);
  const answer = String(row.answerPreview || "");
  const abst = row.layers.abstention;
  const match = lib.answerMatchesAllowedAbstain(c, answer);
  const evidence = [];
  let primary = "D";
  let secondary = null;
  let confidence = "high";
  let priority = "P1";
  let recommendedFix = "RAG: enforce unsupported/abstain phrasing for this query class";

  if (match.ok) {
    evidence.push("allowed abstain pattern matched");
    if (isSubstantiveAnswer(answer)) {
      primary = "D";
      secondary = "substantive_claim_with_abstain_wording";
      priority = "P0";
      recommendedFix = "RAG guardrail: strip substantive claims on must_abstain topics";
    } else {
      primary = "F";
      secondary = "evaluator_or_dataset";
      confidence = "medium";
      recommendedFix = "Review abstentionRules patterns vs answer wording (diagnostic only)";
    }
  } else if (match.configError) {
    primary = "F";
    confidence = "high";
    recommendedFix = "Dataset abstentionRules config error";
  } else if (isSubstantiveAnswer(answer)) {
    primary = "D";
    secondary = "hallucination_or_unsupported_answer";
    priority = "P0";
    confidence = "high";
    evidence.push("substantive claim in answer; abstain patterns not matched");
    recommendedFix = "RAG: route to unsupported-spec or STRICT_ABSTAIN before LLM numeric claims";
  } else if (/не\s+предоставлен|контекст|данном\s+контекст/i.test(answer)) {
    primary = "D";
    secondary = "abstain_wording_not_in_allowed_patterns";
    confidence = "high";
    evidence.push("soft abstain phrasing not matching allowedAbstainPatterns");
    recommendedFix = "Align generation with MODEL_PARAM_NOT_SPECIFIED / allowed patterns";
  } else {
    primary = "D";
    secondary = "empty_or_unrecognized_abstain";
    confidence = "medium";
  }

  const unsupportedGate = /прошив|wifi|mqtt|modbus|api|процессор|bluetooth/i.test(c.message);
  if (unsupportedGate && primary === "D" && secondary === "hallucination_or_unsupported_answer") {
    evidence.push("query matches unsupported-spec themes; gate may not have fired");
    recommendedFix = "Verify sdb1560m-chat-gate / direct-facts for this message shape";
  }

  if (diag?.chunkTextCount > 0) {
    evidence.push(`chunkTextCount=${diag.chunkTextCount}`);
  }

  return {
    primaryRootCause: primary,
    secondaryRootCause: secondary,
    confidence,
    priority,
    recommendedFix,
    evidence,
  };
}

function classifyFailureRow(row, diag) {
  const c = lib.normalizeCase(row.case);
  const answer = String(row.answerPreview || "");
  const mode = c.expectedOutcome.mode;
  const overall = row.overall;
  const factual = row.layers.factual || {};
  const grounding = row.layers.grounding || {};
  const forbidden = row.layers.forbiddenLeakage || {};
  const hay = snippetHaystack(diag);
  const factInSnippet = requiredFactInSnippetHaystack(c, hay);
  const chunkCount = diag?.chunkTextCount ?? row.evidenceUsed?.chunkTextCount ?? 0;
  const extractKind = row.evidenceUsed?.extractKind ?? null;
  const cx = diag?.ragTrace?.llm?.contextualExtract;
  const evidence = [];
  let primary = "unknown";
  let secondary = null;
  let confidence = "medium";
  let priority = "P2";
  let recommendedFix = "Task 35: investigate with full chunk bodies (snippets truncated to 200 chars in diagnostics)";

  if (mode === "must_abstain") {
    const ab = classifyMustAbstain(row, diag);
    return { ...ab, documentationReference: c.notes || null };
  }

  if (overall.status === "not_evaluable") {
    primary = "H";
    if (overall.reason === "factual_heuristic_limit") {
      primary = "F";
      secondary = "unsafe_or_ambiguous_claimPattern";
      confidence = "high";
      recommendedFix = "Document evaluator limit; optional dataset clarification in future (not Task 34)";
    }
    evidence.push(`overall=${overall.reason}`);
    if (factual.missing) {
      evidence.push(`missing=${JSON.stringify(factual.missing.map((m) => m.claimPattern))}`);
    }
    return {
      primaryRootCause: primary,
      secondaryRootCause: secondary,
      confidence,
      priority: "P2",
      recommendedFix,
      evidence,
      documentationReference: c.requiredFacts?.[0]?.sourceHint || null,
    };
  }

  if (overall.reason === "grounding") {
    primary = "E";
    confidence = "high";
    priority = "P2";
    recommendedFix = "Reconcile grounding with evidence lines (evaluator layer)";
    evidence.push(grounding.detail || "grounding fail");
    if (factual.status === "pass") {
      evidence.push("factual pass — likely evaluator grounding heuristic");
    }
    return { primaryRootCause: primary, secondaryRootCause: secondary, confidence, priority, recommendedFix, evidence };
  }

  if (forbidden.status === "fail") {
    primary = "C";
    secondary = "cross_model_or_forbidden_numeric_in_answer";
    priority = "P0";
    confidence = "high";
    recommendedFix = "RAG: stronger model scoping / forbidden fact guard on answer";
    evidence.push(`forbidden matches: ${JSON.stringify(forbidden.matches || [])}`);
    return { primaryRootCause: primary, secondaryRootCause: secondary, confidence, priority, recommendedFix, evidence };
  }

  if (factual.status === "fail") {
    if (/abstain-like|empty answer/i.test(factual.detail || "")) {
      primary = "C";
      secondary = "spurious_abstain_on_must_answer";
      priority = "P1";
      recommendedFix = "RAG: honest extract or routing for numeric/paraphrase queries";
      evidence.push(factual.detail);
      if (grounding.status === "pass") {
        secondary = "spurious_abstain_despite_grounded_evidence";
        confidence = "high";
        evidence.push("grounding pass — required fact present in chunk evidence lines");
        primary = "C";
      } else if (factInSnippet.any) {
        secondary = "abstain_despite_snippet_evidence";
        evidence.push("required fact heuristic pass on diagnostic snippets (truncated)");
        confidence = "medium";
      } else if (chunkCount === 0) {
        primary = "H";
        secondary = "no_chunk_bodies";
        confidence = "high";
      } else if (!factInSnippet.any && grounding.status !== "pass") {
        evidence.push("required fact not found in diagnostic snippets");
        if (extractKind) {
          primary = "B";
          secondary = "extract_kind_present_but_answer_abstain";
        } else {
          primary = "A";
          secondary = "fact_not_in_snippet_haystack";
          confidence = "low";
          evidence.push("snippet-only check — confirm in full chunk text in Task 35");
        }
      }
    } else if (factual.missing?.length) {
      const missing = factual.missing;
      evidence.push(`missing facts: ${missing.map((m) => m.claimPattern).join(", ")}`);
      const allContradiction = missing.every((m) => m.reason === "contradiction");
      if (allContradiction && /8/.test(answer) && /40/.test(answer)) {
        primary = "F";
        secondary = "multi_numeric_W_evaluator_contradiction";
        priority = "P1";
        confidence = "high";
        recommendedFix =
          "Document comparative power answers (8 W storage + 40 W dry); evaluator treats second W as conflict (Task 35 — dataset or checker, not RAG)";
        evidence.push("answer states both 8 W and 40 W; factual fail reason=contradiction on 40");
      } else if (factInSnippet.any) {
        primary = "C";
        secondary = "answer_missing_asserted_fact";
        priority = "P1";
        recommendedFix = "RAG generation or extract to assert values present in context";
        if (!extractKind && /260|1202|540|8\s|40|99/.test(c.message)) {
          evidence.push("extractKind null — extract routing candidate");
        }
      } else {
        primary = chunkCount > 0 ? "A" : "H";
        secondary = "required_fact_not_in_retrieved_snippets";
        priority = "P1";
        recommendedFix = "Retrieval/rerank or retrieval cards for this intent";
        confidence = chunkCount > 0 ? "medium" : "high";
      }
      if (allContradiction && grounding.status === "fail") {
        primary = "E";
        secondary = "grounding_fail_on_comparative_power_row";
        if (/8/.test(answer) && /40/.test(answer)) {
          primary = "F";
          secondary = "multi_numeric_W_evaluator_contradiction";
        }
      }
      if (extractKind && primary === "A") {
        primary = "B";
        secondary = "extract_failed_or_wrong_kind";
        evidence.push(`extractKind=${extractKind}`);
      }
    } else {
      primary = "C";
      evidence.push(factual.detail || "factual fail");
    }
  } else if (overall.reason === "abstention") {
    primary = "D";
  } else {
    primary = "H";
    evidence.push(`unclassified overall.reason=${overall.reason}`);
  }

  if (cx?.applied) {
    evidence.push(`contextualExtract.applied=${cx.applied} kind=${cx.kind || ""}`);
  }
  if (chunkCount) {
    evidence.push(`chunkTextCount=${chunkCount}`);
  }

  return {
    primaryRootCause: primary,
    secondaryRootCause: secondary,
    confidence,
    priority,
    recommendedFix,
    evidence,
    documentationReference:
      c.requiredFacts?.[0]?.sourceHint || c.notes || (c.abstentionRules ? "must_abstain" : null),
  };
}

function buildCaseRecord(row, diag) {
  const c = row.case;
  const mode = c.expectedOutcome?.mode || "unknown";
  const classification =
    row.overall.status === "pass"
      ? null
      : classifyFailureRow(row, diag);

  return {
    caseId: c.id,
    category: c.category,
    expectedBehavior: mode,
    message: c.message,
    actualAnswer: row.answerPreview || "",
    overallStatus: row.overall.status,
    overallReason: row.overall.reason || null,
    factualResult: row.layers.factual?.status || null,
    factualDetail: row.layers.factual?.detail || null,
    factualMissing: row.layers.factual?.missing || null,
    groundingResult: row.layers.grounding?.status || null,
    groundingDetail: row.layers.grounding?.detail || null,
    leakageResult: row.layers.forbiddenLeakage?.status || null,
    abstentionResult: row.layers.abstention?.status || null,
    chunkTextCount: diag?.chunkTextCount ?? row.evidenceUsed?.chunkTextCount ?? null,
    sourceDocCount: diag?.sourceDocCount ?? null,
    sourceDocs: row.evidenceUsed?.sourceDocs?.slice(0, 8) || null,
    extractKind: row.evidenceUsed?.extractKind ?? diag?.ragTrace?.llm?.contextualExtract?.kind ?? null,
    contextualExtract: diag?.ragTrace?.llm?.contextualExtract
      ? {
          applied: diag.ragTrace.llm.contextualExtract.applied,
          kind: diag.ragTrace.llm.contextualExtract.kind,
          rejectReason: diag.ragTrace.llm.contextualExtract.rejectReason,
        }
      : null,
    ...(classification
      ? {
          primaryRootCause: classification.primaryRootCause,
          secondaryRootCause: classification.secondaryRootCause,
          evidence: classification.evidence,
          documentationReference: classification.documentationReference,
          confidence: classification.confidence,
          recommendedFix: classification.recommendedFix,
          priority: classification.priority,
        }
      : {}),
  };
}

function aggregatePriorityPlan(records) {
  const failed = records.filter((r) => r.overallStatus === "fail" || r.overallStatus === "not_evaluable");
  const groups = new Map();
  for (const r of failed) {
    const key = `${r.primaryRootCause}|${r.secondaryRootCause || ""}|${r.priority}`;
    if (!groups.has(key)) {
      groups.set(key, {
        primaryRootCause: r.primaryRootCause,
        primaryRootCauseLabel: ROOT_CAUSE_LABELS[r.primaryRootCause] || r.primaryRootCause,
        secondaryRootCause: r.secondaryRootCause,
        priority: r.priority,
        caseIds: [],
        recommendedFix: r.recommendedFix,
        confidenceNotes: new Set(),
      });
    }
    const g = groups.get(key);
    g.caseIds.push(r.caseId);
    g.confidenceNotes.add(r.confidence);
  }
  const tasks = [...groups.values()]
    .map((g) => ({
      ...g,
      caseCount: g.caseIds.length,
      confidenceNotes: [...g.confidenceNotes],
    }))
    .sort((a, b) => {
      const po = { P0: 0, P1: 1, P2: 2, P3: 3 };
      return (po[a.priority] ?? 9) - (po[b.priority] ?? 9) || b.caseCount - a.caseCount;
    });

  return {
    generatedFrom: REPORT_PATH,
    task35Candidates: tasks,
  };
}

function main() {
  const report = JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"));
  const diagMap = loadDiagnostics();
  const records = report.caseResults.map((row) => buildCaseRecord(row, diagMap.get(row.case.id)));

  const failed = records.filter((r) => r.overallStatus === "fail");
  const notEval = records.filter((r) => r.overallStatus === "not_evaluable");
  const abstain = records.filter((r) => r.expectedBehavior === "must_abstain");

  fs.mkdirSync(path.dirname(OUT_CLASS), { recursive: true });
  fs.writeFileSync(
    OUT_CLASS,
    JSON.stringify(
      {
        schemaVersion: "task34-v1",
        sourceReport: REPORT_PATH,
        sourceDiagnostics: DIAG_PATH,
        summary: {
          totalCases: records.length,
          pass: records.filter((r) => r.overallStatus === "pass").length,
          fail: failed.length,
          notEvaluable: notEval.length,
          mustAbstainPass: abstain.filter((r) => r.overallStatus === "pass").length,
          mustAbstainFail: abstain.filter((r) => r.overallStatus === "fail").length,
        },
        allCases: records,
        failuresAndNotEvaluable: records.filter(
          (r) => r.overallStatus === "fail" || r.overallStatus === "not_evaluable",
        ),
        mustAbstainCases: abstain,
      },
      null,
      2,
    ),
    "utf8",
  );

  const plan = aggregatePriorityPlan(records);
  fs.writeFileSync(OUT_PLAN, JSON.stringify(plan, null, 2), "utf8");

  const rootCounts = {};
  for (const r of failed.concat(notEval)) {
    const k = r.primaryRootCause || "unknown";
    rootCounts[k] = (rootCounts[k] || 0) + 1;
  }
  console.log("Wrote", OUT_CLASS);
  console.log("Wrote", OUT_PLAN);
  console.log("fail", failed.length, "not_evaluable", notEval.length);
  console.log("rootCause counts (fail+NE):", rootCounts);
  console.log("must_abstain", abstain.filter((r) => r.overallStatus === "pass").length + "/17 pass");
}

main();
