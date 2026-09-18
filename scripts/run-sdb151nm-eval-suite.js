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
  if (!run("test:sdb151nm")) {
    process.exit(1);
  }
  if (process.argv.includes("--live")) {
    process.exit(run("eval:sdb151nm") ? 0 : 1);
  }
  console.log("Live API eval skipped. Run: npm run eval:sdb151nm");
}

main();
