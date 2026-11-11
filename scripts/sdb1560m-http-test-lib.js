/**
 * Shared HTTP chat helpers + anti-abstain audit for SDB1560M RAG PURE tests.
 */
const fs = require("fs");
const path = require("path");

const { STRICT_ABSTAIN } = require("../src/rag/prompts");

const BASE_URL = process.env.EVAL_BASE_URL || "http://127.0.0.1:3000";
const AUDIT_LOG = path.join(__dirname, "..", "logs", "sdb1560m-abstain-with-pdf-audit.jsonl");

const ABSTAIN_TEMPLATE_RE =
  /параметр не указан|информац(?:ия|ии)\s+.*отсутств|контекст не (?:предостав|содержит)|контекст\s+не\s+предоставляет|в\s+предоставленном\s+контексте|не\s+указан\w*|не\s+(?:указано|предоставлен\w*)\s+в\s+(?:предоставленном\s+)?контексте|нет (?:конкретной )?информации|в\s+контексте\s+нет|невозможно (?:точно )?определить.*контекст|рекомендуется обратиться|необходимо обратиться/i;

function parseCliFlags(argv = process.argv.slice(2)) {
  const strict = argv.includes("--strict");
  let runs = 1;
  for (const a of argv) {
    const m = /^--runs=(\d+)$/.exec(a);
    if (m) {
      runs = Math.max(1, Number(m[1]) || 1);
    }
  }
  return { strict, runs };
}

function minPassCount(total, strict) {
  if (!strict) {
    return total;
  }
  return Math.ceil(total * 0.9);
}

function sourcesIncludeManual(payload) {
  const sources = Array.isArray(payload?.sources) ? payload.sources : [];
  return sources.some((s) =>
    /SDB1560NM\.pdf|Руководство\s+SDB1560/i.test(String(s?.sourceDoc || s?.title || "")),
  );
}

function isAbstainTemplateAnswer(answer) {
  const a = String(answer || "").trim();
  if (!a) {
    return true;
  }
  if (a === STRICT_ABSTAIN) {
    return true;
  }
  return ABSTAIN_TEMPLATE_RE.test(a);
}

function assertPattern(label, text, pattern, invert) {
  const re = new RegExp(pattern, "iu");
  const ok = invert ? !re.test(text) : re.test(text);
  if (!ok) {
    throw new Error(`${label}: expected ${invert ? "NOT " : ""}/${pattern}/ in: ${text.slice(0, 200)}`);
  }
}

function appendAbstainAudit(entry) {
  fs.mkdirSync(path.dirname(AUDIT_LOG), { recursive: true });
  fs.appendFileSync(AUDIT_LOG, `${JSON.stringify(entry)}\n`, "utf8");
}

function countAuditLines() {
  if (!fs.existsSync(AUDIT_LOG)) {
    return 0;
  }
  return fs.readFileSync(AUDIT_LOG, "utf8").trim().split("\n").filter(Boolean).length;
}

async function provisionEvalUser(label = "http-test") {
  const { getPool } = require("../src/rag/pg-client");
  const { getRagConfig } = require("../src/rag/config");
  const { ensurePortalSchema } = require("../src/auth/portal-schema");
  const { createPortalUser } = require("../src/auth/portal-users");
  const { generateRandomPassword } = require("../src/auth/password");

  const pool = getPool(getRagConfig().postgresUrl);
  await ensurePortalSchema(pool);
  const login = `${label}_${Date.now()}`;
  const password = generateRandomPassword(12);
  await createPortalUser(pool, {
    login,
    password,
    equipmentIds: ["sdb1560m"],
    label,
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

async function chat(cookie, equipmentId, message, history = []) {
  const res = await fetch(`${BASE_URL.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ equipmentId, message, history }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.error || payload.details || `chat ${res.status}`);
  }
  return payload;
}

/**
 * @param {object} c case from JSON dataset
 * @param {object} payload chat response
 * @param {string} suite suite name for audit
 */
function evaluateHttpCase(c, payload, suite) {
  const answer = String(payload.answer || "");
  const pdfInSources = sourcesIncludeManual(payload);

  for (const p of c.mustMatch || []) {
    assertPattern(c.id, answer, p, false);
  }
  for (const p of c.mustNotMatch || []) {
    assertPattern(c.id, answer, p, true);
  }
  if (c.requireManualSource && !pdfInSources) {
    throw new Error(`${c.id}: expected SDB1560NM.pdf in sources`);
  }

  const checkPdfAbstain = pdfInSources && !c.allowAbstainWithPdf;
  if (checkPdfAbstain && isAbstainTemplateAnswer(answer)) {
    appendAbstainAudit({
      capturedAt: new Date().toISOString(),
      suite,
      caseId: c.id,
      message: c.message,
      pdfInSources: true,
      abstainTemplate: true,
      answerPreview: answer.slice(0, 280),
      sources: (payload.sources || []).slice(0, 4).map((s) => s.sourceDoc),
    });
    throw new Error(`${c.id}: abstain-like answer with PDF in sources`);
  }

  if (pdfInSources && !isAbstainTemplateAnswer(answer)) {
    appendAbstainAudit({
      capturedAt: new Date().toISOString(),
      suite,
      caseId: c.id,
      message: c.message,
      pdfInSources: true,
      abstainTemplate: false,
      answerPreview: answer.slice(0, 120),
    });
  }
}

module.exports = {
  BASE_URL,
  AUDIT_LOG,
  STRICT_ABSTAIN,
  parseCliFlags,
  minPassCount,
  sourcesIncludeManual,
  isAbstainTemplateAnswer,
  assertPattern,
  appendAbstainAudit,
  countAuditLines,
  provisionEvalUser,
  sessionLogin,
  chat,
  evaluateHttpCase,
};
