/**
 * Ad-hoc HTTP probe SDB1560M (paraphrase). Blocking: ≥27/30 (90%).
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

const DATASET = path.join(__dirname, "..", "data", "ad-hoc-probe-sdb1560m.json");
const OUT = path.join(__dirname, "..", "logs", "ad-hoc-probe-sdb1560m.json");
const SUITE = "ad-hoc-probe";

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
  const { strict } = parseCliFlags();
  const blockingStrict = true;
  if (!isRagPureEnabled()) {
    console.warn("[ad-hoc-probe] RAG_PURE is off — set RAG_PURE=1");
  }

  const auditBefore = countAuditLines();
  const dataset = JSON.parse(fs.readFileSync(DATASET, "utf8"));
  const equipmentId = dataset.equipmentId || "sdb1560m";
  const { login, password } = await provisionEvalUser("adhoc_probe");
  const cookie = await sessionLogin(login, password);

  const result = await runOnce(dataset, equipmentId, cookie);
  const need = minPassCount(result.total, blockingStrict);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        ragPure: isRagPureEnabled(),
        passed: result.passed,
        total: result.total,
        minRequired: need,
        auditLinesBefore: auditBefore,
        auditLinesAfter: countAuditLines(),
        traces: result.traces,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`Ad-hoc probe: ${result.passed}/${result.total} (need ≥${need}) → ${OUT}`);
  if (result.passed < need) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
