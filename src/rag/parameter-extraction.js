const { PARAMETER_REGISTRY } = require("./parameter-registry");

function pushEntry(out, entry) {
  const key = `${entry.parameterKey}|${entry.value}|${entry.unit || ""}`;
  if (out.some((x) => `${x.parameterKey}|${x.value}|${x.unit || ""}` === key)) {
    return;
  }
  out.push(entry);
}

function extractStructuredParameters(text) {
  const s = String(text || "");
  const out = [];

  const add = (parameterKey, value, unit, confidence = 0.9) => {
    pushEntry(out, {
      parameterKey,
      value: String(value),
      unit: unit || null,
      aliases: PARAMETER_REGISTRY[parameterKey]?.aliases || [],
      confidence,
    });
  };

  let m;
  const number = String.raw`\d+(?:[.,]\d+)?`;

  const groundingRe = new RegExp(`(?:не\\s+более\\s*)?(${number})\\s*(?:ом|ohm|Ω)(?![\\p{L}\\p{N}])`, "giu");
  while ((m = groundingRe.exec(s)) !== null) {
    const near = s.slice(Math.max(0, m.index - 120), m.index + 140);
    const v = Number(m[1].replace(",", "."));
    if (/м\s*ом|мегом|антистат|браслет/i.test(near)) {
      continue;
    }
    if (/заземл|контур/i.test(near) || (Number.isFinite(v) && v > 0 && v <= 10)) {
      add("grounding_resistance", m[1].replace(",", "."), "Ом", 0.95);
    }
  }

  const ipRe = /\b(IP\s?\d{2})\b/giu;
  while ((m = ipRe.exec(s)) !== null) {
    add("protection", m[1].toUpperCase().replace(/\s+/, ""), "IP", 0.95);
  }

  const voltRe = new RegExp(`(${number})\\s*(?:В|в|V|v|вольт)(?![\\p{L}\\p{N}])`, "gu");
  while ((m = voltRe.exec(s)) !== null) {
    const near = s.slice(Math.max(0, m.index - 120), m.index + 140);
    const v = Number(m[1].replace(",", "."));
    if (v === 220 || /питан|напряж|электропит|переменн|сети|розетк|вилк|кабел/i.test(near)) {
      add("power_voltage", m[1].replace(",", "."), "В", v === 220 ? 0.93 : 0.72);
    }
  }

  const freqRe = new RegExp(`(${number})\\s*(?:Гц|гц|Hz|HZ|hz)(?![\\p{L}\\p{N}])`, "gu");
  while ((m = freqRe.exec(s)) !== null) {
    const near = s.slice(Math.max(0, m.index - 120), m.index + 140);
    const v = Number(m[1].replace(",", "."));
    if (v === 50 || /частот|питан|напряж|переменн|сети/i.test(near)) {
      add("frequency", m[1].replace(",", "."), "Гц", v === 50 ? 0.93 : 0.72);
    }
  }

  const humidityRe = new RegExp(`(${number})\\s*[-–—]\\s*(${number})\\s*RH\\s*%`, "giu");
  while ((m = humidityRe.exec(s)) !== null) {
    add("humidity_range", `${m[1].replace(",", ".")} - ${m[2].replace(",", ".")}`, "RH%", 0.88);
  }

  const loadRe = new RegExp(`(нагрузк[аи].{0,90}?)(${number})\\s*кг(?![\\p{L}\\p{N}])`, "giu");
  while ((m = loadRe.exec(s)) !== null) {
    add("shelf_load_max", m[2].replace(",", "."), "кг", 0.86);
  }

  const powerRe = new RegExp(`(${number})\\s*(?:Вт|кВт)(?![\\p{L}\\p{N}])`, "giu");
  while ((m = powerRe.exec(s)) !== null) {
    const unit = /кВт/i.test(m[0]) ? "кВт" : "Вт";
    add("power_consumption", m[1].replace(",", "."), unit, 0.84);
  }

  return out;
}

module.exports = {
  extractStructuredParameters,
};

