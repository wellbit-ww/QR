#!/usr/bin/env node
/**
 * Task 41 — read-only failure triage from Task 40 Task 28 HTTP artifacts.
 * Outputs under logs/baseline-task41/ only. Does not modify RAG, evaluator, or datasets.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
const REPORT_T40 = path.join(ROOT, "logs", "baseline-task40", "task28-generalization-http", "report.json");
const DIAG_T40 = path.join(ROOT, "logs", "baseline-task40", "task28-generalization-http", "eval-rag-diagnostics.jsonl");
const OUT_DIR = __dirname;

const HISTORICAL = [
  { task: 30, path: path.join(ROOT, "logs", "baseline-task30", "task28-generalization-http-v1", "report.json") },
  { task: 32, path: path.join(ROOT, "logs", "baseline-task32", "task28-generalization-http-v8", "report.json") },
  { task: 33, path: path.join(ROOT, "logs", "baseline-task33", "task28-generalization-http-v9", "report.json") },
  { task: 39, path: path.join(ROOT, "logs", "baseline-task39", "task28-generalization-http", "report.json") },
];

const TASK41_LABELS = {
  A: "Retrieval failure",
  B: "Routing failure",
  C: "Contextual extraction failure",
  D: "Synthesis failure",
  E: "Grounding failure",
  F: "Abstention failure",
  G: "Evaluation/dataset defect",
  H: "Mixed/undetermined",
};

const lib = require(path.join(ROOT, "scripts", "sdb1560m-eval-runner-lib"));

/** Manual overrides after spot-check (audit-only, not production). */
const MANUAL_PRIMARY = {
  "gen.disc.storage-vs-dry": { code: "G", note: "Comparative power answer; eval may treat 8 W + 40 W as contradiction (Task 34 F); RAG answer can be technically correct", confidence: "medium" },
  "gen.disc.810-storage-vs-dry": { code: "G", note: "Same multi-W comparative pattern as storage-vs-dry", confidence: "medium" },
  "gen.num.ip55": { code: "G", note: "not_evaluable factual_heuristic_limit on IP55 pattern", confidence: "high" },
  "gen.para.ip": { code: "G", note: "not_evaluable factual_heuristic_limit", confidence: "high" },
  "gen.ind.red-door": { code: "G", note: "not_evaluable short claimPattern", confidence: "high" },
  "gen.sym.n2": { code: "G", note: "not_evaluable short claimPattern", confidence: "high" },
};

function gitMeta() {
  let branch = "unknown";
  let head = "unknown";
  let dirtyLines = null;
  try {
    branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
    head = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
    dirtyLines = execSync("git status --short", { cwd: ROOT, encoding: "utf8" }).split(/\n/).filter(Boolean).length;
  } catch (_e) {
    /* ignore */
  }
  return { branch, head, dirtyLineCount: dirtyLines };
}

function loadDiagnostics(filePath) {
  const map = new Map();
  if (!fs.existsSync(filePath)) return map;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      const j = JSON.parse(t);
      if (j.caseId) map.set(j.caseId, j);
    } catch (_e) {
      /* skip */
    }
  }
  return map;
}

function loadStatusMap(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const report = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const m = new Map();
  for (const row of report.caseResults || []) {
    m.set(row.case.id, {
      status: row.overall.status,
      reason: row.overall.reason,
    });
  }
  return { map: m, summary: report.summary || null, path: filePath };
}

