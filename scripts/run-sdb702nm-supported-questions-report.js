/**
 * Offline-отчёт по data/sdb702nm-supported-questions.md (без LLM/RAG).
 * node scripts/run-sdb702nm-supported-questions-report.js [--out data/sdb702nm-supported-questions-report.md]
 */

const fs = require("fs");
const path = require("path");
const { classifySdb702nmMessage } = require("../src/rag/sdb702nm-chat-gate");
const { tryDeterministicSdb702nmAnswer } = require("../src/rag/sdb702nm-direct-facts");
const { isEmergencySmokeQuery } = require("../src/rag/safety-query-scope");

const MD_PATH = path.join(__dirname, "..", "data", "sdb702nm-supported-questions.md");
const OUT_PATH =
  process.argv.includes("--out")
    ? process.argv[process.argv.indexOf("--out") + 1]
    : path.join(__dirname, "..", "data", "sdb702nm-supported-questions-report.md");

function parseQuestions(md) {
  const lines = md.split(/\r?\n/);
  const items = [];
  let section = "";
  let inExamples = false;

  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      section = line.replace(/^##\s+/, "").trim();
      inExamples = /примеры|что система не обещает|как устроены|основа перечня|неподдерживаем/i.test(
        section,
      );
      continue;
    }
    if (/^-\s+/.test(line) && !inExamples && !/^\*На последние/.test(line)) {
      const q = line.replace(/^-\s+/, "").trim();
      if (q && !q.startsWith("*")) {
        items.push({ section, question: q });
      }
    }
  }
  return items;
}

function isAbstainAnswer(answer) {
  const text = String(answer || "").toLowerCase();
  return (
    text.includes("не указан") ||
    text.includes("не указано") ||
    text.includes("отсутствует в документации") ||
    text.includes("этот параметр не указан")
  );
}

function resolveAnswer(question) {
  const gate = classifySdb702nmMessage(question);
  if (gate.action === "FOREIGN_MODEL" || gate.action === "OFF_TOPIC" || gate.action === "CHATTER") {
    return { mode: "CHAT_GATE", key: gate.action, answer: gate.reply };
  }
  if (gate.action === "UNSUPPORTED_SPEC") {
    return { mode: "UNSUPPORTED_SPEC", key: "unsupported_parameter", answer: gate.reply };
  }

  const deterministic = tryDeterministicSdb702nmAnswer(question);
  if (deterministic) {
    return { mode: "DETERMINISTIC", key: null, answer: deterministic };
  }

  if (isEmergencySmokeQuery(question)) {
    return {
      mode: "SAFETY",
      key: "emergency_smoke",
      answer:
        "При появлении **дыма**, запаха **гари** или других признаков аварии SDB702NM (п. **2.4**): **немедленно отключите питание** (вилку из розетки или тумблер «ВЫКЛ»). Не проверяйте уплотнители, замки или RH до обесточивания.",
    };
  }

  return { mode: "GAP", key: null, answer: null };
}

function main() {
  const md = fs.readFileSync(MD_PATH, "utf8");
  const items = parseQuestions(md);
  const rows = items.map((item, idx) => {
    const res = resolveAnswer(item.question);
    let status = "ok";
    if (!res.answer) {
      status = "gap";
    } else if (res.mode === "UNSUPPORTED_SPEC" || isAbstainAnswer(res.answer)) {
      status = "abstain";
    }
    return { num: idx + 1, ...item, ...res, status };
  });

  const ok = rows.filter((r) => r.status === "ok").length;
  const gap = rows.filter((r) => r.status === "gap").length;
  const abstain = rows.filter((r) => r.status === "abstain").length;

  let out = `# Отчёт: supported-questions → ответы SOVA (SDB702NM)\n\n`;
  out += `Дата: ${new Date().toISOString().slice(0, 10)}\n\n`;
  out += `Всего вопросов: **${rows.length}** | OK: **${ok}** | GAP: **${gap}** | Abstain: **${abstain}**\n\n`;
  out += `Источник: deterministic facts + chat pre-gate (без LLM/RAG).\n\n`;
  out += `---\n\n`;

  let curSection = "";
  for (const r of rows) {
    if (r.section !== curSection) {
      curSection = r.section;
      out += `## ${curSection}\n\n`;
    }
    out += `### ${r.num}. ${r.question}\n\n`;
    out += `- **Статус:** ${r.status} | **Режим:** ${r.mode}`;
    if (r.key) {
      out += ` | **Ключ:** \`${r.key}\``;
    }
    out += `\n\n`;
    if (r.answer) {
      out += `${r.answer}\n\n`;
    } else {
      out += `_Ответ не сформирован offline. В чате — RAG по руководству или «Информация отсутствует в документации.»_\n\n`;
    }
    out += `---\n\n`;
  }

  if (gap > 0) {
    out += `## Вопросы без offline-ответа (GAP → RAG в чате)\n\n`;
    for (const r of rows.filter((x) => x.status === "gap")) {
      out += `- ${r.num}. ${r.question}\n`;
    }
    out += `\n`;
  }

  if (abstain > 0) {
    out += `## Честный отказ (в РЭ нет данных)\n\n`;
    for (const r of rows.filter((x) => x.status === "abstain")) {
      out += `- ${r.num}. ${r.question}${r.key ? ` (\`${r.key}\`)` : ""}\n`;
    }
    out += `\n`;
  }

  fs.writeFileSync(OUT_PATH, out, "utf8");
  console.log(`Wrote ${OUT_PATH}`);
  console.log(`Total: ${rows.length}, OK: ${ok}, GAP: ${gap}, Abstain: ${abstain}`);
  if (gap > 0) {
    process.exitCode = 1;
  }
}

main();
