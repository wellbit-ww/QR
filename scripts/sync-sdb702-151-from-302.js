/**
 * Перенос архитектуры чата SDB302NM (w-700) на SDB702NM и SDB151NM.
 * Источник правды: src/rag/sdb302nm-*.js и scripts/test-sdb302nm-profile.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const catalogJs = fs.readFileSync(path.join(ROOT, "src/equipment/catalogs/sdb151-nm.js"), "utf8");
const SDB151_CRITICAL_FACTS = catalogJs.match(/criticalFacts: `([\s\S]*?)`\s*\.trim\(\)/)[1].trim();

const SOURCE_FILES = [
  ["src/rag/sdb302nm-chat-gate.js", "chat-gate"],
  ["src/rag/sdb302nm-rag-priority.js", "rag-priority"],
  ["src/rag/sdb302nm-prompt-rules.js", "prompt-rules"],
  ["src/rag/sdb302nm-direct-facts.js", "direct-facts"],
  ["src/rag/sdb302nm-procedure-validation.js", "procedure-validation"],
  ["src/rag/sdb302nm-answer-validation.js", "answer-validation"],
  ["src/rag/sdb302nm-post-gate.js", "post-gate"],
  ["scripts/test-sdb302nm-profile.js", "test"],
];

function rep(s, from, to) {
  return s.split(from).join(to);
}

function transform302to702(content, fileKind) {
  let s = content;
  const pairs = [
    ["sdb302nm", "sdb702nm"],
    ["Sdb302nm", "Sdb702nm"],
    ["SDB302NM", "SDB702NM"],
    ["SDB302 NM", "SDB702 NM"],
    ["validationProfile: \"sdb302\"", "validationProfile: \"sdb702\""],
    ["trusted_sdb302_deterministic_fact", "trusted_sdb702_deterministic_fact"],
    ["sdb302_deterministic_recovery_pre_guardrails", "sdb702_deterministic_recovery_pre_guardrails"],
    ["sdb302ForeignModelLeakFailures", "sdb702ForeignModelLeakFailures"],
    ["sdb302InventedProcedureFailures", "sdb702InventedProcedureFailures"],
    ['id === "w-700" || id === "sdb302-nm"', 'id === "sdb702-nm"'],
    ['postGate: "w-700"', 'postGate: "sdb702-nm"'],
    ['{ id: "w-700", name: "SDB302NM" }', '{ id: "sdb702-nm", name: "SDB702NM" }'],
    ["500 л", "743 л"],
    ["546 л", "770 л"],
    ["602 × 1358 × 772", "602 × 1952 × 772"],
    ["602×1358×772", "602×1952×772"],
    ["70 кг", "90 кг"],
    ["**5 полок**", "**7 полок**"],
    ["5 полок", "7 полок"],
    ["5 перфорированных полок", "7 перфорированных полок"],
    ["**2 двери**", "**3 двери**"],
    ["2 двери", "3 двери"],
    [
      "Не подставляй значения моделей SDB1106NM и SDB702NM.",
      "Не подставляй значения модели SDB1106NM.",
    ],
    ["SDB1106, SDB1106NM, SDB702, SDB151", "SDB1106, SDB1106NM, SDB302, SDB151"],
    [
      "Не подставляй 540 Вт (SDB1106NM), 285 Вт регенерации SDB702NM и другие чужие значения.",
      "Не подставляй 540 Вт и другие значения SDB1106NM.",
    ],
    ["SDB302NM profile checks", "SDB702NM profile checks"],
    ["test-sdb302nm-profile.js", "test-sdb702nm-profile.js"],
    ["isUnsupportedSdb302nmSpecQuery", "isUnsupportedSdb702nmSpecQuery"],
    ["buildUnsupportedSdb302nmSpecReply", "buildUnsupportedSdb702nmSpecReply"],
    ["./sdb302nm-unsupported-spec", "./sdb702nm-unsupported-spec"],
  ];
  for (const [from, to] of pairs) {
    s = rep(s, from, to);
  }

  if (fileKind === "chat-gate") {
    s = s.replace(
      /(?:wattsan\|)/,
      "wattsan|w-700|w\\s*700|",
    );
  }

  if (fileKind === "procedure-validation") {
    s = s.replace(
      /\{ re: \/\\b90\\s\*кг\\b\/i, claim: "90 кг" \},/,
      `{ re: /\\b70\\s*кг\\b/i, claim: "70 кг" },
  { re: /\\b500\\s*(?:л|l)(?![\\p{L}\\d])/iu, claim: "500 л" },
  { re: /\\b546\\s*(?:л|l)(?![\\p{L}\\d])/iu, claim: "546 л" },
  { re: /\\b1358\\b/i, claim: "1358" },`,
    );
    s = s.replace(/\{ re: \/\\b743\\b\/i, claim: "743" \},\n/g, "");
    s = s.replace(/\{ re: \/\\b1952\\b\/i, claim: "1952" \},\n/g, "");
    s = s.replace(
      /if \(\/\\bSDB\(\?:151\|1106\|702\)/,
      "if (/\\bSDB(?:151|1106|302)",
    );
    s = s.replace(
      /!\/\\bSDB\(\?:151\|1106\|702\)/,
      "!/\\bSDB(?:151|1106|302)",
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
    s = rep(s, '["внутренний объем", "500"]', '["внутренний объем", "743"]');
    s = rep(s, '["Какой полный объем шкафа?", "546"]', '["Какой полный объем шкафа?", "770"]');
    s = rep(s, '["Сколько полок?", "5"]', '["Сколько полок?", "7"]');
    s = rep(s, '["Сколько дверей?", "2"]', '["Сколько дверей?", "3"]');
    s = rep(s, '["Какой вес?", "70"]', '["Какой вес?", "90"]');
    s = rep(s, '["Что входит в базовую комплектацию?", "5 перфорированных полок"]', '["Что входит в базовую комплектацию?", "7 перфорированных полок"]');
    s = rep(s, '["Влезет в дверной проём? какой он высокий", "1358"]', '["Влезет в дверной проём? какой он высокий", "1952"]');
    s = rep(s, "/70\\s*кг/u", "/90\\s*кг/u");
    s = rep(s, "602×1358×772", "602×1952×772");
    s = rep(s, "SDB302. Эксплуатация", "SDB702. Эксплуатация");
    s = rep(s, "поставку 302?", "поставку 702?");
    s = rep(s, '"w-700", "retrieval-cards"', '"sdb702-nm", "retrieval-cards"');
    s = rep(s, 'equipmentName: "SDB302 NM"', 'equipmentName: "SDB702 NM"');
    s = rep(s, 'const equipment = { id: "w-700", name: "SDB302 NM" };', 'const equipment = { id: "sdb702-nm", name: "SDB702 NM" };');
    s = rep(s, "assert.doesNotMatch(factorySerial, /SDB702NM/u)", "assert.doesNotMatch(factorySerial, /SDB302NM/u)");
    s = rep(
      s,
      'assert.doesNotMatch(tryDeterministicSdb702nmAnswer("Где на шкафу серийный номер искать?"), /SDB702NM/u)',
      'assert.doesNotMatch(tryDeterministicSdb702nmAnswer("Где на шкафу серийный номер искать?"), /SDB302NM/u)',
    );
  }

  if (fileKind === "direct-facts" || fileKind === "rag-priority") {
    s = rep(s, "1358", "1952");
  }

  return s;
}

function transform302to151(content, fileKind) {
  let s = content;
  const pairs = [
    ["sdb302nm", "sdb151nm"],
    ["Sdb302nm", "Sdb151nm"],
    ["SDB302NM", "SDB151NM"],
    ["SDB302 NM", "SDB151 NM"],
    ['id === "w-700" || id === "sdb302-nm"', 'id === "sdb151-nm"'],
    ['postGate: "w-700"', 'postGate: "sdb151-nm"'],
    ['{ id: "w-700", name: "SDB302NM" }', '{ id: "sdb151-nm", name: "SDB151NM" }'],
    ["validationProfile: \"sdb302\"", "validationProfile: \"sdb151\""],
    ["trusted_sdb302_deterministic_fact", "trusted_sdb151_deterministic_fact"],
    ["sdb302_deterministic_recovery_pre_guardrails", "sdb151_deterministic_recovery_pre_guardrails"],
    ["sdb302ForeignModelLeakFailures", "sdb151ForeignModelLeakFailures"],
    ["sdb302InventedProcedureFailures", "sdb151InventedProcedureFailures"],
    ["isUnsupportedSdb302nmSpecQuery", "isUnsupportedSdb151nmSpecQuery"],
    ["buildUnsupportedSdb302nmSpecReply", "buildUnsupportedSdb151nmSpecReply"],
    ["./sdb302nm-unsupported-spec", "./sdb151nm-unsupported-spec"],
    ["602 × 1358 × 772", "602 × 655 × 772"],
    ["602×1358×772", "602×655×772"],
    ["70 кг", "46 кг"],
    ["**5 полок**", "**3 перфорированные полки**"],
    ["5 полок", "3 перфорированные полки"],
    ["5 перфорированных полок", "3 перфорированные полки"],
    ["500 л", "не указан"],
    ["546 л", "не указан"],
    ["**2 двери**", "**количество дверей не подтверждено**"],
    ["2 двери", "количество дверей не подтверждено"],
    [
      "Не подставляй значения моделей SDB1106NM и SDB702NM.",
      "Не подставляй модельные значения SDB302NM, SDB702NM или SDB1106NM.",
    ],
    ["SDB1106, SDB1106NM, SDB702, SDB151", "SDB1106, SDB1106NM, SDB302, SDB702"],
    [
      "Не подставляй 540 Вт (SDB1106NM), 285 Вт регенерации SDB702NM и другие чужие значения.",
      "Не подставляй 540 Вт (SDB1106NM), 90 кг / 743 л (SDB702NM) и другие чужие значения.",
    ],
    ["SDB302NM profile checks", "SDB151NM profile checks"],
    ["test-sdb302nm-profile.js", "test-sdb151nm-profile.js"],
  ];
  for (const [from, to] of pairs) {
    s = rep(s, from, to);
  }

  if (fileKind === "procedure-validation") {
    s = s.replace(
      /if \(\/\\bSDB\(\?:151\|1106\|702\)/,
      "if (/\\bSDB(?:302|702|1106)",
    );
    s = s.replace(
      /!\/\\bSDB\(\?:151\|1106\|702\)/,
      "!/\\bSDB(?:302|702|1106)",
    );
    const extraLeaks = `  { re: /\\b70\\s*кг(?![\\p{L}\\d])/iu, claim: "70 кг" },
  { re: /\\b90\\s*кг(?![\\p{L}\\d])/iu, claim: "90 кг" },
  { re: /\\b1358\\b/u, claim: "1358" },
  { re: /\\b1952\\b/u, claim: "1952" },
  { re: /\\b500\\s*(?:л|l)(?![\\p{L}\\d])/iu, claim: "500 л" },
  { re: /\\b546\\s*(?:л|l)(?![\\p{L}\\d])/iu, claim: "546 л" },
  { re: /\\b743(?:\\s*(?:л|l))?(?![\\p{L}\\d])/iu, claim: "743 л" },
  { re: /\\b770(?:\\s*(?:л|l))?(?![\\p{L}\\d])/iu, claim: "770 л" },
`;
    if (!s.includes("1358")) {
      s = s.replace("const FOREIGN_NUMERIC_LEAKS = [", `const FOREIGN_NUMERIC_LEAKS = [\n${extraLeaks}`);
    }
    const inventedWheels = `
  if (/(?:3\\s+осушител|три\\s+осушител|запасн[\\p{L}]*\\s+замк)/iu.test(a)) {
    failures.push({ code: "parameter_leakage", severity: "fail", detail: "invented_base_delivery_item" });
  }
  if (/(?:\\d+|четыре)\\s+(?:транспортн[\\p{L}]*\\s+)?кол[её]с/iu.test(a) &&
      !/(?:не\\s+вход|не\\s+комплект|отсутств)/iu.test(a)) {
    failures.push({ code: "parameter_leakage", severity: "fail", detail: "invented_sdb151_base_wheels" });
  }
  if (/(?:внутренн[\\p{L}]*|полн[\\p{L}]*)\s+объ[её]м\\s*(?:—|:|составляет)?\\s*\\d/iu.test(a) ||
      /(?:количеств[\\p{L}]*\\s+двер|у\\s+шкафа\\s+\\d+\\s+двер)/iu.test(a)) {
    failures.push({ code: "parameter_leakage", severity: "fail", detail: "unconfirmed_sdb151_model_parameter" });
  }`;
    if (!s.includes("invented_sdb151_base_wheels")) {
      s = s.replace(
        "if (/тестов(?:ый|ого|ом)\\s+режим/i.test(a)",
        `${inventedWheels}\n\n  if (/тестов(?:ый|ого|ом)\\s+режим/i.test(a)`,
      );
    }
  }

  if (fileKind === "prompt-rules") {
    s = rep(
      s,
      `- Если в контексте нет точной цифры/формулировки для SDB151NM — ответь ровно: «\${MODEL_PARAM_NOT_SPECIFIED}».`,
      `- Если точный модельный параметр (объём, двери и т.п.) не подтверждён для SDB151NM — ответь «\${MODEL_PARAM_NOT_SPECIFIED}». Процедуры из общего РЭ (включение, SET, порог влажности) — не «не указан».`,
    );
    if (!s.includes("колёса не входят")) {
      s = s.replace(
        "Пример: «Масса шкафа SDB151NM составляет 46 кг.»",
        "Модельные факты SDB151NM: 602×655×772 мм; 46 кг; 3 полки; 1 осушитель; колёса не входят в базовую поставку.",
      );
    }
    if (!s.includes("Не указывай внутренний/полный объём")) {
      s = s.replace(
        `"Пример: «Масса шкафа ${"SDB151NM"} составляет 46 кг.» — без упоминания других моделей."`,
        `"Не указывай внутренний/полный объём и количество дверей SDB151NM.",
  "Модельные факты SDB151NM: 602×655×772 мм; 46 кг; 3 полки; 1 осушитель; колёса не входят в базовую поставку — без упоминания других моделей."`,
      );
    }
  }

  if (fileKind === "rag-priority") {
    s = rep(s, "ip65", "ip55");
    s = rep(s, "Ищи подтверждение в разделах РЭ:", "Ищи подтверждение в разделах общего РЭ:");
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

  return s;
}

function postProcess151DirectFacts(s) {
  s = s.replace(
    /const SDB151NM_CRITICAL_FACTS = `[\s\S]*?`\.trim\(\);/,
    `const SDB151NM_CRITICAL_FACTS = \`\n${SDB151_CRITICAL_FACTS}\n\`.trim();`,
  );
  s = s.replace(
    /const ANSWER_WHEELS_KIT =[\s\S]*?";/,
    `const ANSWER_WHEELS_KIT =
  "Транспортные колёса **не входят в базовую поставку SDB151NM**: в таблице 1.2 эта модель исключена из перечня шкафов, комплектуемых колёсами.";`,
  );
  s = s.replace(
    "В базовой поставке SDB151NM (табл. **1.2**): **4 колеса**",
    "В базовой поставке SDB151NM (табл. **1.2**): **1 осушитель**",
  );
  if (!s.includes("транспортн")) {
    s = s.replace(
      "const FACTS = [",
      `const FACTS = [
  {
    test: /(?:колес|колёс|транспортн[\\p{L}]*\\s+колес)/iu,
    answer: "Транспортные колёса **не входят в базовую поставку SDB151NM**: в таблице 1.2 эта модель исключена из перечня шкафов, комплектуемых колёсами.",
  },`,
    );
  }
  return s;
}

function postProcess151Test(s) {
  s = rep(s, '["внутренний объем", "500"]', '["внутренний объем", "не указан"]');
  s = rep(s, '["Какой полный объем шкафа?", "546"]', '["Какой полный объем шкафа?", "не указан"]');
  s = rep(s, '["Сколько дверей?", "2"]', '["Сколько дверей?", "не указан"]');
  s = rep(s, '["Сколько полок?", "5"]', '["Сколько полок?", "3"]');
  s = rep(s, '["Что входит в базовую комплектацию?", "5 перфорированных полок"]', '["Что входит в базовую поставку?", "1 осушитель"]');
  s = rep(s, '["Какой вес?", "70"]', '["Какой вес?", "46"]');
  s = rep(s, '["Какой вес?", "90"]', '["Какой вес?", "46"]');
  s = rep(s, '["Влезет в дверной проём? какой он высокий", "1358"]', '["Влезет в дверной проём? какой он высокий", "655"]');
  s = rep(s, "/70\\s*кг/u", "/46\\s*кг/u");
  s = rep(s, '"w-700", "retrieval-cards"', '"sdb151-nm", "retrieval-cards"');
  s = rep(s, 'equipmentName: "SDB302 NM"', 'equipmentName: "SDB151 NM"');
  s = rep(s, "поставку 302?", "поставку 151?");
  s = rep(s, '["Сколько колёс кладут в поставку 151?", ["4 колес"]]', '["Сколько колёс кладут в поставку 151?", ["не входят"]]');
  s = rep(
    s,
    '["Ножки крутить или на колёсах оставлять, как правильнее", ["4 колес"]]',
    '["Ножки крутить или на колёсах оставлять, как правильнее", ["не входят"]]',
  );
  if (!s.includes("resolveEquipmentProfile")) {
    s += `
const profile = require("../src/equipment/profiles/sdb151-nm");
const { resolveEquipmentProfile } = require("../src/equipment/equipment-runtime");
assert.equal(resolveEquipmentProfile("sdb151-nm"), profile);
`;
  }
  return s;
}

function writeDest(destRel, content) {
  const dest = path.join(ROOT, destRel);
  fs.writeFileSync(dest, content);
  console.log("wrote", destRel);
}

for (const [srcRel, kind] of SOURCE_FILES) {
  const src = fs.readFileSync(path.join(ROOT, srcRel), "utf8");
  writeDest(srcRel.replace("sdb302nm", "sdb702nm").replace("test-sdb302nm", "test-sdb702nm"), transform302to702(src, kind));
}

for (const [srcRel, kind] of SOURCE_FILES) {
  if (kind === "unsupported") {
    continue;
  }
  const src = fs.readFileSync(path.join(ROOT, srcRel), "utf8");
  let content = transform302to151(src, kind);
  if (kind === "direct-facts") {
    content = postProcess151DirectFacts(content);
  }
  if (kind === "test") {
    content = postProcess151Test(content);
  }
  writeDest(srcRel.replace("sdb302nm", "sdb151nm").replace("test-sdb302nm", "test-sdb151nm"), content);
}

function copyRetrievalCards(targetEquipmentId, modelToken, wheelsText) {
  const srcDir = path.join(ROOT, "knowledge", "w-700", "retrieval-cards");
  const destDir = path.join(ROOT, "knowledge", targetEquipmentId, "retrieval-cards");
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of fs.readdirSync(srcDir)) {
    if (!name.endsWith(".md")) {
      continue;
    }
    let text = fs.readFileSync(path.join(srcDir, name), "utf8");
    text = rep(text, "SDB302NM", modelToken);
    text = rep(text, "SDB302", modelToken.replace(/NM$/, ""));
    if (name === "feet-wheels.md" && wheelsText) {
      text = wheelsText;
    }
    fs.writeFileSync(path.join(destDir, name), text);
  }
  console.log("copied retrieval-cards ->", targetEquipmentId);
}

copyRetrievalCards("sdb702-nm", "SDB702NM", null);

copyRetrievalCards(
  "sdb151-nm",
  "SDB151NM",
  `# SDB151NM — ножки и колёса

Источник: таблица 1.2 базовый состав поставки. Только SDB151NM.

Факт: в базовую поставку SDB151NM входят **1 осушитель** и **3 перфорированные полки**. Транспортные колёса **не входят** — модель исключена из перечня шкафов с колёсами в таблице 1.2.
`,
);

console.log("Sync from SDB302 complete.");