function snippetHaystack(diag) {
  if (!diag?.sources?.length) return "";
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

function routingMismatch(diag, caseNorm) {
  const router = diag?.ragTrace?.router;
  if (!router) return { suspect: false, detail: "router unavailable" };
  const intent = router.intent;
  const route = router.route;
  const msg = String(caseNorm.message || "");
  const isTroubleshoot = /TROUBLESHOOT|SYMPTOM|REASONING/i.test(String(route || "")) && /TROUBLESHOOT/i.test(String(intent || ""));
  const isNumericSpec = caseNorm.category === "numeric_spec" || /^\s*gen\.num\./.test(caseNorm.id);
  const isUnsupported = caseNorm.expectedOutcome?.mode === "must_abstain";
  if (isNumericSpec && isTroubleshoot) {
    return { suspect: true, detail: `numeric_spec on troubleshooting route (intent=${intent}, route=${route})` };
  }
  if (isUnsupported && intent === "SINGLE_FIELD_QUERY" && isSubstantiveAnswer("")) {
    return { suspect: false, detail: null };
  }
  if (/must_abstain|gen\.unsup\.|gen\.insuf\./.test(caseNorm.id) && intent === "SINGLE_FIELD_QUERY") {
    return { suspect: true, detail: `unsupported query routed as SINGLE_FIELD_QUERY (intent=${intent})` };
  }
  return { suspect: false, detail: `intent=${intent} route=${route}` };
}

function classifyTask41(row, diag) {
  const manual = MANUAL_PRIMARY[row.case.id];
  if (manual) {
    return {
      primary: manual.code,
      secondary: "manual_audit_override",
      confidence: manual.confidence,
      evidence: [manual.note],
    };
  }

  const c = lib.normalizeCase(row.case);
  const answer = String(row.answerPreview || "");
  const overall = row.overall;
  const factual = row.layers?.factual || {};
  const grounding = row.layers?.grounding || {};
  const forbidden = row.layers?.forbiddenLeakage || {};
  const hay = snippetHaystack(diag);
  const factInSnippet = requiredFactInSnippetHaystack(c, hay);
  const chunkCount = diag?.chunkTextCount ?? row.evidenceUsed?.chunkTextCount ?? 0;
  const extractKind = row.evidenceUsed?.extractKind ?? diag?.extractProvenance?.kind ?? diag?.ragTrace?.llm?.contextualExtract?.kind ?? null;
  const extractApplied =
    row.evidenceUsed?.contextualExtractApplied ?? diag?.extractProvenance?.applied ?? diag?.ragTrace?.llm?.contextualExtract?.applied;
  const rejectReason = diag?.ragTrace?.llm?.contextualExtract?.rejectReason ?? null;
  const routeCheck = routingMismatch(diag, c);
  const evidence = [];

  const mode = c.expectedOutcome?.mode;

  if (overall.status === "not_evaluable") {
    return {
      primary: "G",
      secondary: overall.reason || "not_evaluable",
      confidence: "high",
      evidence: [overall.reason || "not_evaluable", factual.detail].filter(Boolean),
    };
  }

  if (mode === "must_abstain") {
    const match = lib.answerMatchesAllowedAbstain(c, answer);
    if (match.ok && !isSubstantiveAnswer(answer)) {
      return {
        primary: "G",
        secondary: "abstain_pattern_mismatch_evaluator",
        confidence: "medium",
        evidence: ["allowed abstain should match but factual/abstention layer failed"],
      };
    }
    if (isSubstantiveAnswer(answer)) {
      return {
        primary: "F",
        secondary: "hallucination_on_unsupported",
        confidence: "high",
        evidence: ["substantive answer on must_abstain"],
      };
    }
    return {
      primary: "F",
      secondary: "incorrect_abstention_wording",
      confidence: "high",
      evidence: ["must_abstain fail", abstentionDetail(row)],
    };
  }

  if (overall.reason === "grounding" || grounding.status === "fail") {
    evidence.push(grounding.detail || "grounding layer fail");
    if (factual.status === "pass") {
      return { primary: "E", secondary: "factual_pass_grounding_fail", confidence: "high", evidence };
    }
    return { primary: "E", secondary: "grounding_and_factual", confidence: "medium", evidence };
  }

  if (forbidden.status === "fail") {
    return {
      primary: "D",
      secondary: "forbidden_or_cross_model_in_answer",
      confidence: "high",
      evidence: [`forbidden: ${JSON.stringify(forbidden.matches || [])}`],
    };
  }

  if (routeCheck.suspect) {
    evidence.push(routeCheck.detail);
    if (chunkCount === 0 || !factInSnippet.any) {
      return { primary: "B", secondary: "wrong_route_poor_retrieval", confidence: "medium", evidence };
    }
    return { primary: "B", secondary: "wrong_route", confidence: "medium", evidence };
  }

  if (factual.status === "fail") {
    if (/abstain-like|empty answer|must_answer but answer is empty/i.test(factual.detail || "")) {
      evidence.push(factual.detail);
      if (extractKind && extractApplied === false) {
        evidence.push(`extract kind=${extractKind} reject=${rejectReason}`);
        return { primary: "C", secondary: "should_not_replace_or_not_applied", confidence: "high", evidence };
      }
      if (grounding.status === "pass" || factInSnippet.any) {
        return { primary: "D", secondary: "spurious_abstain_despite_evidence", confidence: "high", evidence };
      }
      if (chunkCount === 0) {
        return { primary: "A", secondary: "no_chunks", confidence: "high", evidence };
      }
      return { primary: "A", secondary: "fact_not_in_snippets", confidence: "low", evidence };
    }

    if (factual.missing?.length) {
      evidence.push(`missing: ${factual.missing.map((m) => `${m.claimPattern}(${m.reason || m.status})`).join(", ")}`);
      const allContradiction = factual.missing.every((m) => m.reason === "contradiction");
      if (allContradiction && /\d+\s*Вт/.test(answer) && factual.missing.length >= 2) {
        const patterns = factual.missing.map((m) => m.claimPattern).join("+");
        if (/8/.test(patterns) && /40/.test(patterns)) {
          return {
            primary: "G",
            secondary: "multi_watt_comparative_contradiction",
            confidence: "high",
            evidence: [...evidence, "answer lists multiple W values; evaluator contradiction heuristic"],
          };
        }
      }
      if (extractKind && extractApplied === false) {
        return { primary: "C", secondary: rejectReason || "extract_not_applied", confidence: "high", evidence };
      }
      if (extractKind && extractApplied) {
        const wrongInAnswer = factual.missing.some((m) => m.reason === "missing");
        if (wrongInAnswer) {
          return { primary: "D", secondary: "extract_applied_answer_incomplete", confidence: "medium", evidence };
        }
        return { primary: "C", secondary: "extract_applied_factual_miss", confidence: "medium", evidence };
      }
      if (factInSnippet.any) {
        return { primary: "D", secondary: "facts_in_context_answer_wrong", confidence: "medium", evidence };
      }
      const hasWrongModelChunk = /SDB1106NM|SDB302|180\s*кг|1204\s*мм|1952/i.test(hay);
      if (hasWrongModelChunk && chunkCount > 0) {
        evidence.push("cross-model or wrong-model TTX snippets in top ranks");
        return { primary: "A", secondary: "wrong_model_chunk_pollution", confidence: "high", evidence };
      }
      return {
        primary: chunkCount > 0 ? "A" : "H",
        secondary: "required_fact_not_retrieved",
        confidence: chunkCount > 0 ? "medium" : "high",
        evidence,
      };
    }

    return { primary: "D", secondary: factual.detail || "factual_fail", confidence: "medium", evidence };
  }

  if (overall.reason === "abstention") {
    return { primary: "F", secondary: "abstention_layer", confidence: "medium", evidence: [row.layers?.abstention?.detail].filter(Boolean) };
  }

  return { primary: "H", secondary: `reason=${overall.reason}`, confidence: "low", evidence: ["unclassified failure shape"] };
}

function abstentionDetail(row) {
  return row.layers?.abstention?.detail || null;
}

function buildInventoryRecord(row, diag, historicalMaps) {
  const c = row.case;
  const cls = row.overall.status === "fail" || row.overall.status === "not_evaluable" ? classifyTask41(row, diag) : null;
  const hist = {};
  for (const h of historicalMaps) {
    if (!h) continue;
    const st = h.map.get(c.id);
    hist[`task${h.task}`] = st ? { status: st.status, reason: st.reason, report: h.path } : { status: "missing", report: h.path };
  }
  const t40 = historicalMaps.find((x) => x && x.task === 40);
  const t39 = historicalMaps.find((x) => x && x.task === 39);
  let regressionNote = null;
  if (t40 && t39) {
    const cur = t40.map.get(c.id);
    const prev = t39.map.get(c.id);
    if (prev?.status === "pass" && cur?.status === "fail") regressionNote = "regressed_task39_to_task40";
    else if (prev?.status === "fail" && cur?.status === "pass") regressionNote = "improved_task39_to_task40";
    else if (prev?.status === "fail" && cur?.status === "fail") regressionNote = "persistent_fail";
  }

  return {
    caseId: c.id,
    category: c.category,
    question: c.message,
    expectedMode: c.expectedOutcome?.mode,
    requiredFacts: c.requiredFacts || [],
    forbiddenClaims: c.forbiddenClaims || [],
    overallStatus: row.overall.status,
    failingLayer: row.overall.reason,
    factualLayer: row.layers?.factual || null,
    groundingLayer: row.layers?.grounding || null,
    abstentionLayer: row.layers?.abstention || null,
    forbiddenLayer: row.layers?.forbiddenLeakage || null,
    answerPreview: row.answerPreview || "",
    sourceDocs: row.evidenceUsed?.sourceDocs?.slice(0, 12) || [],
    chunkTextCount: diag?.chunkTextCount ?? null,
    topSourceSnippets: (diag?.sources || []).slice(0, 5).map((s) => ({
      sourceDoc: s.sourceDoc,
      chunkIndex: s.chunkIndex,
      snippet: String(s.snippet || "").slice(0, 200),
    })),
    router: diag?.ragTrace?.router
      ? {
          intent: diag.ragTrace.router.intent,
          route: diag.ragTrace.router.route,
          retrievalMode: diag.ragTrace.router.retrievalMode,
          focusParameter: diag.ragTrace.router.focusParameter,
        }
      : null,
    retrieval: diag?.retrieval
      ? {
          retrievalStrategy: diag.retrieval.retrievalStrategy,
          topScore: diag.retrieval.topScore,
          chunks: diag.retrieval.chunks,
          abstained: diag.retrieval.abstained,
        }
      : null,
    extractProvenance: diag?.extractProvenance || {
      applied: row.evidenceUsed?.contextualExtractApplied,
      kind: row.evidenceUsed?.extractKind,
      missingProvenance: !diag,
    },
    contextualExtractTrace: diag?.ragTrace?.llm?.contextualExtract
      ? {
          kind: diag.ragTrace.llm.contextualExtract.kind,
          applied: diag.ragTrace.llm.contextualExtract.applied,
          rejectReason: diag.ragTrace.llm.contextualExtract.rejectReason,
          extractPreview: String(diag.ragTrace.llm.contextualExtract.extractPreview || "").slice(0, 300),
        }
      : null,
    primaryClassification: cls
      ? {
          code: cls.primary,
          label: TASK41_LABELS[cls.primary],
          secondary: cls.secondary,
          confidence: cls.confidence,
          evidence: cls.evidence,
        }
      : null,
    historicalStatus: hist,
    regressionNote,
  };
}

function clusterFailures(failures) {
  const clusters = {};
  const themes = [
    {
      id: "cross_model_ttx_chunks",
      title: "Wrong-model TTX row chunks (SDB1106NM) in prompt top ranks",
      match: (f) =>
        (f.primaryClassification?.code === "A" && f.primaryClassification?.secondary === "wrong_model_chunk_pollution") ||
        /SDB1106NM.*табл/.test((f.topSourceSnippets || []).map((s) => s.snippet).join(" ")),
    },
    {
      id: "contextual_extract_not_applied",
      title: "Contextual extract produced correct preview but should_not_replace / not applied",
      match: (f) => f.primaryClassification?.code === "C" && /should_not_replace|not_applied/i.test(f.primaryClassification?.secondary || ""),
    },
    {
      id: "spurious_abstain",
      title: "Spurious abstain on must_answer despite grounded context",
      match: (f) => f.primaryClassification?.code === "D" && /spurious_abstain/.test(f.primaryClassification?.secondary || ""),
    },
    {
      id: "must_abstain_hallucination",
      title: "Unsupported-spec queries answered substantively",
      match: (f) => f.expectedMode === "must_abstain" && f.primaryClassification?.code === "F",
    },
    {
      id: "must_abstain_eval_wording",
      title: "Correct abstain substance but evaluator pattern mismatch",
      match: (f) => f.expectedMode === "must_abstain" && f.primaryClassification?.code === "G",
    },
    {
      id: "multi_fact_partial",
      title: "Multi-fact questions missing one or more required assertions",
      match: (f) => f.category === "multi_fact" || /^gen\.multi\./.test(f.caseId),
    },
    {
      id: "evaluator_comparative_power",
      title: "Comparative storage vs dry power — evaluator W contradiction heuristic",
      match: (f) => /^gen\.disc\./.test(f.caseId) || f.primaryClassification?.secondary === "multi_watt_comparative_contradiction",
    },
    {
      id: "retrieval_cards_missing",
      title: "Retrieval gap — fact absent from diagnostic snippets (confirm full chunk bodies)",
      match: (f) => f.primaryClassification?.code === "A" && !/wrong_model/.test(f.primaryClassification?.secondary || ""),
    },
    {
      id: "procedure_symbol_indicator",
      title: "Procedure / indicator / symbol paraphrase",
      match: (f) => /^(gen\.proc\.|gen\.ind\.|gen\.sym\.)/.test(f.caseId),
    },
    {
      id: "environmental_spec",
      title: "Environmental limits (pressure, RAL, ESD, RH range)",
      match: (f) => /^(gen\.env\.|gen\.num\.ral|gen\.std\.|gen\.num\.rh-range)/.test(f.caseId),
    },
  ];

  const assigned = new Set();
  for (const theme of themes) {
    const cases = failures.filter((f) => theme.match(f));
    if (cases.length) {
      clusters[theme.id] = {
        title: theme.title,
        caseIds: cases.map((c) => c.caseId),
        count: cases.length,
      };
      cases.forEach((c) => assigned.add(c.caseId));
    }
  }
  const unclustered = failures.filter((f) => !assigned.has(f.caseId)).map((f) => f.caseId);
  return { clusters, unclustered };
}

function main() {
  const report = JSON.parse(fs.readFileSync(REPORT_T40, "utf8"));
  const diagMap = loadDiagnostics(DIAG_T40);
  const git = gitMeta();

  fs.writeFileSync(
    path.join(OUT_DIR, "repo-metadata.json"),
    JSON.stringify(
      {
        schemaVersion: "task41-repo-snapshot",
        capturedAt: new Date().toISOString(),
        branch: git.branch,
        head: git.head,
        dirtyLineCount: git.dirtyLineCount,
        authoritativeReport: REPORT_T40,
        evalRunnerLibVersion: report.manifest?.evalRunnerLibVersion,
        verifiedSummary: report.summary,
        crossModelLeakage: report.metrics?.cross_model_leakage_rate || report.cross_model_leakage_rate,
      },
      null,
      2,
    ),
    "utf8",
  );

  const t40Map = loadStatusMap(REPORT_T40);
  t40Map.task = 40;
  const historicalMaps = HISTORICAL.map(loadStatusMap);
  historicalMaps.push(t40Map);

  const inventory = report.caseResults.map((row) => buildInventoryRecord(row, diagMap.get(row.case.id), historicalMaps));
  const failures = inventory.filter((r) => r.overallStatus === "fail");
  const notEval = inventory.filter((r) => r.overallStatus === "not_evaluable");

  if (failures.length !== 36) {
    console.warn("WARN: expected 36 failures, got", failures.length);
  }

  const primaryCounts = {};
  for (const f of failures.concat(notEval)) {
    const code = f.primaryClassification?.code || "?";
    primaryCounts[code] = (primaryCounts[code] || 0) + 1;
  }

  const { clusters, unclustered } = clusterFailures(failures);

  const regression = {
    regressedFromTask39: failures.filter((f) => f.regressionNote === "regressed_task39_to_task40").map((f) => f.caseId),
    persistentSinceTask39: failures.filter((f) => f.regressionNote === "persistent_fail").map((f) => f.caseId),
    improvedSinceTask39: inventory.filter((f) => f.regressionNote === "improved_task39_to_task40").map((f) => f.caseId),
  };

  const machine = {
    schemaVersion: "task41-failure-clusters-v1",
    generatedAt: new Date().toISOString(),
    baseline: {
      task: 40,
      report: REPORT_T40,
      summary: report.summary,
      failureCount: failures.length,
      notEvaluableCount: notEval.length,
    },
    primaryClassificationCounts: primaryCounts,
    classificationLabels: TASK41_LABELS,
    failures: failures.map((f) => ({
      caseId: f.caseId,
      primary: f.primaryClassification?.code,
      secondary: f.primaryClassification?.secondary,
      confidence: f.primaryClassification?.confidence,
      failingLayer: f.failingLayer,
      category: f.category,
    })),
    clusters,
    unclusteredFailIds: unclustered,
    regression,
    historicalReports: HISTORICAL.map((h) => h.path),
  };

  fs.writeFileSync(path.join(OUT_DIR, "task41-inventory.json"), JSON.stringify({ inventory, failures, notEvaluable: notEval }, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "failure-clusters.json"), JSON.stringify(machine, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "primary-classification-counts.json"), JSON.stringify(primaryCounts, null, 2));

  console.log("Task 40 summary:", report.summary);
  console.log("Failures:", failures.length, "NE:", notEval.length);
  console.log("Primary counts:", primaryCounts);
  console.log("Regressed from T39:", regression.regressedFromTask39.length);
  console.log("Persistent:", regression.persistentSinceTask39.length);
}

main();
