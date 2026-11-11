#!/usr/bin/env node
/**
 * Build Task 28 generalization eval dataset (independent of v2 regression suite).
 * Sources: PDF text excerpts in docs/reports/sdb1560m-audit-pdf-pages/, golden-facts.
 */
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "eval", "sdb1560m-generalization-v1.json");
const V2 = path.join(__dirname, "..", "docs", "reports", "sdb1560m-eval-suite-expanded-v2.json");

const ABSTAIN_PATTERNS = [
  "Информация отсутствует в документации\\.",
  "не\\s+указан|отсутств",
];

function mustAnswer(id, category, message, requiredFacts, extra = {}) {
  return {
    id,
    equipmentId: "sdb1560m",
    category,
    message,
    resolutionStatus: "ready",
    expectedOutcome: { mode: "must_answer" },
    requiredFacts,
    forbiddenClaims: extra.forbiddenClaims || [],
    factIds: extra.factIds || [],
    notes: extra.notes,
    scoring: { countsToward: ["answer_factual_accuracy"] },
  };
}

function mustAbstain(id, category, message, extra = {}) {
  return {
    id,
    equipmentId: "sdb1560m",
    category,
    message,
    resolutionStatus: "ready",
    expectedOutcome: {
      mode: "must_abstain",
      abstainReason: extra.abstainReason || "not in SDB1560NM manual",
    },
    requiredFacts: [],
    abstentionRules: {
      allowedAbstainPatterns: extra.patterns || ABSTAIN_PATTERNS,
    },
    forbiddenClaims: extra.forbiddenClaims || [],
    notes: extra.notes,
    scoring: { countsToward: ["correct_abstention_rate"] },
  };
}

function fact(pattern, unit, sourceHint, factId) {
  const row = { claimPattern: pattern, sourceHint: sourceHint };
  if (unit) row.unit = unit;
  if (factId) row.factId = factId;
  return row;
}

