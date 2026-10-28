/**
 * UAT 8 сценариев из RAG_SDB1560M_HONEST_RESTORE.md через POST /api/chat (API-эквивалент UI).
 * RAG_HONEST_EQUIPMENT=sdb1560m node scripts/sdb1560m-uat-api-check.js
 */
const fs = require("fs");
const path = require("path");

require("./load-env-file").loadEnvFile();
process.env.RAG_HONEST_EQUIPMENT = process.env.RAG_HONEST_EQUIPMENT || "sdb1560m";

const BASE_URL = process.env.EVAL_BASE_URL || "http://127.0.0.1:3000";
const OUT = path.join(__dirname, "..", "logs", "sdb1560m-uat-api-traces.json");

const CASES = [
  {
    id: "uat-1-shelves",
    question: "Сколько полок в комплекте?",
    assert: (a) => /\b2\b/u.test(a) && /полк/u.test(a),
  },
  {
    id: "uat-2-volume",
    question: "Какой внутренний объём?",
    assert: (a) => /896/u.test(a),
  },
  {
    id: "uat-3-getting-started",
    question: "Как начать работу с шкафом?",
    assert: (a) => /тумблер|220|включ/i.test(a) && !/параметр не указан/i.test(a),
  },
  {
    id: "uat-4-rh-not-drop",
    question: "Влажность не снижается что делать",
    assert: (a) => /2\.2|3\.2|неисправ|уплотнител/i.test(a),
  },
  {
    id: "uat-5-red-blink",
    question: "Красный индикатор мигает что это",
    assert: (a) => /осушен|мига|красн/i.test(a),
  },
  {
    id: "uat-6-sensor-maker",
    question: "Кто производитель датчика влажности",
    assert: (a) =>
      /отсутств|не\s+указан|не\s+найден/i.test(a) || /информац(?:ия|ии)\s+.*отсутств/i.test(a),
  },
  {
    id: "uat-7-smoke",
    question: "Из шкафа идёт дым, что делать?",
    assert: (a) =>
      /отключ/i.test(a) &&
      /питан/i.test(a) &&
      (!/уплотнител/i.test(a) || /не\s+проверяйте[^\n]{0,40}уплотнител/i.test(a)),
  },
  {
    id: "uat-8-foreign-model",
    question: "Сколько полок в SDB702?",
    assert: (a) =>
      /SDB1560|1560\s*M|только на мод|FOREIGN|друг.*мод/i.test(a) && !/\b7\s*полок/i.test(a),
    equipmentId: "sdb1560m",
  },
];

async function provisionEvalUser() {
  const { getPool } = require("../src/rag/pg-client");
  const { getRagConfig } = require("../src/rag/config");
  const { ensurePortalSchema } = require("../src/auth/portal-schema");
  const { createPortalUser } = require("../src/auth/portal-users");
  const { generateRandomPassword } = require("../src/auth/password");

  const pool = getPool(getRagConfig().postgresUrl);
  await ensurePortalSchema(pool);
  const login = `uat_${Date.now()}`;
  const password = generateRandomPassword(12);
  await createPortalUser(pool, {
    login,
    password,
    equipmentIds: ["sdb1560m"],
    label: "uat-api-check",
  });
  await pool.end();
  return { login, password };
}

async function sessionLogin(userLogin, password) {
  const res = await fetch(`${BASE_URL.replace(/\/$/, "")}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: userLogin, password, equipment: "sdb1560m" }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.error || `login ${res.status}`);
  }
  const setCookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie")].filter(Boolean);
  return setCookies.map((line) => String(line).split(";")[0]).join("; ");
}

async function chat(cookie, equipmentId, message) {
  const res = await fetch(`${BASE_URL.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ equipmentId, message, history: [] }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.error || payload.details || `chat ${res.status}`);
  }
  return payload;
}

async function main() {
  const { login, password } = await provisionEvalUser();
  const cookie = await sessionLogin(login, password);
  const traces = [];
  let passed = 0;

  for (const c of CASES) {
    const equipmentId = c.equipmentId || "sdb1560m";
    const payload = await chat(cookie, equipmentId, c.question);
    const answer = String(payload.answer || "");
    const ok = c.assert(answer);
    if (ok) {
      passed += 1;
    }
    traces.push({
      id: c.id,
      question: c.question,
      equipmentId,
      pass: ok,
      answerPreview: answer.slice(0, 280),
      topSource: payload.sources?.[0]?.sourceDoc ?? null,
      ragTrace: payload.ragTrace ?? null,
    });
    console.log(`${ok ? "PASS" : "FAIL"} ${c.id}`);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(
    OUT,
    JSON.stringify({ capturedAt: new Date().toISOString(), passed, total: CASES.length, traces }, null, 2),
    "utf8",
  );
  console.log(`UAT API: ${passed}/${CASES.length} → ${OUT}`);
  if (passed < CASES.length) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
