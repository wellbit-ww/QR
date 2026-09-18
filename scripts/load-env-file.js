const fs = require("fs");
const path = require("path");

/**
 * Подгружает переменные из .env в корне проекта (только если ещё не заданы в process.env).
 */
function loadEnvFile() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) {
    return false;
  }
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  return true;
}

module.exports = { loadEnvFile };
