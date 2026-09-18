/**
 * Файловый лог чата для ручного тестирования (NDJSON — одна строка JSON на событие).
 * Путь: logs/chat-session-<дата>_<pid>.jsonl (или CHAT_LOG_FILE).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LOGS_DIR = path.join(ROOT, "logs");

let sessionFilePath = null;
let sessionSeq = 0;
let sessionStartedAt = null;

function isChatFileLogEnabled() {
  const raw = process.env.CHAT_LOG_FILE;
  if (raw === "0" || raw === "false" || raw === "off") {
    return false;
  }
  if (raw === "1" || raw === "true" || raw === "auto") {
    return true;
  }
  if (String(process.env.NODE_ENV || "").trim().toLowerCase() === "production") {
    return false;
  }
  return true;
}

function resolveSessionFilePath() {
  const override = process.env.CHAT_LOG_FILE;
  if (override && override !== "1" && override !== "true" && override !== "auto") {
    return path.isAbsolute(override) ? override : path.join(ROOT, override);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return path.join(LOGS_DIR, `chat-session-${stamp}_${process.pid}.jsonl`);
}

function ensureSessionFile() {
  if (sessionFilePath) {
    return sessionFilePath;
  }
  if (!isChatFileLogEnabled()) {
    return null;
  }
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  sessionFilePath = resolveSessionFilePath();
  sessionStartedAt = new Date().toISOString();
  appendRecord({
    type: "session_start",
    ts: sessionStartedAt,
    pid: process.pid,
    nodeEnv: process.env.NODE_ENV || "production",
    logFile: sessionFilePath,
    postgresConfigured: Boolean(process.env.POSTGRES_URL),
    hint: "Каждый вопрос — строка type=chat_exchange. Отправьте этот файл эксперту.",
  });
  return sessionFilePath;
}

function appendRecord(record) {
  const filePath = ensureSessionFile();
  if (!filePath) {
    return null;
  }
  const line = `${JSON.stringify(record)}\n`;
  fs.appendFileSync(filePath, line, "utf8");
  return filePath;
}

function normalizeTestMeta(body) {
  const raw = body?.testMeta;
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const block = Number(raw.block);
  const question = Number(raw.question);
  const meta = {};
  if (Number.isFinite(block) && block > 0) {
    meta.block = block;
  }
  if (Number.isFinite(question) && question > 0) {
    meta.question = question;
  }
  if (typeof raw.sessionLabel === "string" && raw.sessionLabel.trim()) {
    meta.sessionLabel = raw.sessionLabel.trim().slice(0, 120);
  }
  if (typeof raw.notes === "string" && raw.notes.trim()) {
    meta.notes = raw.notes.trim().slice(0, 500);
  }
  return Object.keys(meta).length ? meta : null;
}

function summarizeRagTrace(ragTrace) {
  if (!ragTrace || typeof ragTrace !== "object") {
    return null;
  }
  return {
    mode: ragTrace.mode ?? null,
    used: ragTrace.used ?? null,
    directContextMode: ragTrace.directContextMode ?? null,
    gateAction: ragTrace.gateAction ?? null,
    gateReason: ragTrace.gateReason ?? null,
    serverPostGate: ragTrace.serverPostGate ?? null,
    warnings: ragTrace.warnings ?? null,
    guardrails: ragTrace.guardrails ?? null,
    router: ragTrace.router
      ? {
          route: ragTrace.router.route ?? null,
          intent: ragTrace.router.intent ?? null,
        }
      : null,
    llm: ragTrace.llm
      ? {
          used: ragTrace.llm.used ?? null,
          deterministic: ragTrace.llm.deterministic ?? null,
          deliveryMethod: ragTrace.llm.deliveryMethod ?? null,
        }
      : null,
  };
}

function recordChatExchange(details) {
  if (!isChatFileLogEnabled()) {
    return null;
  }
  sessionSeq += 1;
  return appendRecord({
    type: "chat_exchange",
    seq: sessionSeq,
    ts: new Date().toISOString(),
    ...details,
  });
}

function recordChatError(details) {
  if (!isChatFileLogEnabled()) {
    return null;
  }
  sessionSeq += 1;
  return appendRecord({
    type: "chat_error",
    seq: sessionSeq,
    ts: new Date().toISOString(),
    ...details,
  });
}

function getChatSessionLogPath() {
  return sessionFilePath;
}

function closeChatSessionLog(reason) {
  if (!sessionFilePath) {
    return;
  }
  appendRecord({
    type: "session_end",
    ts: new Date().toISOString(),
    reason: reason || "shutdown",
    exchanges: sessionSeq,
    startedAt: sessionStartedAt,
  });
}

function initChatSessionLog() {
  return ensureSessionFile();
}

module.exports = {
  isChatFileLogEnabled,
  normalizeTestMeta,
  summarizeRagTrace,
  recordChatExchange,
  recordChatError,
  getChatSessionLogPath,
  closeChatSessionLog,
  initChatSessionLog,
  LOGS_DIR,
};
