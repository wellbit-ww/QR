/**
 * Фаза 0 honest-restore: 3 live /api/chat traces для sdb1560m (до honest mode).
 * node scripts/sdb1560m-phase0-baseline-traces.js
 */
const fs = require("fs");
const path = require("path");

require("./load-env-file").loadEnvFile();

const BASE_URL = process.env.EVAL_BASE_URL || "http://127.0.0.1:3000";
const OUT = path.join(__dirname, "..", "logs", "sdb1560m-honest-restore-baseline-traces.json");

const CASES = [
  {
    id: "baseline-deterministic-ttx",
    label: "Сегодня часто deterministic (ТТХ)",
    question: "Сколько полок в комплекте?",
  },
  {
    id: "baseline-procedure-rag",
    label: "Процедура через RAG/LLM",
    question: "Как начать работу с шкафом?",
  },
  {
    id: "baseline-unsupported-abstain",
    label: "Нет в мануале / unsupported",
    question: "Поддерживает ли шкаф Wi-Fi?",
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
  const login = `phase0_${Date.now()}`;
  const password = generateRandomPassword(12);
  await createPortalUser(pool, {
    login,
    password,
    equipmentIds: ["sdb1560m"],
    label: "phase0-baseline",
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
  const cookie = setCookies.map((line) => String(line).split(";")[0]).join("; ");
  if (!cookie) {
    throw new Error("no session cookie");
  }
  return cookie;
}

async function chat(cookie, message) {
  const res = await fetch(`${BASE_URL.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({
      equipmentId: "sdb1560m",
      message,
      history: [],
    }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.error || payload.details || `chat ${res.status}`);
  }
  return payload;
}

async function captureViaHttp(cookie, c, capturedAt) {
  const payload = await chat(cookie, c.question);
  return {
    ...c,
    captureMethod: "http_api_chat",
    capturedAt,
    equipmentId: "sdb1560m",
    answerPreview: String(payload.answer || "").slice(0, 400),
    answer: payload.answer,
    chatMode: payload.chatMode ?? null,
    ragTrace: payload.ragTrace ?? null,
    sourcesCount: Array.isArray(payload.sources) ? payload.sources.length : 0,
  };
}

async function captureViaPipeline(equipment, c, capturedAt) {
  const { routeQuery } = require("../src/rag/router/query-router");
  const { runPipeline } = require("../src/rag/pipeline/run-pipeline");
  const routerDecision = await routeQuery({
    query: c.question,
    history: [],
    equipmentId: equipment.id,
    equipment,
  });
  const result = await runPipeline({
    equipment,
    message: c.question,
    history: [],
    routerDecision,
  });
  return {
    ...c,
    captureMethod: "local_runPipeline",
    capturedAt,
    equipmentId: equipment.id,
    answerPreview: String(result.answer || "").slice(0, 400),
    answer: result.answer,
    chatMode: null,
    ragTrace: result.ragTrace ?? null,
    routerDecision: {
      route: routerDecision?.route ?? null,
      intent: routerDecision?.intent ?? null,
    },
    sourcesCount: Array.isArray(result.retrieval?.items) ? result.retrieval.items.length : 0,
  };
}

async function captureViaPreGate(profile, c, capturedAt) {
  const gate = profile.classifyPreGate(c.question, { history: [], equipmentChatScoped: true });
  return {
    ...c,
    captureMethod: "local_classifyPreGate",
    capturedAt,
    equipmentId: "sdb1560m",
    answerPreview: String(gate.reply || "").slice(0, 400),
    answer: gate.reply,
    chatMode: { mode: "SCOPE_GATE" },
    ragTrace: {
      used: false,
      mode: "SCOPE_GATE",
      gateAction: gate.action,
      gateReason: gate.reason,
    },
    sourcesCount: 0,
  };
}

async function main() {
  const equipmentCatalog = require("../data/equipment.json");
  const equipment = equipmentCatalog.sdb1560m;
  const { resolveEquipmentProfile } = require("../src/equipment/equipment-runtime");
  const profile = resolveEquipmentProfile("sdb1560m");
  const capturedAt = new Date().toISOString();
  const traces = [];

  console.log(`[phase0] ${CASES[0].id} (pipeline/deterministic)`);
  traces.push(await captureViaPipeline(equipment, CASES[0], capturedAt));

  console.log(`[phase0] ${CASES[1].id} (pipeline)`);
  traces.push(await captureViaPipeline(equipment, CASES[1], capturedAt));

  console.log(`[phase0] ${CASES[2].id} (pre-gate)`);
  traces.push(await captureViaPreGate(profile, CASES[2], capturedAt));

  let httpNote = null;
  try {
    const { login: evalLogin, password } = await provisionEvalUser();
    const cookie = await sessionLogin(evalLogin, password);
    const httpGate = await captureViaHttp(cookie, CASES[2], capturedAt);
    traces.push({ ...httpGate, id: `${CASES[2].id}-http`, label: "HTTP cross-check pre-gate" });
    httpNote = { evalLogin, crossCheck: CASES[2].id };
  } catch (error) {
    httpNote = {
      error: error instanceof Error ? error.message : String(error),
      hint: "Long RAG calls may drop HTTP socket; pipeline traces above are primary baseline.",
    };
  }

  const report = {
    phase: 0,
    purpose: "baseline before RAG_HONEST_EQUIPMENT (legacy deterministic + post-gate)",
    baseUrl: BASE_URL,
    capturedAt,
    httpNote,
    cases: traces,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  console.log("wrote", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
