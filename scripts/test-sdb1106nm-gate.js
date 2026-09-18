/**
 * Тесты pre-gate / deterministic / API для SDB1106NM.
 * node scripts/test-sdb1106nm-gate.js [--api http://127.0.0.1:3000]
 */

const {
  classifySdb1106nmMessage,
  SCOPE_REJECT_REPLY,
} = require("../src/rag/sdb1106nm-chat-gate");
const { tryDeterministicSdb1106nmAnswer } = require("../src/rag/sdb1106nm-direct-facts");
const { buildSdb1106nmDirectSystemPrompt } = require("../src/rag/prompts");

const GATE_CASES = [
  { label: "off-topic welding", message: "Как сварить алюминий?", expectGate: "OFF_TOPIC" },
  { label: "off-topic wattsan", message: "Расскажи про Wattsan", expectGate: "OFF_TOPIC" },
  { label: "off-topic bitcoin", message: "Что такое bitcoin?", expectGate: "OFF_TOPIC" },
  { label: "off-topic python", message: "Расскажи про Python", expectGate: "OFF_TOPIC" },
  { label: "off-topic borscht", message: "Как приготовить борщ?", expectGate: "OFF_TOPIC" },
  { label: "off-topic greeting", message: "Привет", expectGate: "OFF_TOPIC" },
  { label: "foreign SDB302", message: "Мощность SDB302", expectGate: "FOREIGN_MODEL" },
  { label: "smoke", message: "Внимание, дым!", expectGate: "SAFETY", expectDet: /отключ/i },
  { label: "regen shutdown", message: "Можно выключить при регенерации?", expectGate: "SAFETY", expectDet: /ЗАПРЕЩАЕТСЯ/i },
  {
    label: "broken door glass",
    message: "Разбилось стекло в двери",
    expectGate: "IN_SCOPE",
    expectDet: /механическ[\s\S]*8 \(800\) 200-54-17/i,
    expectDetNot: /марка или тип стекла/i,
  },
  {
    label: "broken glass follow-up",
    message: "Оно разбилось",
    history: [{ role: "user", content: "Разбилось стекло в двери" }],
    equipmentChatScoped: true,
    expectGate: "IN_SCOPE",
    expectDet: /механическ[\s\S]*8 \(800\) 200-54-17/i,
    expectDetNot: /замене \*\*двери\*\*/i,
  },
  {
    label: "broken door not glass",
    message: "Сломалась дверь, как починить?",
    expectGate: "IN_SCOPE",
    expectDet: /замене \*\*двери\*\*/i,
    expectDetNot: /стекла двери/i,
  },
  {
    label: "door after glass history uses door",
    message: "Сломалась дверь, как починить?",
    history: [{ role: "user", content: "Разбилось стекло в двери" }],
    equipmentChatScoped: true,
    expectGate: "IN_SCOPE",
    expectDet: /замене \*\*двери\*\*/i,
    expectDetNot: /стекла двери/i,
  },
  {
    label: "replace lcd",
    message: "Как заменить LCD",
    expectGate: "IN_SCOPE",
    expectDet: /нет инструкции по замене[\s\S]*8 \(800\) 200-54-17/i,
  },
  {
    label: "replace lock",
    message: "Как заменить замок",
    expectGate: "IN_SCOPE",
    expectDet: /нет инструкции по замене[\s\S]*8 \(800\) 200-54-17/i,
  },
  {
    label: "replace wheels",
    message: "Как заменить колёса",
    expectGate: "IN_SCOPE",
    expectDet: /нет инструкции по замене[\s\S]*8 \(800\) 200-54-17/i,
  },
  {
    label: "replace heating",
    message: "Как починить подогрев",
    expectGate: "IN_SCOPE",
    expectDet: /нет инструкции по замене[\s\S]*8 \(800\) 200-54-17/i,
  },
  {
    label: "desiccant replace stays documented",
    message: "Как заменить осушитель",
    expectGate: "IN_SCOPE",
    expectDet: /36\s*месяц/i,
    expectDetNot: /нет инструкции по замене/i,
  },
  {
    label: "seal replace stays documented",
    message: "Как заменить уплотнитель",
    expectGate: "IN_SCOPE",
    expectDetNot: /нет инструкции по замене/i,
  },
  {
    label: "cable replace stays documented",
    message: "Как заменить кабель питания",
    expectGate: "IN_SCOPE",
    expectDetNot: /нет инструкции по замене/i,
  },
  {
    label: "sound signal stays troubleshooting",
    message: "Как починить звуковой сигнал",
    expectGate: "IN_SCOPE",
    expectDetNot: /нет инструкции по замене/i,
  },
  {
    label: "repair contact",
    message: "Куда мне обратиться, чтобы починили",
    expectGate: "CONTACT_SUPPORT",
    expectDet: /8 \(800\) 200-54-17/,
  },
  {
    label: "sovtest phone",
    message: "Как позвонить в совтест",
    expectGate: "CONTACT_SUPPORT",
    expectDet: /info@sovtest-ate\.ru/,
  },
  { label: "power in-scope", message: "Какая мощность SDB1106NM в режиме хранения?", expectGate: "IN_SCOPE", expectDet: /8\s*Вт/i },
  {
    label: "volume trap 1028",
    message: "Какой объём шкафа SDB1106NM в литрах?",
    expectGate: "IN_SCOPE",
    expectDet: /не указан|1028/i,
    expectDetNot: /^1028 л/i,
  },
];

