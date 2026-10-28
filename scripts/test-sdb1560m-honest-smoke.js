/**
 * Smoke honest RAG: «Сколько полок?» → «2 полки» из PDF (или STRICT_ABSTAIN), не card / не «параметр не указан».
 * RAG_HONEST_EQUIPMENT=sdb1560m node scripts/test-sdb1560m-honest-smoke.js
 */
const assert = require("node:assert/strict");

require("./load-env-file").loadEnvFile();
if (!process.env.RAG_HONEST_EQUIPMENT) {
  process.env.RAG_HONEST_EQUIPMENT = "sdb1560m";
}
process.env.CHAT_SELF_CORRECT = process.env.CHAT_SELF_CORRECT || "0";

const equipmentCatalog = require("../data/equipment.json");
const { routeQuery } = require("../src/rag/router/query-router");
const { runPipeline } = require("../src/rag/pipeline/run-pipeline");
const { shouldUseHonestRag } = require("../src/rag/honest-rag-mode");
const { applyHonestRagPostGate } = require("../src/rag/honest-rag-post-gate");
const { tryDeterministicSdb1560mAnswer } = require("../src/rag/sdb1560m-direct-facts");
const { resolveEquipmentProfile } = require("../src/equipment/equipment-runtime");
const { resolveDeliveryMethodFromLlmTrace } = require("../src/rag/sdb1106nm-post-gate");
const { STRICT_ABSTAIN, MODEL_PARAM_NOT_SPECIFIED } = require("../src/rag/prompts");

const QUESTION = "Сколько полок в комплекте?";
const BASE_URL = process.env.EVAL_BASE_URL || "http://127.0.0.1:3000";

function evaluateShelfAnswer(answer) {
  const a = String(answer || "").trim();
  const okNumeric = /\b2\b/u.test(a) && /полк/u.test(a);
  const okAbstain = a === STRICT_ABSTAIN;
  return { a, okNumeric, okAbstain, ok: okNumeric || okAbstain };
}

function assertShelfAnswer(answer, label) {
  const { a, okNumeric, okAbstain, ok } = evaluateShelfAnswer(answer);
  assert.ok(
    ok,
    `${label}: expected «2 … полк…» or STRICT_ABSTAIN, got: ${a.slice(0, 200)}`,
  );
  if (okAbstain && !okNumeric) {
    console.warn(`[honest-smoke] ${label}: only STRICT_ABSTAIN (prefer «2 полки» from PDF)`);
  }
  if (!okAbstain && a.includes(MODEL_PARAM_NOT_SPECIFIED)) {
    assert.fail(`${label}: must not use MODEL_PARAM_NOT_SPECIFIED without abstain`);
  }
  if (/параметр не указан/i.test(a) && !okAbstain) {
    assert.fail(`${label}: «параметр не указан» without STRICT_ABSTAIN`);
  }
}