function buildCases() {
  const cases = [];

  const num = (id, cat, msg, pattern, unit, src, forbidden = [], factId) =>
    cases.push(
      mustAnswer(id, cat, msg, [fact(pattern, unit, src, factId)], {
        forbiddenClaims: forbidden.map((p) => ({ pattern: p, reason: "wrong model or value" })),
      }),
    );

  // --- Numeric / TTX (§1.1.2, table 1.1 p.7) ---
  num("gen.num.mass.base", "numeric_spec", "Какова масса базового исполнения SDB1560М?", "260", "kg", "PDF table 1.1 p.7", ["180", "160"], "F-MASS");
  num("gen.num.width.mm", "numeric_spec", "Укажите ширину шкафа SDB1560М в миллиметрах.", "1202", "mm", "PDF table 1.1 p.7", ["1004", "602"]);
  num("gen.num.height.mm", "numeric_spec", "Какая высота SDB1560М по таблице габаритов?", "1693", "mm", "PDF table 1.1 p.7", ["1917"]);
  num("gen.num.depth.mm", "numeric_spec", "Глубина SDB1560М по Таблице 1.1?", "1028", "mm", "PDF table 1.1 p.7", ["772", "665"]);
  num("gen.num.dim-tolerance", "numeric_spec", "С какой погрешностью указаны габариты в Таблице 1.1?", "5", "mm", "PDF table 1.1 note p.7", []);

  num("gen.num.pwr-storage", "numeric_spec", "Максимальная мощность в режиме хранения для SDB1560М?", "8", "W", "PDF p.5 п.1.1.2.7а", ["40", "540"]);
  num("gen.num.pwr-dry", "numeric_spec", "Сколько ватт не более в режиме осушения у SDB1560М?", "40", "W", "PDF p.6 п.1.1.2.7в", ["20", "8"]);
  num("gen.num.pwr-regen", "numeric_spec", "Потолок мощности в режиме регенерации осушителя для SDB1560М?", "540", "W", "PDF p.6 п.1.1.2.7д", ["285"]);
  num("gen.num.pwr-storage-opt810", "numeric_spec", "Мощность в режиме хранения с азотом и подогревом для SDB1560М?", "810", "W", "PDF p.5 п.1.1.2.7б", ["405", "8"]);
  num("gen.num.pwr-dry-opt810", "numeric_spec", "Максимальная мощность в режиме осушения с опциями азота и подогрева для SDB1560М?", "810", "W", "PDF p.6 п.1.1.2.7г", ["415", "40"]);

  num("gen.num.voltage", "numeric_spec", "От какого напряжения сети питается шкаф?", "220", null, "PDF p.5 п.1.1.2.6", []);
  num("gen.num.freq", "numeric_spec", "Какая частота питающей сети указана в РЭ?", "50", null, "PDF p.5 п.1.1.2.6", []);

  num("gen.num.rh-range-low", "numeric_spec", "Нижняя граница диапазона поддержания влажности внутри шкафа?", "0", null, "PDF p.4 п.1.1.2.1", []);
  num("gen.num.rh-range-high", "numeric_spec", "Верхняя граница диапазона поддержания RH% внутри рабочего объёма?", "80", null, "PDF p.4 п.1.1.2.1", []);
  num("gen.num.rh-step", "numeric_spec", "Какой шаг установки диапазона влажности в меню?", "0[,.]1", null, "PDF p.4 п.1.1.2.2", []);
  num("gen.num.rh-accuracy", "numeric_spec", "Точность поддержания установленного диапазона влажности?", "1", null, "PDF p.4 п.1.1.2.3", []);
  num("gen.num.rh-warmup-hours", "numeric_spec", "Сколько времени не более нужно для выхода на установленную влажность после включения?", "3", null, "PDF p.4 п.1.1.2.4", ["180"]);

  num("gen.env.temp-min", "numeric_spec", "Минимальная температура окружающего воздуха при эксплуатации SDB1560М?", "15", null, "PDF p.7 п.1.1.2.12", []);
  num("gen.env.temp-max", "numeric_spec", "Максимальная температура окружающего воздуха для эксплуатации?", "35", null, "PDF p.7 п.1.1.2.12", []);
  num("gen.env.rh-ambient", "numeric_spec", "Предельная относительная влажность окружающего воздуха при эксплуатации?", "80", null, "PDF p.7 п.1.1.2.12", []);
  num("gen.env.pressure-kpa-min", "numeric_spec", "Нижняя граница атмосферного давления для эксплуатации (кПа)?", "84", null, "PDF p.7 п.1.1.2.12", []);
  num("gen.env.pressure-kpa-max", "numeric_spec", "Верхняя граница атмосферного давления (кПа)?", "106[,.]7", null, "PDF p.7 п.1.1.2.12", []);

  num("gen.num.ip55", "numeric_spec", "Какой класс защиты не ниже указан для шкафа?", "IP55", null, "PDF p.7 п.1.1.2.11", []);
  num("gen.num.ral", "numeric_spec", "Какой цвет корпуса RAL указан в РЭ?", "7035", null, "PDF p.7 п.1.1.2.10", []);
  num("gen.num.shelf-load", "numeric_spec", "Максимальная нагрузка на стандартную полку SDB1560М?", "100", "kg", "PDF p.2 / раздел 2.1", ["20"]);

  // --- Kit table 1.2 p.10 ---
  num("gen.kit.wheels", "kit_completeness", "Сколько колёс для транспортирования в базовой поставке SDB1560М?", "4", null, "PDF table 1.2 p.10", []);
  num("gen.kit.feet", "kit_completeness", "Сколько регулируемых ножек в комплекте SDB1560М?", "4", null, "PDF table 1.2 p.10", []);
  num("gen.kit.feet-height", "kit_completeness", "Максимальная высота регулируемых ножек?", "50", "mm", "PDF table 1.2 p.10", []);
  num("gen.kit.desiccant", "kit_completeness", "Сколько осушителей в базовой поставке SDB1560М?", "2", null, "PDF table 1.2 p.10 item 6.2", ["1"]);
  num("gen.kit.shelves-perf", "kit_completeness", "Сколько полок с перфорацией для SDB1560М в таблице 1.2?", "4", null, "PDF table 1.2 p.10 item 8.6", []);
  num("gen.kit.power-cord", "kit_completeness", "Минимальная длина шнура питания в комплекте?", "4", "m", "PDF table 1.2 p.10", []);
  num("gen.kit.ground-wire", "kit_completeness", "Минимальная длина провода функционального заземления?", "1[,.]8", "m", "PDF table 1.2 p.10", []);
  num("gen.kit.ground-resistor", "kit_completeness", "Сопротивление резистора в комплекте заземления?", "1", null, "PDF table 1.2 p.10 (1 МОм)", []);
  num("gen.kit.ethernet", "kit_completeness", "Есть ли разъём Ethernet в базовой поставке?", "Ethernet", null, "PDF table 1.2 p.10 item 4", []);
  num("gen.kit.indicator", "kit_completeness", "Какой световой индикатор встроен в панель управления?", "трехцвет", null, "PDF table 1.2 p.10 item 7", []);

  // --- Options table 1.4 p.11 ---
  num("gen.opt.heat-modules", "kit_completeness", "Сколько модулей системы подогрева воздуха для SDB1560M в опциях?", "2", null, "PDF table 1.4 p.11 item 6", ["1"]);
  num("gen.opt.feeder-basket-min", "kit_completeness", "Минимальное число корзин питателей для SDB1560М по опциям?", "1", null, "PDF table 1.4 p.11 item 9", []);
  num("gen.opt.feeder-basket-max", "kit_completeness", "Максимальное число корзин питателей для SDB1560М?", "2", null, "PDF table 1.4 p.11 item 9", []);

  // --- N2 option p.25 ---
  num("gen.opt.n2-pressure", "numeric_spec", "Максимальное давление азота на входе опции?", "6", null, "PDF p.25 п.1.2.2.1", []);
  num("gen.opt.n2-tube", "numeric_spec", "Диаметр трубки для подключения опции азота к магистрали?", "8", "mm", "PDF p.25 п.1.2.2.1", []);
  num("gen.opt.n2-flow-min", "numeric_spec", "Минимальный расход азота по опции?", "3", null, "PDF p.25 п.1.2.2.1", []);
  num("gen.opt.n2-flow-max", "numeric_spec", "Максимальный расход азота?", "30", null, "PDF p.25 п.1.2.2.1", []);
  num("gen.opt.n2-timer-max", "numeric_spec", "Верхний предел установки времени подачи азота без датчика (мин)?", "99[,.]9", null, "PDF p.25 п.1.2.2.1", []);
  num("gen.opt.n2-sensor-min", "numeric_spec", "Минимальный порог концентрации азота с датчиком (%)?", "78", null, "PDF p.25 п.1.2.2.1", []);
  num("gen.opt.n2-sensor-max", "numeric_spec", "Максимальный порог концентрации азота с датчиком?", "98", null, "PDF p.25 п.1.2.2.1", []);

  // --- Maintenance table 3.1 p.35 ---
  num("gen.maint.desiccant-months", "maintenance", "Периодичность замены блока осушения?", "36", null, "PDF table 3.1 p.35", ["12"]);
  num("gen.maint.dust-months", "maintenance", "Как часто продувать от пыли узел поддержания температуры (если опция есть)?", "12", null, "PDF table 3.1 p.35", []);
  num("gen.maint.door-seals", "maintenance", "Периодичность проверки уплотнительных резинок дверей?", "1", null, "PDF table 3.1 p.35", []);
  num("gen.maint.power-cable", "maintenance", "Как часто проверять кабель сетевого питания 220 В?", "1", null, "PDF table 3.1 p.35", []);
  num("gen.maint.eth-cable", "maintenance", "Периодичность проверки кабеля Ethernet?", "1", null, "PDF table 3.1 p.35", []);

  // --- Operating modes & indicators p.15 ---
  cases.push(
    mustAnswer(
      "gen.mode.green-storage",
      "operating_mode",
      "Что означает постоянный зелёный световой сигнал на панели?",
      [fact("Хранен", null, "PDF p.15 п.1.1.4.3.3а")],
    ),
  );
  cases.push(
    mustAnswer(
      "gen.mode.yellow-regen",
      "operating_mode",
      "Жёлтый световой индикатор — это какой режим?",
      [fact("Регенерац", null, "PDF p.15 п.1.1.4.3.3в")],
    ),
  );
  cases.push(
    mustAnswer(
      "gen.mode.dry-blink",
      "operating_mode",
      "Зелёный и мигающий красный — что за режим работы?",
      [fact("Осушен", null, "PDF p.15 п.1.1.4.3.3б")],
    ),
  );
  cases.push(
    mustAnswer(
      "gen.ind.red-door",
      "alarm_troubleshooting",
      "Постоянный красный световой сигнал при зелёном — что произошло?",
      [fact("двер", null, "PDF p.15 п.1.1.4.3.3г")],
    ),
  );
  cases.push(
    mustAnswer(
      "gen.sym.w-heating",
      "operating_mode",
      "Что означает символ W на LCD дисплее?",
      [fact("подогрев", null, "PDF p.15 п.1.1.4.3.2е")],
    ),
  );
  cases.push(
    mustAnswer(
      "gen.sym.n2",
      "operating_mode",
      "Символ N2 на дисплее — что подключено?",
      [fact("азот", null, "PDF p.15 п.1.1.4.3.2д")],
    ),
  );
  cases.push(
    mustAnswer(
      "gen.proc.sound-door",
      "alarm_troubleshooting",
      "Когда включается звуковая сигнализация по двери?",
      [fact("открыт", null, "PDF p.15 п.1.1.4.3.4")],
    ),
  );

  // --- Procedures (retrieval cards ↔ PDF 1.1.4.4) ---
  cases.push(
    mustAnswer(
      "gen.proc.door-fan-off",
      "alarm_troubleshooting",
      "Что происходит с вентилятором осушителя при открытой двери?",
      [fact("отключ", null, "PDF п.1.1.4.4.1 / card door-close-dry")],
    ),
  );
  cases.push(
    mustAnswer(
      "gen.proc.close-door-timer",
      "alarm_troubleshooting",
      "Сколько минут длится ускоренное осушение после закрытия двери (±1 мин)?",
      [fact("60", null, "PDF п.1.1.4.4.1 / card door-close-dry")],
    ),
  );
  cases.push(
    mustAnswer(
      "gen.proc.fan-restart-1rh",
      "alarm_troubleshooting",
      "При каком росте RH относительно установленного снова включается вентилятор?",
      [fact("1", null, "PDF п.1.1.4.4.1 / card fan-restart-1rh")],
    ),
  );
  cases.push(
    mustAnswer(
      "gen.proc.regen-shutdown",
      "operating_mode",
      "Можно ли выключать шкаф при жёлтом индикаторе регенерации?",
      [fact("запрещ|нельзя|не\\s+выключ", null, "PDF п.1.1.4 / card yellow-and-w")],
      { forbiddenClaims: [{ pattern: "можно выключ", reason: "forbidden during regen" }] },
    ),
  );

  // --- Multi-fact ---
  cases.push(
    mustAnswer(
      "gen.multi.mass-depth",
      "numeric_spec",
      "Назовите массу и глубину SDB1560М по Таблице 1.1.",
      [
        fact("260", "kg", "PDF table 1.1 p.7", "F-MASS"),
        fact("1028", "mm", "PDF table 1.1 p.7"),
      ],
      { forbiddenClaims: [{ pattern: "772", reason: "SDB1106NM depth" }] },
    ),
  );
  cases.push(
    mustAnswer(
      "gen.multi.dry-regen-power",
      "numeric_spec",
      "Максимальная мощность в осушении и в регенерации для SDB1560М?",
      [fact("40", "W", "PDF p.6"), fact("540", "W", "PDF p.6")],
      { forbiddenClaims: [{ pattern: "20", reason: "small cabinet dry power" }] },
    ),
  );
  cases.push(
    mustAnswer(
      "gen.multi.ambient-temp-rh",
      "numeric_spec",
      "Допустимые температура и RH окружающего воздуха при эксплуатации?",
      [fact("15", null, "PDF p.7"), fact("35", null, "PDF p.7"), fact("80", null, "PDF p.7")],
    ),
  );
  cases.push(
    mustAnswer(
      "gen.multi.n2-flow-range",
      "numeric_spec",
      "Диапазон расхода азота для опции (л/мин)?",
      [fact("3", null, "PDF p.25"), fact("30", null, "PDF p.25")],
    ),
  );

  // --- Paraphrases (distinct wording from v2) ---
  const paraphrases = [
    ["gen.para.mass", "numeric_spec", "Масса шкафа модели SDB1560М в килограммах?", "260", "kg", "PDF table 1.1 p.7"],
    ["gen.para.storage-w", "numeric_spec", "Сколько максимум ватт в режиме поддержания влажности без опций?", "8", "W", "PDF p.5"],
    ["gen.para.rh-step", "paraphrase", "Минимальный шаг изменения уставки влажности в RH%?", "0[,.]1", null, "PDF p.4"],
    ["gen.para.ip", "paraphrase", "Степень защиты корпуса по IP?", "IP55", null, "PDF p.7"],
    ["gen.para.desiccant-qty", "paraphrase", "Число блоков осушителя у SDB1560М в базовой комплектации?", "2", null, "PDF table 1.2"],
    ["gen.para.wheels-qty", "paraphrase", "Количество транспортировочных колёс у SDB1560М?", "4", null, "PDF table 1.2"],
    ["gen.para.36m", "paraphrase", "Через сколько месяцев менять блок осушения по графику ТО?", "36", null, "PDF table 3.1"],
    ["gen.para.operating-247", "operating_mode", "Какой режим работы шкафа указан в ТТХ?", "круглосуточ", null, "PDF p.4 п.1.1.2.5"],
    ["gen.para.no-humidify", "operating_mode", "Может ли шкаф повышать RH выше окружающей среды?", "не\\s+предназнач|выше\\s+.*окружа", null, "PDF p.4 п.1.1.1"],
    ["gen.para.dry-storage-sw", "kit_completeness", "Как называется ПО для удалённого доступа по Ethernet?", "Dry Storage", null, "PDF p.9–10"],
  ];
  for (const [id, cat, msg, pat, unit, src] of paraphrases) {
    num(id, cat, msg, pat, unit, src);
  }

  // --- Similar-parameter discrimination ---
  num("gen.disc.storage-vs-dry", "numeric_spec", "Чем отличается 8 Вт от 40 Вт в ТТХ SDB1560М (какой режим 40 Вт)?", "40", "W", "PDF p.5–6", []);
  num("gen.disc.810-storage-vs-dry", "numeric_spec", "810 Вт с опциями — это режим хранения или осушения для SDB1560М?", "810", "W", "PDF p.5–6", []);

  // --- Foreign model (must answer with 1560 value, forbid leak) ---
  cases.push(
    mustAnswer(
      "gen.foreign.dry-power-1560",
      "foreign_model",
      "Для SDB1560М какая максимальная мощность в режиме осушения — 20 Вт или 40 Вт?",
      [fact("40", "W", "PDF p.6")],
      { forbiddenClaims: [{ pattern: "20", reason: "SDB302 dry power", leakageModel: "SDB302" }] },
    ),
  );
  cases.push(
    mustAnswer(
      "gen.foreign.mass-1106",
      "foreign_model",
      "Сколько kilogram весит SDB1106 по той же таблице габаритов?",
      [fact("160", "kg", "PDF table 1.1 p.7")],
      { forbiddenClaims: [{ pattern: "260", reason: "SDB1560M mass leak" }] },
    ),
  );

  // --- Abstain / unsupported ---
  const abstains = [
    ["gen.unsup.wifi", "Есть ли встроенный Wi-Fi модуль?", "Wi-Fi not in manual"],
    ["gen.unsup.mqtt-api", "Поддерживается ли протокол MQTT для интеграции?", "MQTT not in manual"],
    ["gen.unsup.mobile-app", "Как скачать мобильное приложение шкафа?", "no mobile app in RE"],
    ["gen.unsup.default-ip", "Какой IP-адрес по умолчанию у шкафа?", "default IP not in RE"],
    ["gen.unsup.cpu", "Какой процессор в блоке управления?", "CPU not specified"],
    ["gen.unsup.regen-duration-min", "Сколько минут длится цикл регенерации осушителя?", "regen duration minutes not in RE"],
    ["gen.unsup.bluetooth", "Есть Bluetooth для настройки?", "Bluetooth not in manual"],
    ["gen.unsup.firmware-version", "Какая версия прошивки установлена с завода?", "firmware version not in RE"],
    ["gen.unsup.warranty-years", "Сколько лет гарантия от изготовителя?", "warranty term not in this RE body"],
    ["gen.unsup.sdb151-mass-for-1560", "Сколько весит SDB151 — нужно для расчёта помещения под SDB1560М.", "wrong model transfer"],
    ["gen.unsup.internal-volume-liters", "Точный внутренний объём SDB1560M в литрах по PDF?", "volume L not verified in PDF text layer"],
    ["gen.unsup.full-volume-liters", "Полный объём шкафа в литрах по руководству?", "full volume L not verified in PDF text"],
    ["gen.unsup.warehouse-humidity-setpoint", "Какую влажность установить для хранения печатных плат без указания класса?", "insufficient input"],
  ];
  for (const [id, msg, reason] of abstains) {
    cases.push(
      mustAbstain(id, "unsupported_by_manual", msg, {
        abstainReason: reason,
        notes: "PDF/golden unsupported list",
      }),
    );
  }

  cases.push(
    mustAbstain(
      "gen.unsup.modbus",
      "unsupported_by_manual",
      "Есть Modbus RTU на шкафу?",
      {
        abstainReason: "Modbus not in manual",
        forbiddenClaims: [{ pattern: "Modbus\\s+есть|поддержива", reason: "unsupported claim" }],
      },
    ),
  );

  // --- Insufficient data (abstain or no fabricated number) ---
  cases.push(
    mustAbstain(
      "gen.insuf.n2-without-option",
      "unsupported_by_manual",
      "Какой расход азота у шкафа без установленной опции азота?",
      {
        abstainReason: "N2 flow only defined for option",
        notes: "PDF p.25 applies to option only",
      },
    ),
  );

  // --- Additional coverage to reach 100+ cases ---
  cases.push(
    mustAnswer(
      "gen.std.esd",
      "numeric_spec",
      "Каким стандартам по ESD соответствует шкаф?",
      [fact("61340", null, "PDF p.7 п.1.1.2.9")],
    ),
  );
  cases.push(
    mustAnswer(
      "gen.spare.lock-excluded",
      "kit_completeness",
      "Входит ли запасной замок на каждую дверь в перечень запасных частей для SDB1560M?",
      [fact("кроме.*1560|1560M\\)", null, "PDF table 1.3 p.11 item 1")],
      { notes: "SDB1560M excluded from spare lock row" },
    ),
  );
  num("gen.opt.water-containers", "kit_completeness", "Сколько контейнеров для воды тип 12.401 для SDB1560M в опциях?", "2", null, "PDF table 1.4 p.11 item 10.1", []);
  cases.push(
    mustAnswer(
      "gen.note.height-signal",
      "paraphrase",
      "Учитывается ли светосигнальная колонна «Светофор» в высоте из Таблицы 1.1?",
      [fact("без\\s+учета|не\\s+учитыва", null, "PDF table 1.1 note p.7")],
    ),
  );
  cases.push(
    mustAnswer(
      "gen.sw.remote",
      "kit_completeness",
      "Какие функции выполняет ПО Dry Storage по Ethernet?",
      [fact("удален", null, "PDF p.9 п.1.1.2.14")],
    ),
  );
  cases.push(
    mustAnswer(
      "gen.rh.rule-below30",
      "numeric_spec",
      "Для уставки 0–30 RH% установка не выше какой величины относительно окружающей?",
      [fact("10", null, "PDF p.4–5 ВНИМАНИЕ п.2")],
    ),
  );
  cases.push(
    mustAnswer(
      "gen.rh.rule-above30",
      "numeric_spec",
      "Для уставки от 30 RH% и выше — не более RH окружающей минус сколько?",
      [fact("20", null, "PDF p.4–5 ВНИМАНИЕ п.2")],
    ),
  );
  cases.push(
    mustAnswer(
      "gen.spare.fuse-heating",
      "kit_completeness",
      "Какой предохранитель указан для SDB1560M с системой подогрева воздуха?",
      [fact("6\\s*А|H520", null, "PDF table 1.3 p.11 item 3.2")],
    ),
  );
  num("gen.env.pressure-mmhg-min", "numeric_spec", "Нижняя граница давления в мм рт. ст.?", "630", null, "PDF p.7 п.1.1.2.12", []);
  num("gen.env.pressure-mmhg-max", "numeric_spec", "Верхняя граница давления в мм рт. ст.?", "800", null, "PDF p.7 п.1.1.2.12", []);
  cases.push(
    mustAnswer(
      "gen.multi.width-height",
      "numeric_spec",
      "Ширина и высота SDB1560М по Таблице 1.1?",
      [fact("1202", "mm", "PDF table 1.1"), fact("1693", "mm", "PDF table 1.1")],
    ),
  );
  cases.push(
    mustAnswer(
      "gen.ind.green-only-storage",
      "paraphrase",
      "Если горит только зелёный (без красного и жёлтого), какой режим?",
      [fact("Хранен", null, "PDF p.15")],
    ),
  );
  cases.push(
    mustAbstain(
      "gen.unsup.blockchain",
      "unsupported_by_manual",
      "Записывает ли шкаф данные в блокчейн?",
      { abstainReason: "not in manual" },
    ),
  );
  cases.push(
    mustAbstain(
      "gen.unsup.serial-format",
      "unsupported_by_manual",
      "Как расшифровать серийный номер на шильдике?",
      { abstainReason: "serial decode not in RE" },
    ),
  );
  cases.push(
    mustAnswer(
      "gen.proc.open-door-symbol",
      "operating_mode",
      "Какой символ на LCD показывает открытую дверь?",
      [fact("двер", null, "PDF p.15 п.1.1.4.3.2г")],
    ),
  );
  cases.push(
    mustAnswer(
      "gen.proc.fan-symbol",
      "operating_mode",
      "Какой символ означает включённый вентилятор осушителя?",
      [fact("вентилятор", null, "PDF p.15 п.1.1.4.3.2в")],
    ),
  );

  return cases;
}

