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

// Previous topic must not turn a kit-count question into shelf load.
assert.match(
  expectKey(
    "Сколько полок идет в комплекте?",
    [{ role: "user", content: "Какой вес шкафа?" }],
    "kit_shelf_count"
  ),
  /10\s*(?:шт|полк)/i
);

assert.match(
  expectKey("Как задать уровень влажности?", [], "humidity_menu_procedure"),
  /SET|порог\s+влажност/i
);

// Similar wording must retain the topic instead of crossing into another rule.
expectKey("Какой шаг установки влажности?", [], "humidity_step");
expectKey("Когда шкаф выйдет на установленную влажность?", [], "humidity_time_to_setpoint");
expectKey("Красный огонек на шкафе — что это?", [], "panel_indicator_red");
expectKey("Сколько ватт при регенерации?", [], "power_regeneration");
expectKey("Сколько минут длится регенерация?", [], "regen_cycle_duration");
expectKey("Сколько весит полка?", [], "shelf_load_standard", false);

// Grounding not power
const a2 = expectKey("Требуется ли шкафу защитное заземление?", [], "grounding_required");
assert.match(a2, /заземл/i);
assert.doesNotMatch(a2, /40\s*Вт/i);

// Switch location
assert.match(
  expectKey(
    "Где на корпусе расположен основной тумблер отключения электропитания?",
    [],
    "main_power_switch_location"
  ),
  /кожух|осушител|тумблер/i
);

assert.match(
  expectKey("Есть ли у шкафа встроенная защита от перепадов напряжения?", [], "voltage_surge_not_specified"),
  /не\s+указан/i
);

// Shelf load not cabinet mass
const a3 = expectKey("Какую максимальную массу выдержит одна стандартная полка?", [], "shelf_load_standard");
assert.match(a3, /50\s*кг/i);
assert.doesNotMatch(a3, /180\s*кг/i);

assert.match(
  expectKey("На сколько миллиметров можно регулировать полки по высоте?", [], "shelf_convection_spacing"),
  /50\s*мм|не\s+задано|не\s+привед/i
);

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
  /IP55/i
);
// storage base without options
assert.match(
  expectKey("Какая потребляемая мощность SDB1106NM в режиме хранения без опций?", [], "power_storage_base"),
  /8\s*Вт/i
);
assert.match(
  expectKey(
    "Сколько ватт потребляет шкаф в режиме «Хранения» без дополнительных опций (азот и подогрев выключены)?",
    [],
    "power_storage_base"
  ),
  /8\s*Вт/i
);
assert.match(
  expectKey(
    "В каком климатическом исполнении по ГОСТ 15150 выпускается шкаф (категория размещения)?",
    [],
    "climatic_execution_uhl"
  ),
  /ухл|4[,.]2/i
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
  expectKey("Из какого материала выполнен корпус?", [], "cabinet_body_material"),
  /стал/i
);
assert.match(
  expectKey("Корпус шкафа из стали?", [], "cabinet_body_material"),
  /стал/i
);
assert.match(
  expectKey("Какая длина шнура питания в комплекте SDB1106NM?", [], "power_cord_length"),
  /4\s*м/i
);
assert.match(
  expectKey("При каких условиях запускается регенерация (RH%т, RH%п, 30 минут)?", [], "regen_activation_conditions"),
  /rh%|30|1\s*rh/i
);
assert.doesNotMatch(
  expectKey("При каких условиях запускается регенерация (RH%т, RH%п, 30 минут)?", [], "regen_activation_conditions"),
  /^Полный цикл/i
);
assert.match(
  expectKey("Как монтируется опция подогрева (замена двух полок на укороченные)?", [], "heating_option_mount"),
  /укорочен|2|две/i
);
assert.match(
  expectKey("Как меняются габариты шкафа при установке опции подачи азота?", [], "nitrogen_option_dimensions"),
  /приложени|1204|габарит/i
);
assert.match(
  expectKey("Можно ли протирать смотровые окна спиртосодержащими растворами?", [], "window_cleaning_alcohol"),
  /не\s+указан|спирт|сух/i
);
assert.match(
  expectKey("Есть ли в комплекте антистатический браслет?", [], "esd_bracelet_kit"),
  /браслет/i
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
assert.match(
  expectKey("Можно ли хранить воспламеняющиеся вещества в шкафу SDB1106NM?", [], "explosive_storage"),
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

assert.match(
  expectKey(
    "Сколько перфорированных полок входит в базовый комплект поставки данного шкафа?",
    [],
    "kit_shelf_count"
  ),
  /10\s*шт/i
);
assert.match(
  expectKey("Сколько стандартных полок идет в комплекте с SDB1106NM?", [], "kit_shelf_count"),
  /10\s*шт/i
);
assert.match(
  expectKey("Какова максимальная температура нагрева в опции «Подогрев воздуха»?", [], "heating_air_max_temp"),
  /40\s*°|плюс\s*40/i
);

assert.match(
  expectKey("Как начать работу с шкафом?", [], "first_startup_guide"),
  /2\.2\.2|внешний осмотр|включение/i
);

console.log("OK: golden router P0 tests passed");
