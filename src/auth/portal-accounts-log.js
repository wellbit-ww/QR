const fs = require("fs");
const path = require("path");

const DEFAULT_LOG_PATH = path.join(__dirname, "..", "..", "data", "portal-accounts.jsonl");

function resolveAccountsLogPath() {
  const fromEnv = process.env.PORTAL_ACCOUNTS_LOG;
  if (typeof fromEnv === "string" && fromEnv.trim()) {
    return path.resolve(fromEnv.trim());
  }
  return DEFAULT_LOG_PATH;
}

function buildLoginUrl(baseUrl, equipmentIds) {
  const origin = String(baseUrl || "http://127.0.0.1:3000").replace(/\/$/, "");
  const equipment = equipmentIds?.[0] || "sdb1106-nm";
  return `${origin}/login?equipment=${encodeURIComponent(equipment)}`;
}

/**
 * Дописывает запись об изменении аккаунта без сохранения пароля в открытом виде.
 * Файл по умолчанию: data/portal-accounts.jsonl (в .gitignore).
 */
function appendPortalAccountRecord(record) {
  const logPath = resolveAccountsLogPath();
  const dir = path.dirname(logPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const line = {
    ts: new Date().toISOString(),
    action: record.action,
    login: record.login,
    passwordStored: false,
    equipmentIds: record.equipmentIds || [],
    label: record.label ?? null,
    loginUrl: record.loginUrl || buildLoginUrl(record.baseUrl, record.equipmentIds),
    active: record.active ?? null,
  };

  fs.appendFileSync(logPath, `${JSON.stringify(line)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  try {
    fs.chmodSync(logPath, 0o600);
  } catch (_) {
    // Windows may ignore POSIX modes; ACLs should be managed at deploy time.
  }
  return logPath;
}

module.exports = {
  resolveAccountsLogPath,
  appendPortalAccountRecord,
  buildLoginUrl,
};
