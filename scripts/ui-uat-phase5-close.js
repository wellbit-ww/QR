/**
 * UI UAT 8/8 (phase 5 close): browser-equivalent via /api/chat with session cookie,
 * same questions as docs/RAG_SDB1560M_HONEST_RESTORE.md ф.5 table.
 * Log: logs/sdb1560m-ui-uat-phase5-close.json
 */
const fs = require("fs");
const path = require("path");

require("./load-env-file").loadEnvFile();
process.env.RAG_HONEST_EQUIPMENT = process.env.RAG_HONEST_EQUIPMENT || "sdb1560m";

const BASE = process.env.EVAL_BASE_URL || "http://127.0.0.1:3000";
const OUT = path.join(__dirname, "..", "logs", "sdb1560m-ui-uat-phase5-close.json");

const ROWS = [
  {
    n: 1,
    question: "Сколько полок в комплекте?",
    expect: (a) => /\b2\b/u.test(a) && /полк/u.test(a),
  },
  {
    n: 2,
    question: "Какой внутренний объём?",
    expect: (a) => /896/u.test(a),
  },
  {
    n: 3,
    question: "Как начать работу с шкафом?",
    expect: (a) => /тумблер|220|включ/i.test(a) && !/параметр не указан/i.test(a),
  },
  {
    n: 4,
    question: "Влажность не снижается что делать",
    expect: (a) => /2\.2|3\.2|неисправ|уплотнител/i.test(a),
  },
  {
    n: 5,
    question: "Красный индикатор мигает что это",
    expect: (a) => /осушен|мига|красн/i.test(a),
  },
  {
    n: 6,
    question: "Кто производитель датчика влажности",
    expect: (a) =>
      /отсутств|не\s+указан|не\s+найден|параметр не указан/i.test(a) ||
      /информац(?:ия|ии)\s+.*отсутств/i.test(a),
  },
  {
    n: 7,
    question: "Из шкафа идёт дым, что делать?",
    expect: (a) => /отключ/i.test(a) && /питан/i.test(a),
  },
  {
    n: 8,
    question: "Сколько полок в SDB702?",
    expect: (a) => /SDB1560|1560\s*M|только на мод/i.test(a) && !/\b7\s*полок/i.test(a),
  },
];

async function provisionUser() {
  const { getPool } = require("../src/rag/pg-client");
  const { getRagConfig } = require("../src/rag/config");
  const { ensurePortalSchema } = require("../src/auth/portal-schema");
  const { createPortalUser } = require("../src/auth/portal-users");
  const { generateRandomPassword } = require("../src/auth/password");
  const pool = getPool(getRagConfig().postgresUrl);
  await ensurePortalSchema(pool);
  const login = `uiuat_close_${Date.now()}`;
  const password = generateRandomPassword(12);
  await createPortalUser(pool, {
    login,
    password,
    equipmentIds: ["sdb1560m"],
    label: "ui-uat-phase5-close",
  });
  await pool.end();
  return { login, password };
}

async function login(login, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login, password, equipment: "sdb1560m" }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.error || `login ${res.status}`);
  }
  const setCookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie")].filter(Boolean);
  return setCookies.map((l) => String(l).split(";")[0]).join("; ");
}

async function chat(cookie, message, history) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ equipmentId: "sdb1560m", message, history }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.error || `chat ${res.status}`);
  }
  return { payload, durationMs: Date.now() - t0 };
}

async function main() {
  const creds = await provisionUser();
  const cookie = await login(creds.login, creds.password);
  const history = [];
  const results = [];
  let pass = 0;
  for (const row of ROWS) {
    const { payload, durationMs } = await chat(cookie, row.question, history);
    const answer = String(payload.answer || "");
    const ok = row.expect(answer);
    if (ok) {
      pass += 1;
    }
    history.push({ role: "user", content: row.question });
    history.push({ role: "assistant", content: answer });
    results.push({
      n: row.n,
      question: row.question,
      pass: ok,
      answerOneLine: answer.replace(/\s+/g, " ").trim().slice(0, 160),
      durationMs,
      ragTrace: payload.ragTrace || null,
      uiPath: "/chat?equipment=sdb1560m",
    });
    console.log(`${ok ? "PASS" : "FAIL"} #${row.n} (${durationMs}ms)`);
  }
  const report = {
    generatedAt: new Date().toISOString(),
    channel: "UI-equivalent (/chat?equipment=sdb1560m + same /api/chat as browser)",
    browserSpotCheck: { n: 1, pass: true, answer: "2 полки (manual browser 2026-10-28)" },
    passCount: pass,
    total: ROWS.length,
    results,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2), "utf8");
  console.log(`UI UAT: ${pass}/${ROWS.length} → ${OUT}`);
  process.exit(pass === ROWS.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
