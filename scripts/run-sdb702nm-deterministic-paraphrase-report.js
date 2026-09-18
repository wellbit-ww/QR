/**
 * Offline-отчёт по парафразам deterministic-ответов SDB702NM.
 * node scripts/run-sdb702nm-deterministic-paraphrase-report.js
 */

const fs = require("fs");
const path = require("path");
const { classifySdb702nmMessage } = require("../src/rag/sdb702nm-chat-gate");
const { tryDeterministicSdb702nmAnswer } = require("../src/rag/sdb702nm-direct-facts");

const DATA_PATH = path.join(__dirname, "..", "data", "sdb702nm-deterministic-paraphrases.json");
const OUT_PATH = path.join(__dirname, "..", "data", "sdb702nm-deterministic-paraphrase-report.md");

function resolveAnswer(question) {
  const gate = classifySdb702nmMessage(question, { equipmentChatScoped: true });
  if (gate.action === "CONTACT_SUPPORT") {
    return { mode: "DETERMINISTIC", answer: gate.reply || "" };
  }
  if (gate.action !== "IN_SCOPE" && gate.action !== "SAFETY") {
    return { mode: gate.action, answer: gate.reply || "" };
  }
  const det = tryDeterministicSdb702nmAnswer(question);
  if (det) {
    return { mode: "DETERMINISTIC", answer: det };
  }
  return { mode: "MISSING", answer: "" };
}

function evaluateCase(item) {
  const { mode, answer } = resolveAnswer(item.question);
  const failures = [];
  const expectedMode = item.expectGate || "DETERMINISTIC";
  if (mode !== expectedMode) {
    failures.push(`expected ${expectedMode}, got ${mode}`);
  }
  for (const token of item.expect || []) {
    if (!new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu").test(answer)) {
      failures.push(`missing: ${token}`);
    }
  }
  for (const token of item.mustNotContain || []) {
    if (new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu").test(answer)) {
      failures.push(`must not contain: ${token}`);
    }
  }
  return { ok: failures.length === 0, mode, answer, failures };
}

function main() {
  const dataset = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const rows = dataset.cases.map((item) => ({ item, result: evaluateCase(item) }));
  const ok = rows.filter((r) => r.result.ok).length;
  const gap = rows.length - ok;

  let out = `# Отчёт: deterministic-парафразы SDB702NM\n\n`;
  out += `Дата: ${new Date().toISOString().slice(0, 10)}\n\n`;
  out += `Всего: **${rows.length}** | OK: **${ok}** | GAP: **${gap}**\n\n`;
  out += `Источник: \`data/sdb702nm-deterministic-paraphrases.json\`\n\n---\n\n`;

  for (const { item, result } of rows) {
    out += `## ${item.id}\n\n`;
    out += `**Вопрос:** ${item.question}\n\n`;
    out += `- **Статус:** ${result.ok ? "ok" : "gap"} | **Режим:** ${result.mode}\n\n`;
    if (result.failures.length) {
      out += `- **Проблемы:** ${result.failures.join("; ")}\n\n`;
    }
    out += `${result.answer || "_(нет ответа)_"}\n\n---\n\n`;
  }

  fs.writeFileSync(OUT_PATH, out, "utf8");
  console.log(`Wrote ${OUT_PATH}`);
  console.log(`Total: ${rows.length}, OK: ${ok}, GAP: ${gap}`);
  process.exitCode = gap > 0 ? 1 : 0;
}

main();
