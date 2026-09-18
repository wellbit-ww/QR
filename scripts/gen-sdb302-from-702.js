const fs = require("fs");

function transform702(content, fileKind) {
  let s = content;
  const rep = (from, to) => {
    s = s.split(from).join(to);
  };
  rep("sdb702nm", "sdb302nm");
  rep("Sdb702nm", "Sdb302nm");
  rep("SDB702NM", "SDB302NM");
  rep("SDB702 NM", "SDB302 NM");
  rep("sdb702-nm", "w-700");

  if (fileKind === "chat-gate") {
    s = s.replace(/w-700\|w\\s\*700\|/g, "");
    s = s.replace(
      /isUnsupportedSdb702nmSpecQuery, buildUnsupportedSdb702nmSpecReply/g,
      "isUnsupportedSdb302nmSpecQuery, buildUnsupportedSdb302nmSpecReply"
    );
  }

  if (fileKind === "unsupported") {
    s = s.replace(/Sdb702nm/g, "Sdb302nm");
  }

  if (fileKind === "test") {
    rep('["внутренний объем", "743"]', '["внутренний объем", "500"]');
    rep('["Какой полный объем шкафа?", "770"]', '["Какой полный объем шкафа?", "546"]');
    rep('["Сколько полок?", "7"]', '["Сколько полок?", "5"]');
    rep('["Сколько дверей?", "3"]', '["Сколько дверей?", "2"]');
    rep('["Какой вес?", "90"]', '["Какой вес?", "70"]');
    rep('const equipment = { id: "w-700", name: "SDB702 NM" };', 'const equipment = { id: "w-700", name: "SDB302 NM" };');
    rep("SDB702NM. Эксплуатация", "SDB302NM. Эксплуатация");
    rep("Эксплуатация SDB702 NM", "Эксплуатация SDB302 NM");
    rep("602×1952×772", "602×1358×772");
    rep("/90\\s*кг/u", "/70\\s*кг/u");
    rep('assert.match(recoveryPostGate.answer, /90\\s*кг/u);', 'assert.match(recoveryPostGate.answer, /70\\s*кг/u);');
    rep("SDB702NM profile checks", "SDB302NM profile checks");
  }

  if (fileKind === "direct-facts" || fileKind === "test") {
    rep("isUnsupportedSdb702nmSpecQuery", "isUnsupportedSdb302nmSpecQuery");
    rep("buildUnsupportedSdb702nmSpecReply", "buildUnsupportedSdb302nmSpecReply");
    rep("743 л", "500 л");
    rep("770 л", "546 л");
    rep("602 × 1952 × 772", "602 × 1358 × 772");
    rep("602×1952×772", "602×1358×772");
    rep("1952", "1358");
    rep("90 кг", "70 кг");
    rep("**7 полок**", "**5 полок**");
    rep("7 полок", "5 полок");
    rep("7 перфорированных полок", "5 перфорированных полок");
    rep("**3 двери**", "**2 двери**");
    rep("3 двери", "2 двери");
    s = s.replace(
      /Не подставляй значения модели SDB1106NM\./g,
      "Не подставляй значения моделей SDB1106NM и SDB702NM."
    );
  }

  if (fileKind === "prompt-rules") {
    rep("SDB1106, SDB1106NM, SDB302, SDB151", "SDB1106, SDB1106NM, SDB702, SDB151");
    rep("90 кг", "70 кг");
    s = s.replace(
      /Не подставляй 540 Вт и другие значения SDB1106NM\./g,
      "Не подставляй 540 Вт (SDB1106NM), 285 Вт регенерации SDB702NM и другие чужие значения."
    );
  }

  if (fileKind === "procedure-validation") {
    const extra = `  { re: /\\b90\\s*кг\\b/i, claim: "90 кг" },
  { re: /\\b743\\b/i, claim: "743" },
  { re: /\\b1952\\b/i, claim: "1952" },
`;
    s = s.replace("const FOREIGN_NUMERIC_LEAKS = [", `const FOREIGN_NUMERIC_LEAKS = [\n${extra}`);
    s = s.replace(/foreign_model_mention_sdb1106/g, "foreign_model_mention_other_sdb");
    s = s.replace(
      "if (/\\bSDB1106(?:\\s*NM|-NM|NM)?\\b/i.test(a) && !/\\bSDB1106/i.test(query)) {",
      "if (/\\bSDB(?:1106|702)(?:\\s*NM|-NM|NM)?\\b/i.test(a) && !/\\bSDB(?:1106|702)/i.test(query)) {"
    );
    s = s.replace(/sdb702ForeignModelLeakFailures/g, "sdb302ForeignModelLeakFailures");
    s = s.replace(/sdb702InventedProcedureFailures/g, "sdb302InventedProcedureFailures");
  }

  if (fileKind === "answer-validation") {
    s = s.replace(/sdb702ForeignModelLeakFailures/g, "sdb302ForeignModelLeakFailures");
    s = s.replace(/sdb702InventedProcedureFailures/g, "sdb302InventedProcedureFailures");
    s = s.replace(/Sdb702/g, "Sdb302");
    s = s.replace(/sdb702/g, "sdb302");
  }

  if (fileKind === "post-gate") {
    s = s.replace(/validationProfile: "sdb702"/g, 'validationProfile: "sdb302"');
  }

  return s;
}

const files = [
  ["src/rag/sdb702nm-chat-gate.js", "src/rag/sdb302nm-chat-gate.js", "chat-gate"],
  ["src/rag/sdb702nm-rag-priority.js", "src/rag/sdb302nm-rag-priority.js", "rag-priority"],
  ["src/rag/sdb702nm-prompt-rules.js", "src/rag/sdb302nm-prompt-rules.js", "prompt-rules"],
  ["src/rag/sdb702nm-unsupported-spec.js", "src/rag/sdb302nm-unsupported-spec.js", "unsupported"],
  ["src/rag/sdb702nm-direct-facts.js", "src/rag/sdb302nm-direct-facts.js", "direct-facts"],
  ["src/rag/sdb702nm-procedure-validation.js", "src/rag/sdb302nm-procedure-validation.js", "procedure-validation"],
  ["src/rag/sdb702nm-answer-validation.js", "src/rag/sdb302nm-answer-validation.js", "answer-validation"],
  ["src/rag/sdb702nm-post-gate.js", "src/rag/sdb302nm-post-gate.js", "post-gate"],
  ["scripts/test-sdb702nm-profile.js", "scripts/test-sdb302nm-profile.js", "test"],
];

for (const [src, dest, kind] of files) {
  let c = fs.readFileSync(src, "utf8");
  c = transform702(c, kind);
  fs.writeFileSync(dest, c);
  console.log("wrote", dest);
}
