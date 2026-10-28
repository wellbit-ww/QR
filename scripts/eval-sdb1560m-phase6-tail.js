/**
 * Phase 6 eval tail: backlog ids only (honest HTTP).
 * Usage: RAG_HONEST_EQUIPMENT=sdb1560m node scripts/eval-sdb1560m-phase6-tail.js
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

require("./load-env-file").loadEnvFile();

const IDS = ["spec-volume", "spec-full-volume", "live-set-rh", "spec-power-storage"];
const root = path.join(__dirname, "..");
const datasetPath = path.join(root, "data", "eval-sdb1560m-cards-wave.json");
const raw = JSON.parse(fs.readFileSync(datasetPath, "utf8"));
const items = raw.items.filter((i) => IDS.includes(i.id));
const tmp = path.join(root, "data", ".eval-phase6-tail.json");
fs.writeFileSync(tmp, JSON.stringify({ items }, null, 2), "utf8");

const env = {
  ...process.env,
  EVAL_DATASET: tmp,
  EVAL_OUT: path.join(root, "data", "eval-sdb1560m-phase6-tail-results.json"),
  EVAL_AUTO_LOGIN: "1",
  EVAL_BASE_URL: process.env.EVAL_BASE_URL || "http://127.0.0.1:3000",
  RAG_HONEST_EQUIPMENT: process.env.RAG_HONEST_EQUIPMENT || "sdb1560m",
  EVAL_DELAY_MS: "0",
};

const r = spawnSync(process.execPath, [path.join(__dirname, "eval-rag.js")], {
  cwd: root,
  env,
  stdio: "inherit",
});
process.exit(r.status ?? 1);
