/**
 * SDB1106NM eval suite — offline tests + optional live API evals.
 *
 * Offline (без сервера):
 *   node scripts/run-sdb1106nm-eval-suite.js
 *   npm run test:sdb1106nm
 *
 * Полный прогон (нужен npm run dev на :3000):
 *   node scripts/run-sdb1106nm-eval-suite.js --live
 *   npm run eval:sdb1106nm
 */
const { spawnSync } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function runStep(name, npmScript, extraArgs = []) {
  process.stdout.write(`\n=== ${name} ===\n`);
  const result = spawnSync("npm", ["run", npmScript, ...extraArgs], {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
  });
  const ok = result.status === 0;
  console.log(ok ? `✓ ${name}` : `✗ ${name} (exit ${result.status})`);
  return ok;
}

function main() {
  const live = process.argv.includes("--live");
  const results = [];

  results.push(runStep("Golden router (P0/P1)", "test:golden-router"));
  results.push(runStep("Golden router paraphrase", "test:golden-router-paraphrase"));
  results.push(runStep("Validate parity JSON", "validate:parity-json"));

  if (live) {
    results.push(runStep("Parity eval (Direct+RAG)", "eval:parity", ["--", "--fail-under", "0.95"]));
    results.push(runStep("Manual docx RAG (50)", "eval:manual-docx"));
    results.push(runStep("Ad-hoc RAG (10)", "eval:adhoc"));
    results.push(runStep("Ad-hoc paraphrase RAG (20)", "eval:adhoc-paraphrase"));
  } else {
    console.log("\n(Live API evals skipped — запустите с --live при работающем сервере)");
  }

  const failed = results.filter((r) => !r).length;
  console.log(`\n--- Suite summary ---`);
  console.log(`Steps: ${results.length - failed}/${results.length} passed`);
  if (!live) {
    console.log("Live: skipped (use --live for parity + manual + adhoc)");
  }
  process.exit(failed > 0 ? 1 : 0);
}

main();
