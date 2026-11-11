#!/usr/bin/env node
/**
 * SDB1560M eval runner v1 — safe by default (--no-provision).
 *
 * Usage:
 *   node scripts/run-sdb1560m-eval-v1.js --dry-run
 *   node scripts/run-sdb1560m-eval-v1.js --allow-http --partition verified
 *
 * Requires EVAL_LOGIN + EVAL_PASSWORD for HTTP (never auto-provisions).
 */
const fs = require("fs");
const path = require("path");

require("./load-env-file").loadEnvFile();

const {
  validateSuiteDocument,
  loadSuiteFromFile,
  prepareCases,
  buildRunManifest,
  runEvalDry,
  runEvalWithPayloads,
  writeRunOutput,
} = require("./sdb1560m-eval-runner-lib");
const { getAuthConfig, sessionLogin, chatRequest } = require("./sdb1560m-eval-http-client");

const EVAL_DELAY_MS = Number(process.env.EVAL_DELAY_MS) || 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function chatRequestWithRetry(cookie, equipmentId, message, history, caseId, chatOptions = {}) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      return await chatRequest(cookie, equipmentId, message, history, chatOptions);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/429/.test(msg) && attempt < 19) {
        const waitMs = attempt >= 2 ? 16 * 60 * 1000 : 60_000;
        console.error(
          `[eval] 429 on ${caseId}, retry in ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1}/20)`,
        );
        await sleep(waitMs);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`chat retries exhausted (${caseId})`);
}

const DEFAULT_DATASET = path.join(
  __dirname,
  "..",
  "docs",
  "reports",
  "sdb1560m-eval-suite-draft-v1.json",
);

function parseArgs(argv) {
  const out = {
    dryRun: false,
    allowHttp: false,
    noProvision: true,
    partition: "all",
    dataset: DEFAULT_DATASET,
    outDir: null,
    caseIds: null,
  };
  for (const a of argv) {
    if (a === "--dry-run") {
      out.dryRun = true;
    } else if (a === "--allow-http") {
      out.allowHttp = true;
    } else if (a === "--no-provision") {
      out.noProvision = true;
    } else if (a.startsWith("--partition=")) {
      out.partition = a.slice("--partition=".length);
    } else if (a.startsWith("--dataset=")) {
      out.dataset = a.slice("--dataset=".length);
    } else if (a.startsWith("--out=")) {
      out.outDir = a.slice("--out=".length);
    } else if (a.startsWith("--cases=")) {
      out.caseIds = a
        .slice("--cases=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  if (out.allowHttp && out.dryRun) {
    throw new Error("use either --dry-run or --allow-http, not both");
  }
  return out;
}

async function fetchPayloads(cases, equipmentId) {
  process.env.EVAL_CAPTURE_RAG_TRACE = "1";
  const auth = getAuthConfig();
  if (!auth.ok) {
    const map = {};
    for (const c of cases) {
      map[c.id] = { _infraError: auth.reason };
    }
    return { payloadsByCaseId: map, authMode: "missing_credentials" };
  }
  let cookie;
  try {
    cookie = await sessionLogin(auth.login, auth.password, equipmentId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const map = {};
    for (const c of cases) {
      map[c.id] = { _infraError: `login failed: ${msg}` };
    }
    return { payloadsByCaseId: map, authMode: "login_failed" };
  }

  const payloadsByCaseId = {};
  for (let i = 0; i < cases.length; i += 1) {
    const c = cases[i];
    console.error(`[eval] ${i + 1}/${cases.length} ${c.id}`);
    try {
      payloadsByCaseId[c.id] = await chatRequestWithRetry(
        cookie,
        equipmentId,
        c.message,
        c.history || [],
        c.id,
        { evalTrace: true },
      );
    } catch (err) {
      payloadsByCaseId[c.id] = {
        _infraError: err instanceof Error ? err.message : String(err),
      };
    }
    if (EVAL_DELAY_MS > 0 && i < cases.length - 1) {
      await sleep(EVAL_DELAY_MS);
    }
  }
  return { payloadsByCaseId, authMode: "eval_login" };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.noProvision) {
    console.error("Refusing to run without --no-provision (provisioning is never supported).");
    process.exit(2);
  }

  if (!fs.existsSync(args.dataset)) {
    console.error(`Dataset not found: ${args.dataset}`);
    process.exit(2);
  }

  const { doc, abs, sha256 } = loadSuiteFromFile(args.dataset);
  const validation = validateSuiteDocument(doc);
  if (!validation.ok) {
    console.error("Invalid suite:", validation.errors.join("; "));
    process.exit(2);
  }

  let cases;
  try {
    cases = prepareCases(doc, args.partition);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }

  if (cases.length === 0) {
    console.error(`No cases for partition=${args.partition}`);
    process.exit(2);
  }

  if (args.caseIds?.length) {
    const wanted = new Set(args.caseIds);
    cases = cases.filter((c) => wanted.has(c.id));
    if (cases.length === 0) {
      console.error(`No cases matched --cases=${args.caseIds.join(",")}`);
      process.exit(2);
    }
  }

  const skipReasons = [];
  let mode = "dry-run";
  if (args.allowHttp) {
    mode = "http";
  } else if (!args.dryRun) {
    mode = "validate-only";
    skipReasons.push("Neither --dry-run nor --allow-http; use --dry-run for manifest-only");
  }

  const manifest = buildRunManifest({
    datasetPath: abs,
    datasetSha256: sha256,
    partition: args.partition,
    mode,
    noProvision: true,
    allowHttp: args.allowHttp,
    dryRun: args.dryRun || !args.allowHttp,
    authMode: args.allowHttp ? "requires EVAL_LOGIN" : "not-used",
    skipReasons,
  });

  let report;
  if (args.allowHttp) {
    const { payloadsByCaseId, authMode } = await fetchPayloads(cases, doc.equipmentId || "sdb1560m");
    manifest.run.authMode = authMode;
    report = runEvalWithPayloads({ cases, manifest, payloadsByCaseId });
  } else {
    report = runEvalDry({ cases, manifest });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir =
    args.outDir ||
    path.join(__dirname, "..", "logs", "eval-runs", `sdb1560m-${stamp}`);
  writeRunOutput(outDir, report);

  console.log(`Eval run written to ${outDir}`);
  console.log(JSON.stringify(report.summary, null, 2));

  const failInfra = (report.summary.infrastructure_error || 0) > 0;
  const failCase = (report.summary.fail || 0) > 0;
  if (args.allowHttp && (failInfra || failCase)) {
    process.exit(1);
  }
  if (!validation.ok) {
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