async function provisionEvalUser() {
  const { getPool } = require("../src/rag/pg-client");
  const { getRagConfig } = require("../src/rag/config");
  const { ensurePortalSchema } = require("../src/auth/portal-schema");
  const { createPortalUser } = require("../src/auth/portal-users");
  const { generateRandomPassword } = require("../src/auth/password");

  const pool = getPool(getRagConfig().postgresUrl);
  await ensurePortalSchema(pool);
  const login = `honest_smoke_${Date.now()}`;
  const password = generateRandomPassword(12);
  await createPortalUser(pool, {
    login,
    password,
    equipmentIds: ["sdb1560m"],
    label: "honest-smoke",
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

async function chatHttp(cookie, message) {
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

async function main() {
  assert.equal(shouldUseHonestRag("sdb1560m"), true, "RAG_HONEST_EQUIPMENT must include sdb1560m");

  const profile = resolveEquipmentProfile("sdb1560m");
  const legacyDet = tryDeterministicSdb1560mAnswer(QUESTION);
  assert.ok(legacyDet && /2/u.test(legacyDet), "legacy direct-facts still has shelf answer (not used in honest path)");

  const honestDet = profile.tryDeterministicAnswer(QUESTION, {});
  assert.equal(honestDet, null, "honest profile must not return TTX deterministic for shelves");

  const equipment = equipmentCatalog.sdb1560m;
  const routerDecision = await routeQuery({
    query: QUESTION,
    history: [],
    equipmentId: equipment.id,
    equipment,
  });

  const result = await runPipeline({
    equipment,
    message: QUESTION,
    history: [],
    routerDecision,
  });

  const mode = result.ragTrace?.mode;
  assert.notEqual(mode, "RAG_DETERMINISTIC", `expected LLM/RAG path, got mode=${mode}`);
  assert.notEqual(result.ragTrace?.llm?.mode, "RAG_DETERMINISTIC");
  assert.notEqual(result.ragTrace?.llm?.deterministic, true);
  assert.equal(result.ragTrace?.deterministicUsed, undefined);
  assert.ok(Number(result.retrieval?.chunks) > 0, "retrieval must return chunks");

  const sources = result.sources || [];
  assert.ok(sources.length > 0, "sources must be non-empty");
  const fromPdf = sources.some((s) =>
    /SDB1560NM\.pdf|Руководство/i.test(String(s.sourceDoc || s.source_doc || "")),
  );
  assert.ok(fromPdf, `expected PDF in sources, got: ${sources.map((s) => s.sourceDoc).join(", ")}`);

  const topDoc = String(sources[0]?.sourceDoc || "");
  assert.ok(
    !/retrieval-cards/i.test(topDoc),
    `top source must not be retrieval-card, got: ${topDoc}`,
  );

  const postGate = applyHonestRagPostGate({
    answer: result.answer,
    context: result.retrievalContext || "",
    message: QUESTION,
    equipment,
    deliveryMethod: resolveDeliveryMethodFromLlmTrace(result.ragTrace?.llm),
    semanticSimilarity: Number(result.retrieval?.topScore) || 0,
    routerDecision: result.ragTrace?.router,
    retrieval: result.retrieval,
    history: [],
    validationProfile: "sdb1560",
  });
  assertShelfAnswer(postGate.answer, "runPipeline+honestPostGate");

  let httpNote = null;
  try {
    const { login, password } = await provisionEvalUser();
    const cookie = await sessionLogin(login, password);
    const payload = await chatHttp(cookie, QUESTION);
    assert.notEqual(payload.ragTrace?.mode, "RAG_DETERMINISTIC", "HTTP: no RAG_DETERMINISTIC");
    if (payload.ragTrace) {
      const postGated =
        payload.ragTrace.serverPostGate ||
        payload.ragTrace.postGate === "honest_rag" ||
        payload.ragTrace.honestMode === true;
      assert.ok(postGated, "HTTP: expected post-gate trace (restart server after phase-3)");
    }
    const httpSources = payload.sources || [];
    assert.ok(
      httpSources.some((s) => /SDB1560NM\.pdf|Руководство/i.test(String(s.sourceDoc || ""))),
      "HTTP: PDF in sources",
    );
    assertShelfAnswer(payload.answer, "HTTP /api/chat");
    httpNote = { ok: true, mode: payload.ragTrace?.mode, topSource: httpSources[0]?.sourceDoc };
  } catch (err) {
    httpNote = { ok: false, error: err instanceof Error ? err.message : String(err) };
    console.warn("[honest-smoke] HTTP /api/chat skipped or failed:", httpNote.error);
  }

  console.log("SDB1560M honest smoke OK:", {
    mode,
    llmUsed: result.retrieval?.llmUsed,
    chunks: result.retrieval?.chunks,
    topSource: sources[0]?.sourceDoc,
    answerPreview: String(postGate.answer).slice(0, 120),
    http: httpNote,
  });

  const postEval = evaluateShelfAnswer(postGate.answer);
  if (!postEval.okNumeric) {
    console.warn("[honest-smoke] pipeline+postGate did not return «2 полки» (numeric preferred for phase 4)");
  }

  if (process.env.HONEST_SMOKE_REQUIRE_HTTP === "1") {
    assert.ok(httpNote?.ok, `HTTP smoke required but failed: ${httpNote?.error || "unknown"}`);
  } else if (!httpNote?.ok) {
    console.warn(
      "Tip: restart server with RAG_HONEST_EQUIPMENT=sdb1560m; set HONEST_SMOKE_REQUIRE_HTTP=1 in CI.",
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

