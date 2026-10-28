/**
 * Одна команда `npm start`: .env + honest pilot + Docker PG (если есть) + server.js
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env");
const examplePath = path.join(root, ".env.example");

function ensureEnvFile() {
  if (fs.existsSync(envPath)) {
    return;
  }
  if (fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, envPath);
    console.log("[start] Created .env from .env.example — проверьте SESSION_SECRET и POSTGRES_URL.");
    return;
  }
  console.warn("[start] No .env — используются переменные окружения и дефолты.");
}

function ensureEnvKey(key, value) {
  if (process.env[key]) {
    return;
  }
  process.env[key] = value;
  if (!fs.existsSync(envPath)) {
    return;
  }
  const text = fs.readFileSync(envPath, "utf8");
  if (new RegExp(`^\\s*${key}\\s*=`, "m").test(text)) {
    return;
  }
  const line = `${key}=${value}\n`;
  fs.appendFileSync(envPath, text.endsWith("\n") ? line : `\n${line}`, "utf8");
  console.log(`[start] Added ${key}=${value} to .env`);
}

function dockerPostgresUp() {
  const composeFile = path.join(root, "docker-compose.yml");
  if (!fs.existsSync(composeFile)) {
    return;
  }
  console.log("[start] Docker: postgres (docker compose up -d)...");
  const r = spawnSync("docker", ["compose", "up", "-d"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    console.warn("[start] Docker compose failed — если PG уже на POSTGRES_URL, можно игнорировать.");
  }
}

require("./load-env-file").loadEnvFile();
ensureEnvFile();
require("./load-env-file").loadEnvFile();

ensureEnvKey("RAG_HONEST_EQUIPMENT", "sdb1560m");

dockerPostgresUp();

console.log("[start] RAG_HONEST_EQUIPMENT =", process.env.RAG_HONEST_EQUIPMENT);
console.log("[start] Portal → http://127.0.0.1:" + (process.env.PORT || 3000) + "/");

require(path.join(root, "server.js"));
