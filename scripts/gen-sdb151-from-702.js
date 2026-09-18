/**
 * Устарело: SDB151NM больше не клонируется из SDB702NM.
 * Правьте src/equipment/catalogs/sdb151-nm.js и sdb151-nm.facts.js.
 */
throw new Error(
  "SDB151NM is catalog-driven (src/equipment/catalogs/sdb151-nm.js). Do not regenerate from SDB702NM.",
);

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const SDB151_CRITICAL_FACTS = fs.readFileSync(
  path.join(ROOT, "src/rag/sdb151nm-direct-facts.js"),
  "utf8",
).match(/const SDB151NM_CRITICAL_FACTS = `[\s\S]*?`\.trim\(\);/)[0];

function rep(s, from, to) {
  return s.split(from).join(to);
}

function transform702(content, fileKind) {
  let s = content;
  const pairs = [
    ["sdb702nm", "sdb151nm"],
    ["Sdb702nm", "Sdb151nm"],
    ["SDB702NM", "SDB151NM"],
    ["SDB702 NM", "SDB151 NM"],
    ["sdb702-nm", "sdb151-nm"],
    ["isUnsupportedSdb702nmSpecQuery", "isUnsupportedSdb151nmSpecQuery"],
    ["buildUnsupportedSdb702nmSpecReply", "buildUnsupportedSdb151nmSpecReply"],
    ["./sdb702nm-unsupported-spec", "./sdb151nm-unsupported-spec"],
    ["602 × 1952 × 772", "602 × 655 × 772"],
    ["602×1952×772", "602×655×772"],
    ["90 кг", "46 кг"],
    ["**7 полок**", "**3 перфорированные полки**"],
    ["7 полок", "3 перфорированные полки"],
    ["7 перфорированных полок", "3 перфорированные полки"],
    ["7 перфорированные полки", "3 перфорированные полки"],
    ["**3 двери**", "**количество дверей не подтверждено**"],
    ["3 двери", "количество дверей не подтверждено"],
    ["743 л", "не указан"],
    ["770 л", "не указан"],
    ["743", "не указан"],
    ["Не подставляй значения модели SDB1106NM.", "Не подставляй модельные значения SDB302NM, SDB702NM или SDB1106NM."],
    ["SDB1106, SDB1106NM, SDB302, SDB151", "SDB1106, SDB1106NM, SDB302, SDB702"],
    ["Не подставляй 540 Вт и другие значения SDB1106NM.", "Не подставляй 540 Вт (SDB1106NM), 90 кг / 743 л (SDB702NM) и другие чужие значения."],
    ["foreign_model_mention_sdb1106", "foreign_model_mention_other_sdb"],
    ["validationProfile: \"sdb702\"", "validationProfile: \"sdb151\""],
    ["trusted_sdb702_deterministic_fact", "trusted_sdb151_deterministic_fact"],
    ["sdb702_deterministic_recovery_pre_guardrails", "sdb151_deterministic_recovery_pre_guardrails"],
    ["postGate: \"sdb702-nm\"", "postGate: \"sdb151-nm\""],
  ];
  for (const [from, to] of pairs) {
    s = rep(s, from, to);
  }

  if (fileKind === "chat-gate") {
    s = rep(s, "w-700|w\\s*700|", "");
  }

  if (fileKind === "procedure-validation") {
    s = rep(s, "SDB(?:151|1106)", "SDB(?:302|702|1106");
    s = s.replace(/sdb702ForeignModelLeakFailures/g, "sdb151ForeignModelLeakFailures");
    s = s.replace(/sdb702InventedProcedureFailures/g, "sdb151InventedProcedureFailures");
    const extraLeaks = `  { re: /\\b70\\s*кг(?![\\p{L}\\d])/iu, claim: "70 кг" },
  { re: /\\b90\\s*кг(?![\\p{L}\\d])/iu, claim: "90 кг" },
  { re: /\\b1358\\b/u, claim: "1358" },
  { re: /\\b1952\\b/u, claim: "1952" },
  { re: /\\b500\\s*(?:л|l)(?![\\p{L}\\d])/iu, claim: "500 л" },
  { re: /\\b546\\s*(?:л|l)(?![\\p{L}\\d])/iu, claim: "546 л" },
  { re: /\\b743(?:\\s*(?:л|l))?(?![\\p{L}\\d])/iu, claim: "743 л" },
  { re: /\\b770(?:\\s*(?:л|l))?(?![\\p{L}\\d])/iu, claim: "770 л" },
  { re: /\\b1028(?:\\s*(?:л|l))?(?![\\p{L}\\d])/iu, claim: "1028 л" },
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

  if (fileKind === "answer-validation") {
    s = s.replace(/sdb702ForeignModelLeakFailures/g, "sdb151ForeignModelLeakFailures");
    s = s.replace(/sdb702InventedProcedureFailures/g, "sdb151InventedProcedureFailures");
  }

  if (fileKind === "prompt-rules") {
    s = rep(
      s,
      `- Если в контексте нет точной цифры/формулировки для ${"SDB151NM"} — ответь ровно: «\${MODEL_PARAM_NOT_SPECIFIED}».`,
      `- Если точный модельный параметр (объём, двери и т.п.) не подтверждён для SDB151NM — ответь «\${MODEL_PARAM_NOT_SPECIFIED}». Процедуры из общего РЭ (включение, SET, порог влажности) — не «не указан».`,
    );
    s = rep(
      s,
      "Пример: «Масса шкафа SDB151NM составляет 46 кг.» — без упоминания других моделей.",
      "Модельные факты SDB151NM: 602×655×772 мм; 46 кг; 3 полки; 1 осушитель; колёса не входят в базовую поставку.",
    );
    if (!s.includes("не указывай и не вычисляй внутренний")) {
      s = s.replace(
        '"Модельные факты SDB151NM:',
        '"Не указывай внутренний/полный объём и количество дверей SDB151NM.\\n  "Модельные факты SDB151NM:',
      );
    }
  }

  if (fileKind === "rag-priority") {
    s = rep(s, "ip65", "ip55");
    s = rep(s, "Ищи подтверждение в разделах РЭ:", "Ищи подтверждение в разделах общего РЭ:");
  }

  return s;
}

function postProcessDirectFacts(s) {
  s = s.replace(/const SDB151NM_CRITICAL_FACTS = `[\s\S]*?`\.trim\(\);/, SDB151_CRITICAL_FACTS);

  // Remove volume/door deterministic facts — handled by unsupported-spec.
  s = s.replace(/\n  \{\n    test: \/\(\?:внутренн[\s\S]*?\n  \},/g, (block) =>
    /743|770|сколько\s+литр|полн[\p{L}]*\s+объ|сколько\s+двер|количеств[\p{L}]*\s+двер/iu.test(block) ? "" : block,
  );

  // Fix комплектация answer if still mentions 7 shelves.
  s = rep(
    s,
    "В шкафу SDB151NM предусмотрено **3 перфорированные полки**.",
    "В базовую поставку SDB151NM входят **1 осушитель и 3 перфорированные полки**. Транспортные колёса **не входят** в базовую поставку.",
  );
  s = rep(
    s,
    "Что входит в базовую комплектацию?",
    "Что входит в базовую поставку?",
  );

  if (!s.includes("invented_sdb151_base_wheels")) {
    // ensure wheels fact exists
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
  }

  return s;
}

function postProcessTest(s) {
  s = rep(s, '["внутренний объем", "743"]', '["внутренний объем", "не указан"]');
  s = rep(s, '["Какой полный объем шкафа?", "770"]', '["Какой полный объем шкафа?", "не указан"]');
  s = rep(s, '["Сколько дверей?", "3"]', '["Сколько дверей?", "не указан"]');
  s = rep(s, '["Сколько полок?", "7"]', '["Сколько полок?", "3"]');
  s = rep(s, '["Какие габариты?", "602 × 1952 × 772"]', '["Какие габариты?", "602 × 655 × 772"]');
  s = rep(s, '["Какой вес?", "90"]', '["Какой вес?", "46"]');
  s = rep(s, '["Что входит в базовую комплектацию?", "7 перфорированных полок"]', '["Что входит в базовую поставку?", "1 осушитель"]');
  s = rep(s, "SDB702NM profile checks", "SDB151NM profile checks");
  s = rep(s, "test-sdb702nm-profile.js", "test-sdb151nm-profile.js");
  s = rep(s, "602×1952×772", "602×655×772");
  s = rep(s, "/90\\s*кг/u", "/46\\s*кг/u");
  if (!s.includes("resolveEquipmentProfile")) {
    s += `
const profile = require("../src/equipment/profiles/sdb151-nm");
const { resolveEquipmentProfile } = require("../src/equipment/equipment-runtime");
assert.equal(resolveEquipmentProfile("sdb151-nm"), profile);
`;
  }
  return s;
}

const files = [
  ["src/rag/sdb702nm-rag-priority.js", "src/rag/sdb151nm-rag-priority.js", "rag-priority"],
  ["src/rag/sdb702nm-prompt-rules.js", "src/rag/sdb151nm-prompt-rules.js", "prompt-rules"],
  ["src/rag/sdb702nm-direct-facts.js", "src/rag/sdb151nm-direct-facts.js", "direct-facts"],
  ["src/rag/sdb702nm-procedure-validation.js", "src/rag/sdb151nm-procedure-validation.js", "procedure-validation"],
  ["src/rag/sdb702nm-answer-validation.js", "src/rag/sdb151nm-answer-validation.js", "answer-validation"],
  ["src/rag/sdb702nm-post-gate.js", "src/rag/sdb151nm-post-gate.js", "post-gate"],
  ["src/rag/sdb702nm-chat-gate.js", "src/rag/sdb151nm-chat-gate.js", "chat-gate"],
  ["scripts/test-sdb702nm-profile.js", "scripts/test-sdb151nm-profile.js", "test"],
];

for (const [srcRel, destRel, kind] of files) {
  const src = path.join(ROOT, srcRel);
  const dest = path.join(ROOT, destRel);
  let content = fs.readFileSync(src, "utf8");
  content = transform702(content, kind);
  if (kind === "direct-facts") {
    content = postProcessDirectFacts(content);
  }
  if (kind === "test") {
    content = postProcessTest(content);
  }
  fs.writeFileSync(dest, content);
  console.log("wrote", destRel);
}

console.log("Done. unsupported-spec left unchanged (SDB151 volume/door guards).");
