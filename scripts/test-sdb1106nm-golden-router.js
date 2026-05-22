/**
 * Offline regression for golden fact router (P0).
 * node scripts/test-sdb1106nm-golden-router.js
 */
const assert = require("assert");
const {
  resolveGoldenFactMatch,
  isHighConfidenceDeterministic,
  formatGoldenFactAnswer,
} = require("../src/rag/sdb1106nm-golden-facts");

function expectKey(question, history, key, high = true) {
  const match = resolveGoldenFactMatch(question, history);
  assert.ok(match, `expected match for: ${question}`);
  assert.strictEqual(match.key, key, `question: ${question}`);
  assert.strictEqual(isHighConfidenceDeterministic(match), high, `confidence: ${question}`);
  return formatGoldenFactAnswer(match.key, question);
}

function expectNoDeterministic(question, history = []) {
  const match = resolveGoldenFactMatch(question, history);
  if (!match) return;
  assert.strictEqual(
    isHighConfidenceDeterministic(match),
    false,
    `should not bypass RAG: ${question} -> ${match.key}`
  );
}

// Power: storage after regen history
const a1 = expectKey(
  "Сколько ватт потребляет шкаф в режиме хранения?",
  [{ role: "user", content: "Какова максимальная потребляемая мощность в режиме регенерации?" }],
  "power_storage_base"
);
assert.match(a1, /8\s*Вт/i);

// Grounding not power
const a2 = expectKey("Требуется ли шкафу защитное заземление?", [], "grounding_required");
assert.match(a2, /заземл/i);
assert.doesNotMatch(a2, /40\s*Вт/i);

// Switch location -> RAG
expectNoDeterministic("Где расположен основной выключатель питания на корпусе?");

// Surge -> RAG
expectNoDeterministic("Есть ли у шкафа встроенная защита от перепадов напряжения?");

// Shelf load not cabinet mass
const a3 = expectKey("Какую максимальную массу выдержит одна стандартная полка?", [], "shelf_load_standard");
assert.match(a3, /50\s*кг/i);
assert.doesNotMatch(a3, /180\s*кг/i);

// Shelf height adjust -> RAG
expectNoDeterministic("На сколько миллиметров можно регулировать полки по высоте?");

// Follow-up power options
const a4 = expectKey(
  "А с опциями азота и подогрева?",
  [{ role: "user", content: "Какая мощность SDB1106NM в режиме хранения?" }],
  "power_storage_options"
);
assert.match(a4, /810\s*Вт/i);

// New facts
assert.match(expectKey("Какого цвета порошковое покрытие используется для корпуса?", [], "coat_color"), /RAL7035/i);
assert.match(
  expectKey("Какое предельное значение относительной влажности может поддерживать шкаф?", [], "humidity_range"),
  /80/i
);
assert.match(
  expectKey("Какой класс защиты от поражения электрическим током имеет изделие?", [], "ip_protection"),
  /IP65/i
);
// storage base without options
assert.match(
  expectKey("Какая потребляемая мощность SDB1106NM в режиме хранения без опций?", [], "power_storage_base"),
  /8\s*Вт/i
);
assert.match(
  expectKey("Какова пиковая мощность при одновременно включенном подогреве и азоте?", [], "power_storage_options"),
  /810\s*Вт/i
);

assert.match(
  expectKey("Какой материал используется для изготовления прозрачных вставок в дверях?", [], "door_glass"),
  /стекл/i
);
assert.match(
  expectKey("Укажите диапазон рабочих температур внутри шкафа.", [], "chamber_temperature"),
  /15|35|окружающ/i
);
assert.match(
  expectKey("Какое химическое вещество используется в качестве поглотителя влаги?", [], "desiccant_zeolite"),
  /цеолит/i
);
assert.match(
  expectKey("Каким стандартам ГОСТ соответствует антистатическое покрытие шкафа?", [], "esd_gost"),
  /61340/i
);
assert.match(
  expectKey("Можно ли использовать шкаф для хранения взрывоопасных веществ?", [], "explosive_storage"),
  /не\s+предназнач|запрещ/i
);

// P1.5 ad-hoc disambiguation
assert.match(
  expectKey(
    "Сколько времени длится полный цикл регенерации осушающего вещества (цеолита) в модулях шкафа?",
    [],
    "regen_cycle_duration"
  ),
  /60\s*[±+-]?\s*1?\s*мин/i
);
assert.match(
  expectKey(
    "Нужно ли отключать шкаф от электрической сети 220В при проведении ежемесячного визуального осмотра заземления и кабеля питания?",
    [],
    "inspection_power_off"
  ),
  /отключ.*2\.2\.2|2\.2\.2.*отключ/i
);
assert.match(
  expectKey(
    "Какое максимальное избыточное давление азота в МПа разрешено подавать в шкаф, если на нем установлена опция азотного питания?",
    [],
    "nitrogen_pressure_max"
  ),
  /6\s*бар|0[,.]6/i
);
assert.match(
  expectKey(
    "Через сколько тысяч часов непрерывной работы требуется полностью заменить цеолит в осушающих модулях шкафа SDB1106NM на новый?",
    [],
    "maintenance_desiccant_replace"
  ),
  /36\s*месяц/i
);
assert.match(
  expectKey(
    "Какая известная немецкая или японская компания является производителем цифрового датчика влажности и температуры, установленного внутри этого шкафа?",
    [],
    "sensor_brand_unknown"
  ),
  /не\s+указан/i
);
assert.match(
  expectKey(
    "Оператор услышал прерывистый звуковой сигнал шкафа. Что это означает и через какое время после открытия двери он обычно срабатывает?",
    [],
    "door_sound_signal"
  ),
  /1\.1\.4\.3\.4|открыт/i
);
assert.match(
  expectKey(
    "Каким образом и с помощью какого вещества происходит осушение воздуха внутри шкафа — используется ли там химический жидкий осушитель?",
    [],
    "desiccant_drying_process"
  ),
  /цеолит/i
);
assert.match(
  expectKey(
    "В шкаф загрузили партию печатных плат общим весом 120 кг, равномерно распределив их по двум усиленным полкам. Выдержит ли шкаф такую нагрузку?",
    [],
    "shelf_load_reinforced"
  ),
  /выдерж|не\s+превыш/i
);

console.log("OK: golden router P0 tests passed");
