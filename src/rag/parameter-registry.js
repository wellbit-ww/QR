/** Только алиасы для маршрутизации/фокуса retrieval. Числовые ТТХ — только из PDF через LLM. */
const PARAMETER_REGISTRY = Object.freeze({
  grounding_resistance: {
    aliases: [
      "сопротивление заземления",
      "сопротивление заземляющего контура",
      "заземляющий контур",
      "сопротивление контура заземления",
    ],
    expectedUnits: ["ом"],
  },
  power_voltage: {
    aliases: [
      "напряжение питания",
      "питание",
      "напряжение сети",
      "220 в",
      "электропитание",
    ],
    expectedUnits: ["в"],
  },
  frequency: {
    aliases: ["частота", "частота сети", "гц", "hz"],
    expectedUnits: ["гц"],
  },
  protection: {
    aliases: ["ip", "ip класс", "класс защиты", "степень защиты", "ip65"],
    expectedUnits: ["ip"],
  },
  humidity_range: {
    aliases: ["диапазон влажности", "влажность", "rh", "rh%"],
    expectedUnits: ["rh%", "%"],
  },
  shelf_load_max: {
    aliases: ["нагрузка на полку", "максимальная нагрузка", "нагрузка полки"],
    expectedUnits: ["кг"],
  },
  power_consumption: {
    aliases: ["мощность", "потребляемая мощность"],
    expectedUnits: ["вт", "квт"],
  },
  ambient_temperature: {
    aliases: [
      "температура окружающей среды",
      "температура окружающего воздуха",
      "температура воздуха",
      "максимальная температура",
      "условия эксплуатации",
      "температура",
    ],
    expectedUnits: ["°c", "ºс", "°с"],
  },
  ethernet_network_capacity: {
    aliases: [
      "ethernet",
      "локальная сеть",
      "единая сеть",
      "объединить шкафы",
      "количество шкафов",
      "сеть ethernet",
    ],
    expectedUnits: ["шкафов"],
  },
  ethernet_connector_count: {
    aliases: [
      "разъем ethernet",
      "разъём ethernet",
      "разъем для подключения шкафа к сети ethernet",
      "ethernet разъем",
      "ethernet разъём",
    ],
    expectedUnits: ["шт"],
  },
});

function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveParameter(query, fallbackFocusParameter = null) {
  const q = normalizeText(query);
  let best = null;
  for (const [parameterKey, spec] of Object.entries(PARAMETER_REGISTRY)) {
    for (const alias of spec.aliases || []) {
      const a = normalizeText(alias);
      if (!a) {
        continue;
      }
      if (q.includes(a)) {
        const score = Math.min(1, 0.55 + Math.min(0.4, a.length / 100));
        if (!best || score > best.confidence) {
          best = { parameterKey, confidence: Number(score.toFixed(3)), matchedAlias: alias };
        }
      }
    }
  }

  if (best) {
    return best;
  }

  const focusMap = {
    grounding_resistance: "grounding_resistance",
    voltage: "power_voltage",
    frequency: "frequency",
    protection: "protection",
    humidity: "humidity_range",
    load: "shelf_load_max",
    temperature: "ambient_temperature",
  };
  if (fallbackFocusParameter && focusMap[fallbackFocusParameter]) {
    return {
      parameterKey: focusMap[fallbackFocusParameter],
      confidence: 0.52,
      matchedAlias: fallbackFocusParameter,
    };
  }
  return null;
}

module.exports = {
  PARAMETER_REGISTRY,
  resolveParameter,
  normalizeParameterText: normalizeText,
};