const HISTORY_CASES = [
  {
    label: "history bypass welding",
    message: "Как сварить алюминий?",
    history: [{ role: "user", content: "Какая мощность в режиме хранения?" }],
    expectGate: "OFF_TOPIC",
  },
  {
    label: "history bypass wattsan",
    message: "Расскажи про Wattsan",
    history: [{ role: "user", content: "Сколько полок в комплекте?" }],
    expectGate: "OFF_TOPIC",
  },
  {
    label: "follow-up sensor functions",
    message: "Какие функции у датчиков",
    history: [{ role: "user", content: "Кто производит датчик RH внутри камеры — Siemens или другой?" }],
    expectGate: "IN_SCOPE",
  },
  {
    label: "sensor functions standalone",
    message: "Какие функции у датчиков шкафа?",
    expectGate: "IN_SCOPE",
  },
  {
    label: "human IP scoped chat",
    message: "От воды и пыли какой там IP у корпуса, не помню",
    expectGate: "IN_SCOPE",
    equipmentChatScoped: true,
  },
  {
    label: "human solvent scoped",
    message: "Можно ли туда растворитель на ночь оставить?",
    expectGate: "IN_SCOPE",
    equipmentChatScoped: true,
  },
];

const API_CASES = [
  { label: "api off-topic", message: "Как сварить алюминий?", expectMode: "SCOPE_GATE" },
  { label: "api python", message: "Расскажи про Python", expectMode: "SCOPE_GATE" },
  { label: "api foreign model", message: "Мощность SDB302", expectMode: "SCOPE_GATE" },
  {
    label: "api smoke",
    message: "Внимание, дым!",
    expectMode: "SAFETY_DETERMINISTIC",
    expectInAnswer: "отключ",
  },
  {
    label: "api history off-topic",
    message: "Как сварить алюминий?",
    history: [{ role: "user", content: "Каков вес шкафа?" }],
    expectMode: "SCOPE_GATE",
  },
];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function runGateTests() {
  let pass = 0;
  let fail = 0;

  for (const c of [...GATE_CASES, ...HISTORY_CASES]) {
    try {
      const gate = classifySdb1106nmMessage(c.message, {
        history: c.history || [],
        equipmentChatScoped: Boolean(c.equipmentChatScoped),
      });
      assert(gate.action === c.expectGate, `[${c.label}] gate ${gate.action} != ${c.expectGate}`);
      if (c.expectDet || c.expectDetNot) {
        const det = tryDeterministicSdb1106nmAnswer(c.message, { history: c.history || [] }) || "";
        if (c.expectDet) {
          assert(c.expectDet.test(det), `[${c.label}] deterministic failed: ${String(det).slice(0, 80)}`);
        }
        if (c.expectDetNot) {
          assert(!c.expectDetNot.test(det), `[${c.label}] forbidden deterministic content`);
        }
      }
      console.log(`PASS  gate  ${c.label}`);
      pass++;
    } catch (e) {
      console.error(`FAIL  gate  ${c.label}: ${e.message}`);
      fail++;
    }
  }

  try {
    const prompt = buildSdb1106nmDirectSystemPrompt(
      { id: "sdb1106-nm", name: "SDB1106NM", summary: "1028 л маркетинг" },
      { manualLoaded: true }
    );
    assert(/КРИТИЧЕСКАЯ БЕЗОПАСНОСТЬ|ТОЛЬКО МОЙ ШКАФ/i.test(prompt), "unified prompt missing safety rules");
    assert(!prompt.includes("1028"), "catalog leaked into prompt");
    console.log("PASS  gate  unified-prompt-no-catalog");
    pass++;
  } catch (e) {
    console.error(`FAIL  gate  unified-prompt: ${e.message}`);
    fail++;
  }

  return { pass, fail };
}

