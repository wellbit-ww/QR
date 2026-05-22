/**
 * Parity eval: каждый кейс гоняется в Direct и RAG.
 * node scripts/eval-sdb1106nm-parity.js [--base-url URL] [--save-baseline] [--fail-under 0.95] [--direct-only|--rag-only] [--filter id1,id2]
 */
const fs = require("fs/promises");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATASET_PATH = path.join(ROOT, "data", "eval-sdb1106nm-parity.json");
const BASELINE_PATH = path.join(ROOT, "data", "eval-sdb1106nm-baseline.json");
const EQUIPMENT_ID = "sdb1106-nm";

function parseArgs(argv) {
  const opts = {
    baseUrl: process.env.EVAL_BASE_URL || "http://127.0.0.1:3000",
    saveBaseline: false,
    failUnder: null,
    directOnly: false,
    ragOnly: false,
    filterIds: null,
    delayMs: Number(process.env.EVAL_DELAY_MS) || 300,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--save-baseline") {
      opts.saveBaseline = true;
    } else if (arg === "--direct-only") {
      opts.directOnly = true;
    } else if (arg === "--rag-only") {
      opts.ragOnly = true;
    } else if (arg === "--base-url" && argv[i + 1]) {
      opts.baseUrl = argv[i + 1];
      i += 1;
    } else if (arg === "--fail-under" && argv[i + 1]) {
      opts.failUnder = Number(argv[i + 1]);
      i += 1;
    } else if (arg === "--filter" && argv[i + 1]) {
      opts.filterIds = new Set(
        argv[i + 1]
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      );
      i += 1;
    } else if (arg === "--delay-ms" && argv[i + 1]) {
      opts.delayMs = Number(argv[i + 1]);
      i += 1;
    }
  }

  if (opts.directOnly && opts.ragOnly) {
    throw new Error("Use only one of --direct-only or --rag-only.");
  }

  return opts;
}

