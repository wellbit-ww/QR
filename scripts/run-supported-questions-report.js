/**
 * Отчёт по всем вопросам из data/sdb1106nm-supported-questions.md
 * node scripts/run-supported-questions-report.js [--out data/supported-questions-report.md]
 */

const fs = require("fs");
const path = require("path");
const {
  resolveGoldenFactMatch,
  formatGoldenFactAnswer,
} = require("../src/rag/sdb1106nm-golden-facts");
const { tryDeterministicSdb1106nmAnswer } = require("../src/rag/sdb1106nm-direct-facts");

const MD_PATH = path.join(__dirname, "..", "data", "sdb1106nm-supported-questions.md");
const OUT_PATH =
  process.argv.includes("--out") ?
    process.argv[process.argv.indexOf("--out") + 1]
  : path.join(__dirname, "..", "data", "supported-questions-report.md");

const ABSTAIN_KEYS = new Set([
  "volume_liters",
  "sensor_brand_unknown",
  "humidity_calibration_unknown",
  "voltage_surge_not_specified",
  "lighting_option_unknown",
  "chamber_temperature",
  "window_cleaning_alcohol",
]);

function parseQuestions(md) {
  const lines = md.split(/\r?\n/);
  const items = [];
  let section = "";
  let inExamples = false;

  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      section = line.replace(/^##\s+/, "").trim();
      inExamples = /примеры|что система не обещает|как устроены|основа перечня/i.test(section);
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

function resolveAnswer(question) {
  const match = resolveGoldenFactMatch(question);
  const deterministic = tryDeterministicSdb1106nmAnswer(question);
  if (deterministic) {
    return {
      mode: match?.key ? "RAG_DETERMINISTIC" : "DETERMINISTIC",
      key: match?.key || null,
      answer: deterministic,
    };
  }
  if (match?.key) {
    const golden = formatGoldenFactAnswer(match.key, question);
    if (golden) {
      return { mode: "RAG_DETERMINISTIC", key: match.key, answer: golden };
    }
  }
  return { mode: "GAP", key: null, answer: null };
}

function main() {
  const md = fs.readFileSync(MD_PATH, "utf8");
  const items = parseQuestions(md);
  const rows = items.map((item, idx) => {
    const res = resolveAnswer(item.question);
    const status = !res.answer ? "gap" : ABSTAIN_KEYS.has(res.key) ? "abstain" : "ok";
    return { num: idx + 1, ...item, ...res, status };
  });

  const ok = rows.filter((r) => r.status === "ok").length;
  const gap = rows.filter((r) => r.status === "gap").length;
  const abstain = rows.filter((r) => r.status === "abstain").length;

  let out = `# Отчёт: supported-questions → ответы SOVA (SDB1106NM)\n\n`;
  out += `Дата: ${new Date().toISOString().slice(0, 10)}\n\n`;
  out += `Всего вопросов: **${rows.length}** | OK: **${ok}** | GAP (нет golden): **${gap}** | Abstain-ответ: **${abstain}**\n\n`;
  out += `Источник: golden-router + deterministic fallbacks (без LLM/RAG).\n\n`;
  out += `---\n\n`;

  let curSection = "";
  for (const r of rows) {
    if (r.section !== curSection) {
      curSection = r.section;
      out += `## ${curSection}\n\n`;
    }
    out += `### ${r.num}. ${r.question}\n\n`;
    out += `- **Статус:** ${r.status} | **Режим:** ${r.mode}`;
    if (r.key) out += ` | **Ключ:** \`${r.key}\``;
    out += `\n\n`;
    if (r.answer) {
      out += `${r.answer}\n\n`;
    } else {
      out += `_Ответ не сформирован (нет golden-ключа / deterministic). В портале: «В документации на данную модель этот параметр не указан.»_\n\n`;
    }
    out += `---\n\n`;
  }

  if (gap > 0) {
    out += `## Вопросы без ответа (GAP)\n\n`;
    for (const r of rows.filter((x) => x.status === "gap")) {
      out += `- ${r.num}. ${r.question}\n`;
    }
    out += `\n`;
  }

  if (abstain > 0) {
    out += `## Честный отказ (в РЭ нет данных)\n\n`;
    for (const r of rows.filter((x) => x.status === "abstain")) {
      out += `- ${r.num}. ${r.question} (\`${r.key}\`)\n`;
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
