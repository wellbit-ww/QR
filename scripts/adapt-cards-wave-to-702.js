const fs = require("fs");
const path = require("path");

const srcPath = path.join(__dirname, "..", "data", "eval-sdb302nm-cards-wave.json");
const outPath = path.join(__dirname, "..", "data", "eval-sdb702nm-cards-wave.json");
const src = JSON.parse(fs.readFileSync(srcPath, "utf8"));

const special = {
  "trap-702-volume": {
    question: "Какой внутренний объём у SDB302NM?",
    expectedKeywords: ["только", "SDB702"],
    mustNotContain: ["500"],
  },
  "trap-1106-mass": {
    expectedKeywords: ["только", "SDB702"],
  },
  "n50-trap-702-mass": {
    question: "SDB302 сколько весит, у нас же 702 чат",
    mustNotContain: ["70 кг"],
  },
  "n50-trap-1106-ip": {
    question: "У 1106 какой IP, напомни для сравнения с нашим 702",
  },
  "spec-mass": {
    question: "Сколько весит шкаф 702?",
    expectedKeywords: ["90"],
    mustNotContain: ["70", "180"],
  },
  "n50-wheels-count": {
    question: "Сколько колёс кладут в поставку 702?",
  },
  "offtopic-python": {
    expectedKeywords: ["только", "SDB702"],
  },
  "live-shelves": {
    expectedKeywords: ["7"],
    mustNotContain: ["5 полок"],
  },
  "spec-volume": {
    expectedKeywords: ["743"],
    mustNotContain: ["500", "1028"],
  },
  "spec-full-volume": {
    expectedKeywords: ["770"],
    mustNotContain: ["546"],
  },
  "spec-dims": {
    expectedKeywords: ["602", "1952", "772"],
    mustNotContain: ["1358", "1204"],
  },
  "spec-doors": {
    expectedKeywords: ["3"],
    mustNotContain: ["2 двери"],
  },
};

function rewriteQuestion(text) {
  return String(text)
    .replace(/SDB302NM/g, "SDB702NM")
    .replace(/SDB302/g, "SDB702")
    .replace(/шкаф 302/g, "шкаф 702")
    .replace(/поставку 302/g, "поставку 702")
    .replace(/нашим 302/g, "нашим 702")
    .replace(/наш 302/g, "наш 702")
    .replace(/302 чат/g, "702 чат");
}

function rewriteToken(token) {
  if (token === "SDB702NM") return "SDB302NM";
  if (token === "SDB302") return "SDB702";
  if (token === "SDB302NM") return "SDB702NM";
  return token;
}

const items = src.items.map((item) => {
  const patch = special[item.id] || {};
  const next = {
    ...item,
    equipmentId: "sdb702-nm",
    question: patch.question || rewriteQuestion(item.question),
    expectedKeywords: (patch.expectedKeywords || item.expectedKeywords || []).map(rewriteToken),
  };
  if (patch.mustNotContain || item.mustNotContain) {
    next.mustNotContain = (patch.mustNotContain || item.mustNotContain).map(rewriteToken);
  }
  return next;
});

if (items.length !== 125) {
  throw new Error(`expected 125 items, got ${items.length}`);
}

fs.writeFileSync(outPath, JSON.stringify({ items }, null, 2) + "\n");
console.log("wrote", outPath, items.length);
console.log("sample traps:");
for (const id of ["trap-702-volume", "n50-trap-702-mass", "spec-mass", "live-shelves", "n50-wheels-count"]) {
  const it = items.find((row) => row.id === id);
  console.log(id, JSON.stringify(it.question), it.expectedKeywords, it.mustNotContain);
}
