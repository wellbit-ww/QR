const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 20;

const attemptsByIp = new Map();

function pruneOld(now) {
  for (const [ip, entry] of attemptsByIp.entries()) {
    if (now - entry.windowStart > WINDOW_MS) {
      attemptsByIp.delete(ip);
    }
  }
}

function getClientIp(req) {
  return req.ip || "unknown";
}

function isLoginRateLimited(req) {
  const ip = getClientIp(req);
  const now = Date.now();
  pruneOld(now);
  const entry = attemptsByIp.get(ip);
  if (!entry) {
    return false;
  }
  if (now - entry.windowStart > WINDOW_MS) {
    attemptsByIp.delete(ip);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailedLogin(req) {
  const ip = getClientIp(req);
  const now = Date.now();
  pruneOld(now);
  const entry = attemptsByIp.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    attemptsByIp.set(ip, { windowStart: now, count: 1 });
    return;
  }
  entry.count += 1;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function failedLoginDelay() {
  await delay(350 + Math.floor(Math.random() * 150));
}

module.exports = {
  isLoginRateLimited,
  recordFailedLogin,
  failedLoginDelay,
  getClientIp,
};
