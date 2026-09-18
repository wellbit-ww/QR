const { spawnSync } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function run(script) {
  const result = spawnSync("npm", ["run", script], {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
  });
  return result.status === 0;
}

function main() {
  const profileOk = run("test:sdb302nm");
  if (!profileOk) {
    process.exit(1);
  }
  if (process.argv.includes("--live")) {
    const liveOk = run("eval:sdb302nm");
    process.exit(liveOk ? 0 : 1);
  }
  console.log("Live API eval skipped. Run: npm run eval:sdb302nm");
}

main();
