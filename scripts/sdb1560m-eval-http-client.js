/**
 * HTTP client for SDB1560M eval runner — login + chat only. No provisioning.
 */
const BASE_URL = process.env.EVAL_BASE_URL || "http://127.0.0.1:3000";

function getAuthConfig() {
  const login = process.env.EVAL_LOGIN;
  const password = process.env.EVAL_PASSWORD;
  if (!login || !password) {
    return { ok: false, reason: "EVAL_LOGIN and EVAL_PASSWORD must be set (runner never creates users)" };
  }
  return { ok: true, login, password };
}

async function sessionLogin(login, password, equipmentId = "sdb1560m") {
  const res = await fetch(`${BASE_URL.replace(/\/$/, "")}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login, password, equipment: equipmentId }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.error || `login HTTP ${res.status}`);
  }
  const setCookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie")].filter(Boolean);
  const cookie = setCookies.map((line) => String(line).split(";")[0]).join("; ");
  if (!cookie) {
    throw new Error("login succeeded but no session cookie");
  }
  return cookie;
}

async function chatRequest(cookie, equipmentId, message, history = [], options = {}) {
  const headers = { "Content-Type": "application/json", Cookie: cookie };
  if (options.evalTrace) {
    headers["X-Sova-Eval-Trace"] = "1";
  }
  const res = await fetch(`${BASE_URL.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({ equipmentId, message, history }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.error || payload.details || `chat HTTP ${res.status}`);
  }
  return payload;
}

module.exports = {
  BASE_URL,
  getAuthConfig,
  sessionLogin,
  chatRequest,
};
