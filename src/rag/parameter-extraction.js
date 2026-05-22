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

  const add = (parameterKey, value, unit, confidence = 0.9, extra = {}) => {
    pushEntry(out, {
      parameterKey,
      value: String(value),
      unit: unit || null,
      aliases: PARAMETER_REGISTRY[parameterKey]?.aliases || [],
      confidence,
      ...extra,
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

  const tempRangeRe = new RegExp(
    `(?:температур[аы]|воздух|окружающ[а-яё\\s]+сред[аы]).{0,120}?от\\s+(?:плюс\\s*)?(${number})\\s*(?:°\\s*[СC]|º\\s*[СC]|град\\.?\\s*цельс).{0,80}?до\\s+(?:плюс\\s*)?(${number})\\s*(?:°\\s*[СC]|º\\s*[СC]|град\\.?\\s*цельс)`,
    "giu"
  );
  while ((m = tempRangeRe.exec(s)) !== null) {
    add(
      "ambient_temperature",
      `+${m[1].replace(",", ".")} - +${m[2].replace(",", ".")}`,
      "°C",
      0.9,
      { qualifier: "range", maxValue: `+${m[2].replace(",", ".")}` }
    );
    add("ambient_temperature", `+${m[2].replace(",", ".")}`, "°C", 0.92, {
      qualifier: "max",
    });
  }

  const tempValueRe = new RegExp(`(?:температур[аы]|воздух|окружающ[а-яё\\s]+сред[аы]).{0,100}(?:плюс\\s*)?(${number})\\s*(?:°\\s*[СC]|º\\s*[СC]|град\\.?\\s*цельс)`, "giu");
  while ((m = tempValueRe.exec(s)) !== null) {
    const near = s.slice(Math.max(0, m.index - 80), m.index + 160);
    if (/от\s+(?:плюс\s*)?\d/i.test(near) && /до\s+(?:плюс\s*)?\d/i.test(near)) {
      continue;
    }
    add("ambient_temperature", `+${m[1].replace(",", ".")}`, "°C", 0.74);
  }

  const ethernetCapacityRe = /ethernet.{0,120}?един(?:ую|ой)\s+сет[ьи].{0,80}?от\s+(\d+)\s+до\s+(\d+)\s+шкаф/giu;
  while ((m = ethernetCapacityRe.exec(s)) !== null) {
    add(
      "ethernet_network_capacity",
      `${m[1]} - ${m[2]}`,
      "шкафов",
      0.9,
      { qualifier: "network_capacity", maxValue: m[2] }
    );
    add("ethernet_network_capacity", m[2], "шкафов", 0.91, {
      qualifier: "max",
    });
  }

  const ethernetConnectorRe = /разъ[её]м\s+для\s+подключения\s+шкафа\s+к\s+сети\s+ethernet.{0,40}?(\d+)\s*(?:шт\.?)?/giu;
  while ((m = ethernetConnectorRe.exec(s)) !== null) {
    add("ethernet_connector_count", m[1], "шт.", 0.88);
  }

  return out;
}

module.exports = {
  extractStructuredParameters,
};

