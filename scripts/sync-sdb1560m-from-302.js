/**
 * Архитектура чата SDB302NM → SDB1560M (sdb1560m).
 * node scripts/sync-sdb1560m-from-302.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const GOLDEN = fs.readFileSync(
  path.join(ROOT, "knowledge", "sdb1560m", "golden-facts-sdb1560m.md"),
  "utf8",
);

const SOURCE_FILES = [
  ["src/rag/sdb302nm-chat-gate.js", "chat-gate"],
  ["src/rag/sdb302nm-rag-priority.js", "rag-priority"],
  ["src/rag/sdb302nm-prompt-rules.js", "prompt-rules"],
  ["src/rag/sdb302nm-direct-facts.js", "direct-facts"],
  ["src/rag/sdb302nm-procedure-validation.js", "procedure-validation"],
  ["src/rag/sdb302nm-answer-validation.js", "answer-validation"],
  ["src/rag/sdb302nm-post-gate.js", "post-gate"],
  ["src/rag/sdb302nm-unsupported-spec.js", "unsupported"],
  ["scripts/test-sdb302nm-profile.js", "test"],
];

function rep(s, from, to) {
  return s.split(from).join(to);
}

function transform302to1560(content, fileKind) {
  let s = content;
  const pairs = [
    ["sdb302nm", "sdb1560m"],
    ["Sdb302nm", "Sdb1560m"],
    ["SDB302NM", "SDB1560NM"],
    ["SDB302 NM", "SDB1560 M"],
    ["sdb302-nm", "sdb1560m"],
    ['id === "w-700" || id === "sdb302-nm"', 'id === "sdb1560m"'],
    ['postGate: "w-700"', 'postGate: "sdb1560m"'],
    ['{ id: "w-700", name: "SDB302NM" }', '{ id: "sdb1560m", name: "SDB1560NM" }'],
    ["validationProfile: \"sdb302\"", "validationProfile: \"sdb1560\""],
    ["trusted_sdb302_deterministic_fact", "trusted_sdb1560_deterministic_fact"],
    ["sdb302_deterministic_recovery_pre_guardrails", "sdb1560_deterministic_recovery_pre_guardrails"],
    ["sdb302ForeignModelLeakFailures", "sdb1560ForeignModelLeakFailures"],
    ["sdb302InventedProcedureFailures", "sdb1560InventedProcedureFailures"],
    ["isUnsupportedSdb302nmSpecQuery", "isUnsupportedSdb1560mSpecQuery"],
    ["buildUnsupportedSdb302nmSpecReply", "buildUnsupportedSdb1560mSpecReply"],
    ["./sdb302nm-unsupported-spec", "./sdb1560m-unsupported-spec"],
    ["602 × 1358 × 772", "1202 × 1693 × 1028"],
    ["602×1358×772", "1202×1693×1028"],
    ["1358", "1693"],
    ["70 кг", "260 кг"],
    ["**5 полок**", "**2 полки**"],
    ["5 полок", "2 полки"],
    ["5 перфорированных полок", "2 полки"],
    ["**2 двери**", "**4 двери**"],
    ["2 двери", "4 двери"],
    ["500 л", "1 896 л"],
    ["546 л", "2 070 л"],
    ["500", "1896"],
    ["546", "2070"],
    ["не более 285 Вт", "не более 540 Вт"],
    ["285 Вт", "540 Вт"],
    ["не более 20 Вт", "не более 40 Вт"],
    ["не более 3 часов", "не более 180 минут"],
    ["3 часов", "180 минут"],
    [
      "Не подставляй значения моделей SDB1106NM и SDB702NM.",
      "Не подставляй значения моделей SDB1106NM, SDB702NM и SDB302NM.",
    ],
    ["SDB1106, SDB1106NM, SDB702, SDB151", "SDB1106, SDB1106NM, SDB302, SDB702, SDB151"],
    [
      "Не подставляй 540 Вт (SDB1106NM), 285 Вт регенерации SDB702NM и другие чужие значения.",
      "Не подставляй 285 Вт регенерации SDB302NM, 90 кг / 743 л SDB702NM и другие чужие значения.",
    ],
    ["SDB302NM profile checks", "SDB1560M profile checks"],
    ["test-sdb302nm-profile.js", "test-sdb1560m-profile.js"],
    ["нагрузка на стандартную полку — не более 50 кг", "нагрузка на стандартную полку — не более 100 кг"],
    ["не более 50 кг", "не более 100 кг"],
  ];
  for (const [from, to] of pairs) {
    s = rep(s, from, to);
  }

  if (fileKind === "chat-gate") {
    s = s.replace(/(?:wattsan\|)/, "wattsan|sdb1560|1560|");
  }

  if (fileKind === "procedure-validation") {
    s = s.replace(
      /\{ re: \/\\b90\\s\*кг\\b\/i, claim: "90 кг" \},/,
      `{ re: /\\b70\\s*кг\\b/i, claim: "70 кг" },
  { re: /\\b90\\s*кг\\b/i, claim: "90 кг" },
  { re: /\\b500\\s*(?:л|l)(?![\\p{L}\\d])/iu, claim: "500 л" },
  { re: /\\b546\\s*(?:л|l)(?![\\p{L}\\d])/iu, claim: "546 л" },
  { re: /\\b743(?:\\s*(?:л|l))?(?![\\p{L}\\d])/iu, claim: "743 л" },
  { re: /\\b770(?:\\s*(?:л|l))?(?![\\p{L}\\d])/iu, claim: "770 л" },
  { re: /\\b1358\\b/i, claim: "1358" },
  { re: /\\b1952\\b/i, claim: "1952" },`,
    );
    s = s.replace(
      /if \(\/\\bSDB\(\?:151\|1106\|702\)/,
      "if (/\\bSDB(?:151|302|702|1106)",
    );
    s = s.replace(
      /!\/\\bSDB\(\?:151\|1106\|702\)/,
      "!/\\bSDB(?:151|302|702|1106)",
    );
  }

  if (fileKind === "post-gate") {
    if (!s.includes("foreign_model_mention_other_sdb")) {
      s = s.replace(
        `"foreign_model_mention_sdb1106",`,
        `"foreign_model_mention_other_sdb",
  "foreign_model_mention_sdb1106",`,
      );
    }
  }

  if (fileKind === "test") {
    s = rep(s, '["внутренний объем", "500"]', '["внутренний объем", "1896"]');
    s = rep(s, '["Какой полный объем шкафа?", "546"]', '["Какой полный объем шкафа?", "2070"]');
    s = rep(s, '["Сколько полок?", "5"]', '["Сколько полок?", "2"]');
    s = rep(s, '["Сколько дверей?", "2"]', '["Сколько дверей?", "4"]');
    s = rep(s, '["Какой вес?", "70"]', '["Какой вес?", "260"]');
    s = rep(
      s,
      '["Что входит в базовую комплектацию?", "5 перфорированных полок"]',
      '["Что входит в базовую комплектацию?", "2 полки"]',
    );
    s = rep(s, '["Влезет в дверной проём? какой он высокий", "1358"]', '["Влезет в дверной проём? какой он высокий", "1693"]');
    s = rep(s, "/70\\s*кг/u", "/260\\s*кг/u");
    s = rep(s, "602×1358×772", "1202×1693×1028");
    s = rep(s, "SDB302. Эксплуатация", "SDB1560. Эксплуатация");
    s = rep(s, "поставку 302?", "поставку 1560?");
    s = rep(s, '"w-700", "retrieval-cards"', '"sdb1560m", "retrieval-cards"');
    s = rep(s, 'equipmentName: "SDB302 NM"', 'equipmentName: "SDB1560 M"');
    s = rep(
      s,
      'const equipment = { id: "w-700", name: "SDB302 NM" };',
      'const equipment = { id: "sdb1560m", name: "SDB1560 M" };',
    );
    s = rep(s, "assert.doesNotMatch(factorySerial, /SDB702NM/u)", "assert.doesNotMatch(factorySerial, /SDB302NM/u)");
    s = rep(
      s,
      'assert.doesNotMatch(tryDeterministicSdb702nmAnswer("Где на шкафу серийный номер искать?"), /SDB702NM/u)',
      'assert.doesNotMatch(tryDeterministicSdb1560mAnswer("Где на шкафу серийный номер искать?"), /SDB302NM/u)',
    );
    s = rep(
      s,
      'tryDeterministicSdb302nmAnswer',
      'tryDeterministicSdb1560mAnswer',
    );
    if (!s.includes("resolveEquipmentProfile")) {
      s += `
const profile = require("../src/equipment/profiles/sdb1560m");
const { resolveEquipmentProfile } = require("../src/equipment/equipment-runtime");
assert.equal(resolveEquipmentProfile("sdb1560m"), profile);
`;
    }
  }

  if (fileKind === "direct-facts" || fileKind === "rag-priority") {
    s = rep(s, "1358", "1693");
  }

  return s;
}

function escapeTemplateLiteral(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

function postProcess1560DirectFacts(s) {
  const critical = escapeTemplateLiteral(GOLDEN.split("\n").slice(2).join("\n").trim());
  s = s.replace(
    /const SDB1560NM_CRITICAL_FACTS = `[\s\S]*?`\.trim\(\);/,
    `const SDB1560NM_CRITICAL_FACTS = \`
=== ПОДТВЕРЖДЁННЫЕ ФАКТЫ SDB1560NM ===
${critical}
=== КОНЕЦ ПОДТВЕРЖДЁННЫХ ФАКТОВ ===
\`.trim();`,
  );
  s = s.replace(
    /const ANSWER_WHEELS_KIT =[\s\S]*?";/,
    `const ANSWER_WHEELS_KIT =
  "В базовой поставке SDB1560M (табл. **1.2**): **4 колеса** для транспортирования и **4 регулируемые по высоте ножки** (max. 50 мм).";`,
  );
  s = s.replace(
    "В базовой поставке SDB1560NM (табл. **1.2**): **4 колеса**",
    "В базовой поставке SDB1560M (табл. **1.2**): **4 колеса**",
  );
  return s;
}

function writeDest(destRel, content) {
  fs.writeFileSync(path.join(ROOT, destRel), content);
  console.log("wrote", destRel);
}

for (const [srcRel, kind] of SOURCE_FILES) {
  const src = fs.readFileSync(path.join(ROOT, srcRel), "utf8");
  let content = transform302to1560(src, kind);
  if (kind === "direct-facts") {
    content = postProcess1560DirectFacts(content);
  }
  if (kind === "test") {
    content = postProcess1560Test(content);
  }
  const destRel = srcRel
    .replace("sdb302nm", "sdb1560m")
    .replace("test-sdb302nm", "test-sdb1560m");
  writeDest(destRel, content);
}

function postProcess1560Test(s) {
  s = rep(s, '["внутренний объем", "1896"]', '["внутренний объем", "1 896"]');
  s = rep(s, '["Какой полный объем шкафа?", "2070"]', '["Какой полный объем шкафа?", "2 070"]');
  s = rep(s, '["Мощность осушения без опций?", "20 Вт"]', '["Мощность осушения без опций?", "40 Вт"]');
  s = rep(s, '["Нагрузка на стандартную полку?", "50 кг"]', '["Нагрузка на стандартную полку?", "100 кг"]');
  s = rep(s, "assert.match(directPrompt, /285\\s*Вт/u)", "assert.match(directPrompt, /540\\s*Вт/u)");
  return s;
}

function copyRetrievalCards() {
  const srcDir = path.join(ROOT, "knowledge", "w-700", "retrieval-cards");
  const destDir = path.join(ROOT, "knowledge", "sdb1560m", "retrieval-cards");
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of fs.readdirSync(srcDir)) {
    if (!name.endsWith(".md")) continue;
    let text = fs.readFileSync(path.join(srcDir, name), "utf8");
    text = rep(text, "SDB302NM", "SDB1560NM");
    text = rep(text, "SDB302", "SDB1560");
    if (name === "feet-wheels.md") {
      text = `# SDB1560M — ножки и колёса

Источник: таблица 1.2 базовый состав поставки.

Факт: для **SDB1560M** в базовую поставку входят **4 колеса** для транспортирования и **4 регулируемые ножки**.
`;
    }
    fs.writeFileSync(path.join(destDir, name), text);
  }
  console.log("copied retrieval-cards -> sdb1560m");
}

copyRetrievalCards();
console.log("Sync SDB1560M from SDB302 complete.");
