/**
 * HTTP live regression for RAG PURE SDB1560M.
 * Usage: node scripts/test-sdb1560m-live-regression.js [--strict] [--runs=3]
 */
const fs = require("fs");
const path = require("path");

require("./load-env-file").loadEnvFile();
process.env.RAG_HONEST_EQUIPMENT = process.env.RAG_HONEST_EQUIPMENT || "sdb1560m";
process.env.RAG_PURE = process.env.RAG_PURE || "1";

const { isRagPureEnabled } = require("../src/rag/honest-rag-mode");
const {
  parseCliFlags,
  minPassCount,
  countAuditLines,
  provisionEvalUser,
  sessionLogin,
  chat,
  evaluateHttpCase,
} = require("./sdb1560m-http-test-lib");

const DATASET = path.join(__dirname, "..", "data", "live-user-regression-sdb1560m.json");
const OUT = path.join(__dirname, "..", "logs", "live-user-regression-sdb1560m.json");
const SUITE = "live-regression";

async function runOnce(dataset, equipmentId, cookie) {
  const traces = [];
  let passed = 0;
  for (const c of dataset.cases) {
    let ok = true;
    let errMsg = null;
    let payload;
    try {
      payload = await chat(cookie, equipmentId, c.message, c.history || []);
      evaluateHttpCase(c, payload, SUITE);
    } catch (err) {
      ok = false;
      errMsg = err instanceof Error ? err.message : String(err);
    }
    if (ok) {
      passed += 1;
    }
    traces.push({
      id: c.id,
      message: c.message,
      pass: ok,
      error: errMsg,
      answerPreview: String(payload?.answer || "").slice(0, 320),
      sources: (payload?.sources || []).slice(0, 4).map((s) => s.sourceDoc),
    });
    console.log(`${ok ? "PASS" : "FAIL"} ${c.id}${errMsg ? ` — ${errMsg}` : ""}`);
  }
  return { passed, total: dataset.cases.length, traces };
}

async function main() {
  const { strict, runs } = parseCliFlags();
  if (!isRagPureEnabled()) {
    console.warn("[live-regression] RAG_PURE is off — set RAG_PURE=1 for this suite.");
  }

  const auditBefore = countAuditLines();
  const dataset = JSON.parse(fs.readFileSync(DATASET, "utf8"));
  const equipmentId = dataset.equipmentId || "sdb1560m";
  const { login, password } = await provisionEvalUser("live_reg");
  const cookie = await sessionLogin(login, password);

  const runResults = [];
  for (let i = 1; i <= runs; i += 1) {
    console.log(`\n--- live-regression run ${i}/${runs} ---`);
    const r = await runOnce(dataset, equipmentId, cookie);
    const need = minPassCount(r.total, strict);
    runResults.push({
      run: i,
      passed: r.passed,
      total: r.total,
      minRequired: need,
      ok: r.passed >= need,
      traces: r.traces,
    });
    console.log(`Run ${i}: ${r.passed}/${r.total} (need ≥${need}) ${r.passed >= need ? "OK" : "FAIL"}`);
    if (strict && r.passed < need) {
      fs.mkdirSync(path.dirname(OUT), { recursive: true });
      fs.writeFileSync(
        OUT,
        JSON.stringify(
          {
            capturedAt: new Date().toISOString(),
            ragPure: isRagPureEnabled(),
            strict,
            runs,
            runResults,
            auditLinesBefore: auditBefore,
            auditLinesAfter: countAuditLines(),
          },
          null,
          2,
        ),
        "utf8",
      );
      process.exit(1);
    }
  }

  const last = runResults[runResults.length - 1];
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        ragPure: isRagPureEnabled(),
        strict,
        runs,
        runResults,
        passed: last.passed,
        total: last.total,
        auditLinesBefore: auditBefore,
        auditLinesAfter: countAuditLines(),
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`Live regression (${runs} run(s)): last ${last.passed}/${last.total} → ${OUT}`);
  if (!strict && last.passed < last.total) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
