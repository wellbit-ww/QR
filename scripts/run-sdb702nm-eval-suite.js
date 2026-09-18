const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATASET = path.join(ROOT, "data", "eval-sdb702nm-manual-coverage.json");
const REQUIRED_SECTIONS = [
  "01-", "02-", "03-", "04-", "05-", "06-", "07-", "08-", "09-", "10-", "11-",
  "12-", "13-", "14-", "15-", "16-", "17-", "18-", "19-", "20-", "21-", "22-",
];

function run(script) {
  const result = spawnSync("npm", ["run", script], {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
  });
  return result.status === 0;
}

function validateCoverageDataset() {
  const parsed = JSON.parse(fs.readFileSync(DATASET, "utf8"));
  const ids = new Set((parsed.items || []).map((item) => item.id));
  for (const prefix of REQUIRED_SECTIONS) {
    if (![...ids].some((id) => id.startsWith(prefix))) {
      throw new Error(`Coverage dataset misses section case: ${prefix}`);
    }
  }
  if ((parsed.items || []).some((item) => item.equipmentId !== "sdb702-nm")) {
    throw new Error("Coverage dataset contains an unexpected equipment id.");
  }
  console.log(`SDB702 manual coverage dataset: ${parsed.items.length} cases.`);
}

function main() {
  validateCoverageDataset();
  const profileOk = run("test:sdb702nm");
  if (!profileOk) {
    process.exit(1);
  }
  if (process.argv.includes("--live")) {
    const liveOk = run("eval:sdb702nm:coverage");
    process.exit(liveOk ? 0 : 1);
  }
  console.log("Live API coverage skipped. Run: npm run eval:sdb702nm:coverage");
}

main();
