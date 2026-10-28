const fs = require("fs");
const path = require("path");

const srcPath = path.join(__dirname, "..", "data", "eval-sdb302nm-cards-wave.json");
const outPath = path.join(__dirname, "..", "data", "eval-sdb1560m-cards-wave.json");
const src = JSON.parse(fs.readFileSync(srcPath, "utf8"));

const N50_PICK = 27;

const special = {
  "live-shelves": {
    expectedKeywords: ["2"],
    mustNotContain: ["5 полок", "7 полок"],
  },
  "spec-volume": {
    expectedKeywords: ["896"],
    mustNotContain: ["500", "743", "1028"],
  },
  "spec-full-volume": {
    expectedKeywords: ["2070"],
    mustNotContain: ["546", "770"],
  },
  "spec-dims": {
    expectedKeywords: ["1202", "1693", "1028"],
    mustNotContain: ["602", "1358", "772", "1952"],
  },
  "spec-mass": {
    question: "Сколько весит шкаф?",
    expectedKeywords: ["260"],
    mustNotContain: ["70", "90", "180"],
  },
  "spec-doors": {
    expectedKeywords: ["4"],
    mustNotContain: ["2 двери", "3 двери"],
  },
  "spec-power-dry": {
    expectedKeywords: ["40"],
    mustNotContain: ["20", "285"],
  },
  "spec-power-regen": {
    expectedKeywords: ["540"],
    mustNotContain: ["285"],
  },
  "spec-shelf-load": {
    expectedKeywords: ["100"],
    mustNotContain: ["50 кг", "180 кг"],
  },
  "n50-wheels-count": {
    question: "Сколько колёс кладут в поставку?",
    expectedKeywords: ["4"],
  },
  "n50-volume-liters": {
    expectedKeywords: ["896"],
    mustNotContain: ["500"],
  },
  "n50-full-vs-inner": {
    expectedKeywords: ["2070", "896"],
  },
  "n50-width": {
    expectedKeywords: ["1202"],
    mustNotContain: ["602"],
  },
  "n50-depth": {
    expectedKeywords: ["1028"],
    mustNotContain: ["772"],
  },
  "offtopic-python": {
    expectedKeywords: ["SDB1560"],
  },
};

function isTrapItem(item) {
  return item.category === "trap" || /-trap-/.test(item.id);
}

function neutralizeQuestion(text) {
  return String(text)
    .replace(/\bSDB302NM\b/gi, "шкаф")
    .replace(/\bSDB302\b/gi, "шкаф")
    .replace(/\bSDB702NM\b/gi, "другой шкаф")
    .replace(/\bSDB702\b/gi, "другой шкаф")
    .replace(/\bSDB1106NM\b/gi, "другой шкаф")
    .replace(/\bSDB1560NM\b/gi, "шкаф")
    .replace(/\bSDB1560\b/gi, "шкаф")
    .replace(/шкаф\s+302\b/gi, "шкаф")
    .replace(/поставку\s+302\b/gi, "поставку")
    .replace(/нашим\s+302\b/gi, "нашим")
    .replace(/наш\s+302\b/gi, "наш")
    .replace(/302\s+чат\b/gi, "чат")
    .replace(/\b302\b/g, "")
    .replace(/\b702\b/g, "")
    .replace(/\b1106\b/g, "")
    .replace(/\b1560\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function rewriteToken(token) {
  const t = String(token);
  const swaps = [
    ["SDB302NM", "SDB1560NM"],
    ["SDB302", "SDB1560"],
    ["SDB702NM", "SDB1560NM"],
    ["SDB702", "SDB1560"],
    ["500", "896"],
    ["546", "2070"],
    ["602", "1202"],
    ["1358", "1693"],
    ["772", "1028"],
    ["70", "260"],
    ["285", "540"],
    ["743", "896"],
    ["770", "2070"],
    ["1952", "1693"],
    ["1204", "1202"],
  ];
  for (const [from, to] of swaps) {
    if (t === from) return to;
  }
  if (t === "2" && false) {
    /* doors handled in special */
  }
  if (t === "50" && /кг/.test(t)) return t;
  return t;
}

function rewriteKeywordList(list) {
  return (list || []).map((row) => {
    if (row === "50" || row === "5") return row;
    return rewriteToken(row);
  });
}

function buildItems() {
  const kept = src.items.filter((item) => !isTrapItem(item));
  const base = kept.filter((item) => !item.id.startsWith("n50"));
  const n50Pool = kept.filter((item) => item.id.startsWith("n50"));
  const n50 = n50Pool.slice(0, N50_PICK);
  const merged = [...base, ...n50];

  return merged.map((item) => {
    const patch = special[item.id] || {};
    const next = {
      ...item,
      equipmentId: "sdb1560m",
      question: neutralizeQuestion(patch.question || item.question),
      expectedKeywords: (patch.expectedKeywords || item.expectedKeywords || []).map((kw) => {
        if (patch.expectedKeywords) return kw;
        return rewriteToken(kw);
      }),
    };
    if (item.id === "spec-doors" && !patch.expectedKeywords) {
      next.expectedKeywords = ["4"];
    }
    if (item.id === "live-shelves" && !patch.expectedKeywords) {
      next.expectedKeywords = ["2"];
    }
    if (item.id === "spec-shelf-load" && !patch.expectedKeywords) {
      next.expectedKeywords = ["100"];
    }
    if (item.id === "spec-power-dry" && !patch.expectedKeywords) {
      next.expectedKeywords = ["40"];
    }
    if (item.id === "spec-power-regen" && !patch.expectedKeywords) {
      next.expectedKeywords = ["540"];
    }
    const mustNot = patch.mustNotContain || item.mustNotContain;
    if (mustNot) {
      next.mustNotContain = rewriteKeywordList(mustNot);
    }
    return next;
  });
}

const items = buildItems();
if (items.length !== 100) {
  throw new Error(`expected 100 items, got ${items.length}`);
}

const hinted = items.filter((item) =>
  /\b(SDB\d|302|702|1106|1560)\b/i.test(item.question),
);
if (hinted.length) {
  throw new Error(
    `questions still contain model hints: ${hinted.map((i) => i.id).join(", ")}`,
  );
}

fs.writeFileSync(outPath, JSON.stringify({ items }, null, 2) + "\n");
console.log("wrote", outPath, items.length);
