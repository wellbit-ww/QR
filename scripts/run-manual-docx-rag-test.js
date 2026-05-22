/**
 * Прогон вопросов из RAGtestNEW.docx через RAG API.
 * node scripts/run-manual-docx-rag-test.js [--base-url URL] [--out path]
 */
const fs = require("fs/promises");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATASET = path.join(ROOT, "data", "eval-manual-docx-rag.json");
const DEFAULT_OUT = path.join(ROOT, "data", "manual-docx-rag-results.json");

function parseArgs(argv) {
  const opts = {
    baseUrl: process.env.EVAL_BASE_URL || "http://127.0.0.1:3000",
    out: DEFAULT_OUT,
    delayMs: Number(process.env.EVAL_DELAY_MS) || 400,
    timeoutMs: Number(process.env.EVAL_TIMEOUT_MS) || 180000,
  };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--base-url" && argv[i + 1]) {
      opts.baseUrl = argv[i + 1];
      i += 1;
    } else if (argv[i] === "--out" && argv[i + 1]) {
      opts.out = path.isAbsolute(argv[i + 1]) ? argv[i + 1] : path.join(ROOT, argv[i + 1]);
      i += 1;
    } else if (argv[i] === "--delay-ms" && argv[i + 1]) {
      opts.delayMs = Number(argv[i + 1]);
      i += 1;
    }
  }
  return opts;
}

function normalize(text) {
  return String(text || "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

function evaluateItem(text, item) {
  const failures = [];
  for (const token of item.mustContain || []) {
    if (!text.includes(String(token).toLowerCase())) failures.push(`mustContain:${token}`);
  }
  for (const token of item.mustNotContain || []) {
    if (text.includes(String(token).toLowerCase())) failures.push(`mustNotContain:${token}`);
  }
  for (const pattern of item.mustMatchRegex || []) {
    if (!new RegExp(String(pattern), "iu").test(text)) failures.push(`mustMatchRegex:${pattern}`);
  }
  for (const pattern of item.mustNotMatchRegex || []) {
    if (new RegExp(String(pattern), "iu").test(text)) failures.push(`mustNotMatchRegex:${pattern}`);
  }
  return { passed: failures.length === 0, failures };
}

async function chatRag(baseUrl, question) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), parseArgs(process.argv).timeoutMs);
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        equipmentId: "sdb1106-nm",
        message: question,
        history: [],
        directContextMode: false,
      }),
      signal: controller.signal,
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        answer: payload.error || payload.details || `HTTP ${res.status}`,
        chatMode: null,
        ragTrace: null,
      };
    }
    return {
      ok: true,
      status: res.status,
      answer: payload.answer || "",
      chatMode: payload.chatMode || null,
      ragTrace: payload.ragTrace || null,
    };
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const opts = parseArgs(process.argv);
  const dataset = JSON.parse(await fs.readFile(DATASET, "utf8"));
  const items = dataset.items || [];
  const results = [];
  let passed = 0;
  let failed = 0;
  let errors = 0;

  console.log(`Manual docx RAG test — ${items.length} questions`);
  console.log(`Base URL: ${opts.baseUrl}\n`);

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    process.stdout.write(`[${i + 1}/${items.length}] ${item.id} ... `);
    let response;
    try {
      response = await chatRag(opts.baseUrl, item.question);
    } catch (err) {
      response = {
        ok: false,
        status: 0,
        answer: err instanceof Error ? err.message : String(err),
        chatMode: null,
        ragTrace: null,
      };
    }

    const norm = normalize(response.answer);
    const evalResult =
      response.ok && norm
        ? evaluateItem(norm, item)
        : { passed: false, failures: ["http_or_empty"] };

    if (!response.ok) errors += 1;
    else if (evalResult.passed) passed += 1;
    else failed += 1;

    const mode =
      response.chatMode?.mode ||
      response.ragTrace?.mode ||
      (response.ok ? "RAG" : "ERROR");

    results.push({
      id: item.id,
      block: item.block,
      question: item.question,
      passed: evalResult.passed && response.ok,
      failures: evalResult.failures,
      mode,
      answerPreview: String(response.answer || "").slice(0, 500),
      answerFull: response.answer || "",
      httpStatus: response.status,
    });

    console.log(evalResult.passed && response.ok ? "OK" : "FAIL");
    if (opts.delayMs > 0 && i < items.length - 1) await sleep(opts.delayMs);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: opts.baseUrl,
    total: items.length,
    passed,
    failed,
    errors,
    passRate: items.length ? passed / items.length : 0,
    results,
  };

  await fs.writeFile(opts.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("\n--- Summary ---");
  console.log(`Passed: ${passed}/${items.length} (${(report.passRate * 100).toFixed(1)}%)`);
  console.log(`Failed checks: ${failed}`);
  console.log(`HTTP errors: ${errors}`);
  console.log(`Report: ${opts.out}`);

  const byBlock = {};
  for (const r of results) {
    byBlock[r.block] = byBlock[r.block] || { ok: 0, total: 0 };
    byBlock[r.block].total += 1;
    if (r.passed) byBlock[r.block].ok += 1;
  }
  console.log("\nBy block:");
  for (const [b, s] of Object.entries(byBlock).sort((a, c) => Number(a[0]) - Number(c[0]))) {
    console.log(`  Block ${b}: ${s.ok}/${s.total}`);
  }

  process.exit(failed + errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
