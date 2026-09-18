const fs = require("fs");
const p = "src/rag/sdb1106nm-golden-facts.js";
const lines = fs.readFileSync(p, "utf8").split("\n");
const earlyRules = fs.readFileSync("scripts/p15-early-rules.txt", "utf8").split("\n");

if (!lines.some((l) => l.includes("inspection_power_off"))) {
  const idx = lines.findIndex((l) => l.includes('key: "power_on_procedure"'));
  lines.splice(idx + 2, 0, ...earlyRules);
}

for (let i = 0; i < lines.length; i += 1) {
  if (lines[i].includes('key: "grounding_required"') && lines[i - 1]?.includes("заземл")) {
    lines[i - 1] = lines[i - 1].replace("i.test(m)) {", "i.test(m) && !/осмотр|визуальн/i.test(m)) {");
  }
  if (lines[i].includes('key: "chamber_temperature"')) {
    lines[i - 1] = "  if (isChamberTemperatureRangeQuery(m)) {";
  }
  if (lines[i].includes('key: "desiccant_zeolite"')) {
    lines[i - 1] = "  if (isDesiccantIdentityQuery(m)) {";
  }
}

const opLine = lines.findIndex((l) => l.includes('key: "operating_conditions"'));
if (opLine > 0 && !lines.slice(opLine - 6, opLine).some((l) => l.includes("1[0-4]"))) {
  const guardLine = lines[opLine - 1];
  const start = opLine - 2;
  lines.splice(start, 3, ...[
    "  if (",
    "    (/условия\\s+эксплуатац|температур.*окружающ|влажност.*помещен|эксплуатац.*при.*%|90\\s*%/i.test(m) ||",
    "      (/температур/i.test(m) &&",
    "        /(?:\\+\\s*)?(?:1[0-4]|\\d)\\s*°|опустил|ниже.*15|минимально\\s+допустим/i.test(m) &&",
    "        /эксплуатац|штатн|можно|продолж/i.test(m))) &&",
    guardLine,
    "  ) {",
  ]);
}

fs.writeFileSync(p, lines.join("\n"));
console.log("patched");
