/**
 * Smoke-test portal auth (requires running server + Postgres).
 *
 *   set AUTH_REQUIRED=1
 *   set POSTGRES_URL=postgresql://...
 *   set SESSION_SECRET=01234567890123456789012345678901
 *   npm start
 *   node scripts/test-portal-auth.js --base-url http://127.0.0.1:3000
 */
const { getPool } = require("../src/rag/pg-client");
const { getRagConfig } = require("../src/rag/config");
const { ensurePortalSchema } = require("../src/auth/portal-schema");
const {
  createPortalUser,
  findUserByLogin,
} = require("../src/auth/portal-users");
const { generateRandomPassword } = require("../src/auth/password");

function parseArgs(argv) {
  const out = { baseUrl: "http://127.0.0.1:3000", equipment: "sdb1106-nm" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--base-url") {
      out.baseUrl = argv[++i];
    } else if (argv[i] === "--equipment") {
      out.equipment = argv[++i];
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const origin = args.baseUrl.replace(/\/$/, "");
  const login = `test_${Date.now()}`;
  const password = generateRandomPassword(10);

  const pool = getPool(getRagConfig().postgresUrl);
  if (!pool) {
    throw new Error("POSTGRES_URL is required.");
  }
  await ensurePortalSchema(pool);

  const existing = await findUserByLogin(pool, login);
  if (existing) {
    throw new Error("Unexpected existing test user.");
  }

  await createPortalUser(pool, {
    login,
    password,
    equipmentIds: [args.equipment],
    label: "auth-smoke-test",
  });
  await pool.end();

  const loginRes = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login, password, equipment: args.equipment }),
  });
  const loginBody = await loginRes.json();
  if (!loginRes.ok) {
    throw new Error(`Login failed: ${loginBody.error || loginRes.status}`);
  }

  const setCookies =
    typeof loginRes.headers.getSetCookie === "function"
      ? loginRes.headers.getSetCookie()
      : [loginRes.headers.get("set-cookie")].filter(Boolean);
  const cookieHeader = setCookies.map((line) => String(line).split(";")[0]).join("; ");
  if (!cookieHeader) {
    throw new Error("No Set-Cookie from login.");
  }

  const equipmentRes = await fetch(`${origin}/api/equipment`, {
    headers: { cookie: cookieHeader },
  });
  const equipmentBody = await equipmentRes.json();
  if (!equipmentRes.ok) {
    throw new Error(`Equipment list failed: ${equipmentBody.error}`);
  }
  const ids = (equipmentBody.items || []).map((item) => item.id);
  if (!ids.includes(args.equipment) || ids.length !== 1) {
    throw new Error(`Unexpected equipment scope: ${ids.join(", ")}`);
  }

  const logoutRes = await fetch(`${origin}/api/auth/logout`, {
    method: "POST",
    headers: { cookie: cookieHeader },
  });
  if (!logoutRes.ok) {
    throw new Error("Logout failed.");
  }

  const blockedRes = await fetch(`${origin}/api/equipment`, { redirect: "manual" });
  if (blockedRes.status !== 401) {
    throw new Error(`Expected 401 after logout, got ${blockedRes.status}`);
  }

  console.log("OK: portal auth smoke test passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