async function loadDataset() {
  const raw = await fs.readFile(DATASET_PATH, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${DATASET_PATH}: ${error.message}`);
  }
  if (!Array.isArray(parsed.items)) {
    throw new Error("Invalid dataset: items[] required.");
  }
  for (const item of parsed.items) {
    for (const pattern of item.mustMatchRegex || []) {
      try {
        new RegExp(String(pattern), "iu");
      } catch (error) {
        throw new Error(`[${item.id}] invalid mustMatchRegex ${JSON.stringify(pattern)}: ${error.message}`);
      }
    }
    for (const pattern of item.mustNotMatchRegex || []) {
      try {
        new RegExp(String(pattern), "iu");
      } catch (error) {
        throw new Error(`[${item.id}] invalid mustNotMatchRegex ${JSON.stringify(pattern)}: ${error.message}`);
      }
    }
  }
  return parsed;
}

function normalizeEvalAnswer(answer) {
  return String(answer || "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/__/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

function evaluateMustContain(text, mustContain = []) {
  const missing = [];
  for (const token of mustContain) {
    const t = String(token || "").toLowerCase().trim();
    if (!t) continue;
    if (!text.includes(t)) missing.push(token);
  }
  return { missing, passed: missing.length === 0 };
}

function evaluateMustNotContain(text, mustNotContain = []) {
  const forbiddenHits = [];
  for (const token of mustNotContain) {
    const t = String(token || "").toLowerCase().trim();
    if (!t) continue;
    if (text.includes(t)) forbiddenHits.push(token);
  }
  return { forbiddenHits, passed: forbiddenHits.length === 0 };
}

function evaluateMustNotMatchRegex(text, patterns = []) {
  const hits = [];
  for (const pattern of patterns) {
    const re = new RegExp(String(pattern), "iu");
    if (re.test(text)) {
      hits.push(String(pattern));
    }
  }
  return { hits, passed: hits.length === 0 };
}

function evaluateMustMatchRegex(text, patterns = []) {
  const failed = [];
  for (const pattern of patterns) {
    const re = new RegExp(String(pattern), "iu");
    if (!re.test(text)) {
      failed.push(String(pattern));
    }
  }
  return { failed, passed: failed.length === 0 };
}

function evaluateExpectedMode(mode, item, pathLabel) {
  const directMode = item.expectModeDirect ?? item.expectMode ?? null;
  const directOneOf = item.expectModeDirectOneOf ?? item.expectModeOneOf ?? null;
  const ragMode = item.expectModeRag ?? item.expectMode ?? null;
  const ragOneOf = item.expectModeRagOneOf ?? item.expectModeOneOf ?? null;

  if (pathLabel === "direct") {
    if (directMode) {
      return { passed: mode === directMode, expected: directMode, actual: mode };
    }
    if (Array.isArray(directOneOf) && directOneOf.length > 0) {
      return {
        passed: directOneOf.includes(mode),
        expected: directOneOf.join("|"),
        actual: mode,
      };
    }
    return { passed: true, expected: null, actual: mode };
  }

  if (pathLabel === "rag") {
    if (item.skipModeCheckRag) {
      return { passed: true, expected: null, actual: mode, skipped: true };
    }
    if (ragMode) {
      return { passed: mode === ragMode, expected: ragMode, actual: mode };
    }
    if (Array.isArray(ragOneOf) && ragOneOf.length > 0) {
      return {
        passed: ragOneOf.includes(mode),
        expected: ragOneOf.join("|"),
        actual: mode,
      };
    }
    return { passed: true, expected: null, actual: mode };
  }

  return { passed: true, expected: null, actual: mode };
}

function evaluateExpectedParameterKey(payload, expectedParameterKey) {
  if (!expectedParameterKey) {
    return { passed: true, actual: null };
  }
  const actual = payload?.ragTrace?.parameterKey || payload?.retrieval?.parameterKey || null;
  return { passed: actual === expectedParameterKey, actual };
}

function evaluateSources(payload, expectSourcesMin) {
  if (expectSourcesMin == null || expectSourcesMin <= 0) {
    return { passed: true, count: Array.isArray(payload?.sources) ? payload.sources.length : 0 };
  }
  const count = Array.isArray(payload?.sources) ? payload.sources.length : 0;
  return { passed: count >= expectSourcesMin, count };
}

function scoreKeywords(text, expectedKeywords = []) {
  if (!expectedKeywords.length) return 1;
  let hits = 0;
  for (const keyword of expectedKeywords) {
    if (text.includes(String(keyword).toLowerCase())) hits += 1;
  }
  return hits / expectedKeywords.length;
}

function evaluateItem(item, payload, pathLabel) {
  const answer = payload?.answer || "";
  const normalized = normalizeEvalAnswer(answer);
  const mode = payload?.ragTrace?.mode || null;

  const mustContain = evaluateMustContain(normalized, item.mustContain || []);
  const mustNotContain = evaluateMustNotContain(normalized, item.mustNotContain || []);
  const mustNotMatchRegex = evaluateMustNotMatchRegex(normalized, item.mustNotMatchRegex || []);
  const mustMatchRegex = evaluateMustMatchRegex(normalized, item.mustMatchRegex || []);
  const modeCheck = evaluateExpectedMode(mode, item, pathLabel);
  const parameterKeyCheck = evaluateExpectedParameterKey(payload, item.expectedParameterKey || null);
  const sourcesCheck = evaluateSources(payload, item.expectSourcesMin);
  const keywordScore = scoreKeywords(normalized, item.expectedKeywords || []);

  const passed =
    mustContain.passed &&
    mustNotContain.passed &&
    mustNotMatchRegex.passed &&
    mustMatchRegex.passed &&
    modeCheck.passed &&
    parameterKeyCheck.passed &&
    sourcesCheck.passed;

  return {
    id: item.id,
    path: pathLabel,
    passed,
    mode,
    keywordScore,
    mustContain,
    mustNotContain,
    mustNotMatchRegex,
    mustMatchRegex,
    modeCheck,
    parameterKeyCheck,
    sourcesCount: sourcesCheck.count,
    answerPreview: answer.slice(0, 180),
    error: null,
  };
}

async function sleep(ms) {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function askQuestion(baseUrl, item, directContextMode) {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      equipmentId: EQUIPMENT_ID,
      message: item.question,
      history: item.history || [],
      directContextMode,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || payload.details || `HTTP ${response.status}`);
  }
  return payload;
}

async function checkServer(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/api/equipment/${EQUIPMENT_ID}`);
    return res.ok;
  } catch (_e) {
    return false;
  }
}

function printRowSummary(row) {
  const parityMark = row.parityOk ? "OK" : "FAIL";
  console.log(
    `- ${row.id}: direct=${row.direct.passed ? "pass" : "FAIL"} rag=${row.rag.passed ? "pass" : "FAIL"} parity=${parityMark}`
  );
  if (!row.direct.passed) {
    printFailures("  direct", row.direct);
  }
  if (!row.rag.passed) {
    printFailures("  rag", row.rag);
  }
}