function main() {
  const v2 = JSON.parse(fs.readFileSync(V2, "utf8"));
  const v2Messages = new Set(v2.cases.map((c) => c.message.trim().toLowerCase()));

  const cases = buildCases();
  const ids = new Set();
  const messages = new Set();
  const dupV2 = [];

  for (const c of cases) {
    if (ids.has(c.id)) throw new Error(`duplicate id ${c.id}`);
    ids.add(c.id);
    const mk = c.message.trim().toLowerCase();
    if (messages.has(mk)) throw new Error(`duplicate message: ${c.message}`);
    messages.add(mk);
    if (v2Messages.has(mk)) dupV2.push(c.id);
  }
  if (dupV2.length) {
    throw new Error(`messages overlap v2 suite: ${dupV2.join(", ")}`);
  }

  const answerCount = cases.filter((c) => c.expectedOutcome.mode === "must_answer").length;
  const abstainCount = cases.filter((c) => c.expectedOutcome.mode === "must_abstain").length;

  if (cases.length < 100 || cases.length > 150) {
    throw new Error(`case count ${cases.length} outside 100–150 target`);
  }

  const doc = {
    schemaVersion: "1.0-eval-contour",
    equipmentId: "sdb1560m",
    suiteMeta: {
      name: "sdb1560m-generalization-v1",
      description:
        "Task 28 independent generalization suite; questions derived from SDB1560NM PDF excerpts (audit pages) and golden-facts; excludes v2 regression messages.",
      parentSuite: null,
      references: [
        "public/manuals/SDB1560NM.pdf",
        "docs/reports/sdb1560m-audit-pdf-pages/",
        "knowledge/sdb1560m/golden-facts-sdb1560m.md",
        "docs/reports/sdb1560m-task27-extract-routing-regression-recovery.md",
      ],
      task28: {
        answerCases: answerCount,
        abstainCases: abstainCount,
        totalCases: cases.length,
      },
    },
    cases,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  console.log(`Wrote ${cases.length} cases (${answerCount} answer, ${abstainCount} abstain) → ${OUT}`);
}

main();