async function chatApi(baseUrl, message, history = []) {
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      equipmentId: "sdb1106-nm",
      message,
      history,
      directContextMode: false,
    }),
  });
  const body = await res.json();
  return { status: res.status, body };
}

async function runApiTests(baseUrl) {
  let pass = 0;
  let fail = 0;
  for (const c of API_CASES) {
    try {
      const { status, body } = await chatApi(baseUrl, c.message, c.history || []);
      assert(status === 200, `[${c.label}] HTTP ${status}`);
      if (c.expectMode) {
        assert(
          body.ragTrace?.mode === c.expectMode,
          `[${c.label}] mode=${body.ragTrace?.mode} expected ${c.expectMode}`
        );
      }
      const ans = String(body.answer || "").toLowerCase();
      if (c.expectInAnswer) {
        assert(ans.includes(c.expectInAnswer.toLowerCase()), `[${c.label}] answer missing "${c.expectInAnswer}"`);
      }
      if (c.expectMode === "SCOPE_GATE") {
        assert(
          ans.includes("sdb1106nm") || ans.includes("sdb1106"),
          `[${c.label}] scope reply should mention SDB1106NM`
        );
      }
      console.log(
        `PASS  api   ${c.label} mode=${body.ragTrace?.mode} preview=${String(body.answer).slice(0, 72)}…`
      );
      pass++;
    } catch (e) {
      console.error(`FAIL  api   ${c.label}: ${e.message}`);
      if (e.message.includes("mode=")) {
        console.error("       (перезапустите сервер: npm run dev)");
      }
      fail++;
    }
  }
  return { pass, fail };
}

async function main() {
  const apiArg = process.argv.indexOf("--api");
  const baseUrl = apiArg >= 0 ? process.argv[apiArg + 1] : null;

  console.log("=== Gate / deterministic (offline) ===");
  const gate = runGateTests();
  console.log(`Gate: ${gate.pass} pass, ${gate.fail} fail\n`);

  if (baseUrl) {
    console.log(`=== API tests (${baseUrl}) ===`);
    const api = await runApiTests(baseUrl);
    console.log(`API: ${api.pass} pass, ${api.fail} fail\n`);
    process.exit(gate.fail + api.fail > 0 ? 1 : 0);
  } else {
    console.log("Пропуск API (передайте --api http://127.0.0.1:3000)\n");
    process.exit(gate.fail > 0 ? 1 : 0);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