function printFailures(prefix, result) {
  if (result.error) {
    console.log(`${prefix} error: ${result.error}`);
    return;
  }
  if ((result.mustContain?.missing || []).length) {
    console.log(`${prefix} missing: ${result.mustContain.missing.join(", ")}`);
  }
  if ((result.mustNotContain?.forbiddenHits || []).length) {
    console.log(`${prefix} forbidden: ${result.mustNotContain.forbiddenHits.join(", ")}`);
  }
  if ((result.mustNotMatchRegex?.hits || []).length) {
    console.log(`${prefix} forbidden regex: ${result.mustNotMatchRegex.hits.join(", ")}`);
  }
  if ((result.mustMatchRegex?.failed || []).length) {
    console.log(`${prefix} regex fail: ${result.mustMatchRegex.failed.join(", ")}`);
  }
  if (result.modeCheck?.expected && !result.modeCheck.passed) {
    console.log(
      `${prefix} mode: expected=${result.modeCheck.expected}, actual=${result.modeCheck.actual}`
    );
  }
  if (result.parameterKeyCheck?.expected != null && !result.parameterKeyCheck.passed) {
    console.log(`${prefix} parameterKey mismatch: ${result.parameterKeyCheck.actual}`);
  }
  console.log(`${prefix} preview: ${result.answerPreview}`);
}

async function main() {
  const opts = parseArgs(process.argv);
  const dataset = await loadDataset();
  let items = dataset.items;

  if (opts.filterIds) {
    items = items.filter((item) => opts.filterIds.has(item.id));
  }

  const serverOk = await checkServer(opts.baseUrl);
  if (!serverOk) {
    console.error(`Server not reachable at ${opts.baseUrl}. Start: npm run dev`);
    process.exitCode = 1;
    return;
  }

  const paths = [];
  if (!opts.ragOnly) paths.push({ label: "direct", directContextMode: true });
  if (!opts.directOnly) paths.push({ label: "rag", directContextMode: false });

  const rows = [];

  console.log("SDB1106NM parity eval");
  console.log(`Base URL: ${opts.baseUrl}`);
  console.log(`Cases: ${items.length}`);
  console.log(`Paths: ${paths.map((p) => p.label).join(", ")}`);
  console.log("");

  for (const item of items) {
    const row = { id: item.id, question: item.question, direct: null, rag: null, parityOk: false };

    for (const pathDef of paths) {
      try {
        const payload = await askQuestion(opts.baseUrl, item, pathDef.directContextMode);
        const result = evaluateItem(item, payload, pathDef.label);
        row[pathDef.label] = result;
      } catch (error) {
        row[pathDef.label] = {
          id: item.id,
          path: pathDef.label,
          passed: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
      await sleep(opts.delayMs);
    }

    if (row.direct && row.rag) {
      row.parityOk = row.direct.passed && row.rag.passed;
    } else if (row.direct) {
      row.parityOk = row.direct.passed;
    } else if (row.rag) {
      row.parityOk = row.rag.passed;
    }

    rows.push(row);
    printRowSummary(row);
  }

  const parityRows = rows.filter((r) => r.direct && r.rag);
  const parityRate =
    parityRows.length === 0 ? 0 : parityRows.filter((r) => r.parityOk).length / parityRows.length;
  const directRate =
    rows.length === 0 ? 0 : rows.filter((r) => r.direct?.passed).length / rows.length;
  const ragRate = rows.length === 0 ? 0 : rows.filter((r) => r.rag?.passed).length / rows.length;

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: opts.baseUrl,
    caseCount: items.length,
    directPassRate: directRate,
    ragPassRate: ragRate,
    parityPassRate: parityRate,
    rows,
  };

  console.log("");
  console.log("Summary");
  console.log(`Direct pass rate: ${(directRate * 100).toFixed(1)}% (${rows.filter((r) => r.direct?.passed).length}/${rows.length})`);
  console.log(`RAG pass rate:    ${(ragRate * 100).toFixed(1)}% (${rows.filter((r) => r.rag?.passed).length}/${rows.length})`);
  console.log(`Parity OK rate:   ${(parityRate * 100).toFixed(1)}% (${parityRows.filter((r) => r.parityOk).length}/${parityRows.length})`);

  if (opts.saveBaseline) {
    await fs.writeFile(BASELINE_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`Baseline saved: ${BASELINE_PATH}`);
  }

  if (opts.failUnder != null && parityRate < opts.failUnder) {
    console.error(`Parity rate ${(parityRate * 100).toFixed(1)}% below threshold ${(opts.failUnder * 100).toFixed(1)}%`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Parity eval failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
