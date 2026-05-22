/**
 * Эталонные ТТХ SDB1106NM — единый источник для deterministic, validation, chunking.
 */

const GOLDEN_MODEL = "SDB1106NM";

const GOLDEN_TABLE_11 = Object.freeze([
  { key: "width", label: "Ширина", value: "1204", unit: "мм" },
  { key: "height", label: "Высота", value: "1952", unit: "мм" },
  { key: "depth", label: "Глубина", value: "772", unit: "мм" },
  { key: "mass", label: "Масса", value: "180", unit: "кг" },
]);

const GOLDEN_IP = Object.freeze({ value: "65", display: "IP65" });
const GOLDEN_COAT_COLOR = Object.freeze({ value: "RAL7035" });
const GOLDEN_HUMIDITY_STEP = Object.freeze({ value: "0,1", unit: "%RH" });

const GOLDEN_POWER_W = Object.freeze({
  storageBase: 8,
  storageOptions: 810,
  dryingBase: 40,
  dryingOptions: 810,
  regeneration: 540,
});

const GOLDEN_SHELF_LOAD_KG = Object.freeze({
  standard: 50,
  reinforced: 100,
  cutoutHeating: 20,
  drawer: 50,
});

/** Чужие массы из multi-model табл. 1.1 — ложные для SDB1106NM. */
const FORBIDDEN_ALIEN_MASS_KG = Object.freeze(["42", "56", "90", "1028"]);

/** Deterministic bypass RAG только при high. */
const HIGH_CONFIDENCE_KEYS = new Set([
  "mass",
  "width",
  "height",
  "depth",
  "dimensions_all",
  "power_storage_base",
  "power_storage_options",
  "power_drying_base",
  "power_regeneration",
  "ip_protection",
  "humidity_step",
  "humidity_range",
  "grounding_resistance",
  "grounding_required",
  "frequency",
  "power_voltage",
  "coat_color",
  "operating_conditions",
  "shelf_load_standard",
  "shelf_load_reinforced",
  "shelf_load_cutout",
  "shelf_load_drawer",
  "power_on_procedure",
  "door_glass",
  "chamber_temperature",
  "desiccant_zeolite",
  "esd_gost",
  "explosive_storage",
]);

const FOLLOWUP_POWER_RE =
  /^(?:а\s+)?(?:если|с\s+опци|без\s+опци|с\s+азот|с\s+подогрев|при\s+включ|при\s+установ)/iu;

function combinedUserText(message, history = []) {
  const recent = (Array.isArray(history) ? history : [])
    .filter((e) => e?.role === "user" && typeof e.content === "string")
    .slice(-2)
    .map((e) => e.content.trim())
    .join(" ");
  return `${recent} ${String(message || "").trim()}`.replace(/\s+/g, " ").trim();
}

function isPowerQuery(text) {
  return /мощност|потребляем|ватт|\bвт\b/i.test(String(text || ""));
}

function isFollowUpPowerQuery(message, history = []) {
  const m = String(message || "").trim();
  if (!FOLLOWUP_POWER_RE.test(m)) {
    return false;
  }
  const recentUser = (Array.isArray(history) ? history : [])
    .filter((e) => e?.role === "user" && typeof e.content === "string")
    .slice(-1)
    .map((e) => e.content.trim())
    .join(" ");
  return isPowerQuery(recentUser) || /режим\s+хранен|хранен/i.test(recentUser);
}

function isShelfLoadQuery(message) {
  const m = String(message || "");
  return /полк|нагрузк/i.test(m) && /масс|вес|кг|выдерж|лимит|грузопод/i.test(m);
}

function isCabinetDimensionQuery(message) {
  const m = String(message || "");
  if (isShelfLoadQuery(m)) {
    return false;
  }
  if (/полк/i.test(m) && /регулир|шаг|между\s+полк|конвекц/i.test(m)) {
    return false;
  }
  return true;
}

function isLocationQuery(message) {
  const m = String(message || "");
  return /где|располож|находится|на\s+корпус|как\s+найти/i.test(m) && /выключ|тумблер|вилк|разъем|разъём/i.test(m);
}

function isVoltageSurgeQuery(message) {
  const m = String(message || "");
  return /перепад|скачок|стабилиз|защит.*напряжен/i.test(m) && /напряжен/i.test(m);
}

function hasPowerOptionsInText(text) {
  const t = String(text || "");
  if (/без\s+опци/i.test(t)) {
    return false;
  }
  return /опци|азот|подогрев/i.test(t);
}

function isPeakOrDualOptionsPowerQuery(message) {
  const m = String(message || "");
  const hasBothOptions = /подогрев/i.test(m) && /азот/i.test(m);
  if (!hasBothOptions) {
    return false;
  }
  return (
    /пиков|максимальн|мощност|потребля|ватт|\bвт\b|энергопотреб|одновременн|сколько\s+(?:ватт|энерг)/i.test(m) ||
    /при\s+включ/i.test(m)
  );
}

function resolvePowerFactKey(message, history = []) {
  const m = String(message || "").trim();
  if (isPeakOrDualOptionsPowerQuery(m)) {
    return "power_storage_options";
  }
  const followUp = isFollowUpPowerQuery(m, history);
  const powerInMessage = isPowerQuery(m);

  if (!powerInMessage && !followUp) {
    return null;
  }

  const modeSource = m;
  const hasRegen = /регенерац/i.test(modeSource);
  const hasStorage = /хранен/i.test(modeSource);
  const hasDrying = /осуш/i.test(modeSource) && !hasStorage;
  const hasOptions = hasPowerOptionsInText(m) || (followUp && hasPowerOptionsInText(m));

  if (hasRegen && (powerInMessage || followUp)) {
    return "power_regeneration";
  }
  if (hasOptions && (hasStorage || followUp || /хранен/i.test(combinedUserText(m, history)))) {
    return "power_storage_options";
  }
  if (hasDrying && powerInMessage) {
    return "power_drying_base";
  }
  if (hasStorage && powerInMessage && !hasOptions) {
    return "power_storage_base";
  }

  if (followUp && hasOptions) {
    return "power_storage_options";
  }

  return null;
}

/**
 * @returns {string|null}
 */
function resolveGoldenFactKey(message, history = []) {
  const match = resolveGoldenFactMatch(message, history);
  return match?.key ?? null;
}

/**
 * @returns {{ key: string, confidence: 'high'|'medium'|'low' }|null}
 */
function resolveGoldenFactMatch(message, history = []) {
  const m = String(message || "").trim();
  if (!m) {
    return null;
  }

  if (/как\s+включ|включить\s+шкаф|включение\s+шкаф/i.test(m)) {
    return { key: "power_on_procedure", confidence: "high" };
  }

  if (/сопротивлен.*заземл|заземляющ.*контур/i.test(m)) {
    return { key: "grounding_resistance", confidence: "high" };
  }

  if (/защитн.*заземл|требу.*заземл|нужн.*заземл|функциональн.*заземл/i.test(m)) {
    return { key: "grounding_required", confidence: "high" };
  }

  if (/частот|\bгц\b/i.test(m) && !/мощност|вт\b/i.test(m) && !isLocationQuery(m)) {
    return { key: "frequency", confidence: "high" };
  }

  if (
    /напряжен|питани|\b220\b.*в/i.test(m) &&
    !/мощност|вт\b/i.test(m) &&
    !isLocationQuery(m) &&
    !isVoltageSurgeQuery(m)
  ) {
    return { key: "power_voltage", confidence: "high" };
  }

  if (
    (/диапазон.*влажност|какой.*влажност|поддержива.*влажност|предельн.*влажност|максимальн.*влажност/i.test(
      m
    ) ||
      (/влажност|%rh|\brh\b/i.test(m) && /предельн|максимальн|поддержива/i.test(m))) &&
    !/шаг/i.test(m) &&
    !/помещен|окружающ/i.test(m)
  ) {
    return { key: "humidity_range", confidence: "high" };
  }

  if (/объем|объём/i.test(m) && /литр|л\b/i.test(m)) {
    return { key: "volume_liters", confidence: "low" };
  }

  const powerKey = resolvePowerFactKey(m, history);
  if (powerKey) {
    return { key: powerKey, confidence: "high" };
  }

  if (/шаг.*влажност|влажност.*шаг|шаг\s+установ/i.test(m)) {
    return { key: "humidity_step", confidence: "high" };
  }

  if (
    /\bip\b|\bип\b|класс\s+защиты|степень\s+защиты|ip65|поражен.*током|электрическ.*ток/i.test(m)
  ) {
    return { key: "ip_protection", confidence: "high" };
  }

  if (/RAL\s*7035|цвет.*покрыт|порошков.*покрыт|ral7035/i.test(m)) {
    return { key: "coat_color", confidence: "high" };
  }

  if (/прозрач|вставк.*двер|стекл.*двер|материал.*(?:двер|встав|окон)|смотров.*ок/i.test(m)) {
    return { key: "door_glass", confidence: "high" };
  }

  if (/температур/i.test(m) && /внутр|рабоч.*объ|камер/i.test(m) && !/окружающ|помещен/i.test(m)) {
    return { key: "chamber_temperature", confidence: "high" };
  }

  if (/поглотител|цеолит|химическ.*вещ.*влаг|влаго.*погло/i.test(m)) {
    return { key: "desiccant_zeolite", confidence: "high" };
  }

  if (/гост|61340/i.test(m) && /антистат|esd|покрыт/i.test(m)) {
    return { key: "esd_gost", confidence: "high" };
  }

  if (
    /взрыво|легковоспламен|горюч.*(?:материал|вещ)/i.test(m) &&
    /хран|использ|можно|допуск/i.test(m)
  ) {
    return { key: "explosive_storage", confidence: "high" };
  }

  if (
    /условия\s+эксплуатац|температур.*окружающ|влажност.*помещен|эксплуатац.*при.*%|90\s*%/i.test(m) &&
    !/внутр.*рабоч|рабоч.*объем/i.test(m)
  ) {
    return { key: "operating_conditions", confidence: "high" };
  }

  if (isShelfLoadQuery(m)) {
    if (/укорочен|вырез|подогрев/i.test(m)) {
      return { key: "shelf_load_cutout", confidence: "high" };
    }
    if (/усилен/i.test(m)) {
      return { key: "shelf_load_reinforced", confidence: "high" };
    }
    if (/выдвиж/i.test(m)) {
      return { key: "shelf_load_drawer", confidence: "high" };
    }
    if (/стандарт/i.test(m) || /одна\s+полк|кажд.*полк/i.test(m)) {
      return { key: "shelf_load_standard", confidence: "high" };
    }
    return { key: "shelf_load_standard", confidence: "medium" };
  }

  if (/габарит|размер.*табл|таблиц[аы]?\s*1\.1/i.test(m) && /1204|1952|772|габарит|размер/i.test(m)) {
    return { key: "dimensions_all", confidence: "high" };
  }

  if (isCabinetDimensionQuery(m)) {
    if (/ширин/i.test(m)) return { key: "width", confidence: "high" };
    if (/высот/i.test(m)) return { key: "height", confidence: "high" };
    if (/глубин/i.test(m)) return { key: "depth", confidence: "high" };
  }

  if (
    (/масс|вес|сколько\s+весит|каков\s+вес|какая\s+масса/i.test(m) ||
      (/масс|вес/i.test(m) && /шкаф|sdb1106/i.test(m))) &&
    isCabinetDimensionQuery(m)
  ) {
    return { key: "mass", confidence: "high" };
  }

  return null;
}

function isHighConfidenceDeterministic(match) {
  if (!match?.key) {
    return false;
  }
  if (match.key === "volume_liters") {
    return false;
  }
  if (match.confidence !== "high") {
    return false;
  }
  return HIGH_CONFIDENCE_KEYS.has(match.key);
}

function rowByKey(key) {
  return GOLDEN_TABLE_11.find((r) => r.key === key) || null;
}

function formatGoldenFactAnswer(factKey) {
  switch (factKey) {
    case "mass": {
      const row = rowByKey("mass");
      return `Масса шкафа **${GOLDEN_MODEL}** в базовой комплектации (табл. 1.1): **${row.value} ${row.unit}**.`;
    }
    case "width":
    case "height":
    case "depth": {
      const row = rowByKey(factKey);
      return `${row.label} шкафа **${GOLDEN_MODEL}** (табл. 1.1): **${row.value} ${row.unit}**.`;
    }
    case "dimensions_all":
      return [
        `Габаритные размеры **${GOLDEN_MODEL}** (табл. 1.1):`,
        "• ширина — **1204 мм**;",
        "• высота — **1952 мм**;",
        "• глубина — **772 мм**;",
        "• масса — **180 кг**.",
      ].join("\n");
    case "power_storage_base":
      return `Потребляемая мощность **${GOLDEN_MODEL}** в режиме «Хранения» без опций (п. 1.1.2.7): не более **${GOLDEN_POWER_W.storageBase} Вт**.`;
    case "power_storage_options":
      return `Потребляемая мощность **${GOLDEN_MODEL}** в режиме «Хранения» при включённых опциях **подачи азота и подогрева воздуха** (п. 1.1.2.7): не более **${GOLDEN_POWER_W.storageOptions} Вт**.`;
    case "power_drying_base":
      return `Потребляемая мощность **${GOLDEN_MODEL}** в режиме «Осушения» без опций (п. 1.1.2.7): не более **${GOLDEN_POWER_W.dryingBase} Вт**.`;
    case "power_regeneration":
      return `Потребляемая мощность **${GOLDEN_MODEL}** в режиме «Регенерации» осушителя (п. 1.1.2.7): не более **${GOLDEN_POWER_W.regeneration} Вт**.`;
    case "ip_protection":
      return `Степень защиты шкафа **${GOLDEN_MODEL}** (п. 1.1.2.11): **${GOLDEN_IP.display}**.`;
    case "humidity_step":
      return `Шаг установки относительной влажности (п. 1.1.2.1–1.1.2.4): **${GOLDEN_HUMIDITY_STEP.value} ${GOLDEN_HUMIDITY_STEP.unit}**.`;
    case "grounding_resistance":
      return `Сопротивление заземляющего контура (п. 2.2.4): не более **4 Ом**.`;
    case "grounding_required":
      return [
        `Шкаф **${GOLDEN_MODEL}** подключается к сети **220 В** с **защитным заземлением** (п. 2.2.4).`,
        "В комплект входит провод **функционального заземления** (п. 1.1.2.8 / табл. 1.2).",
        "Сопротивление заземляющего контура — **не более 4 Ом**.",
      ].join("\n");
    case "frequency":
      return `Частота питающей сети (п. 2.2.4): **50 Гц** (±1 Гц).`;
    case "power_voltage":
      return `Напряжение питающей сети (п. 2.2.4): **220 В**.`;
    case "humidity_range":
      return `Диапазон поддержания относительной влажности внутри рабочего объёма (п. 1.1.2.1–1.1.2.4): **0–80 %RH**, точность **±1 %RH**.`;
    case "coat_color":
      return `Цвет порошкового покрытия корпуса **${GOLDEN_MODEL}** (п. 1.1.2.10): **${GOLDEN_COAT_COLOR.value}**.`;
    case "operating_conditions":
      return [
        `Условия эксплуатации **${GOLDEN_MODEL}** (п. 1.1.2.12):`,
        "• температура окружающего воздуха: **от +15 °C до +35 °C**;",
        "• относительная влажность воздуха в помещении: **не более 80 %**;",
        "• атмосферное давление: **84,0–106,7 кПа**.",
        "",
        "Эксплуатация при **90 % RH** в помещении **не соответствует** п. 1.1.2.12.",
      ].join("\n");
    case "shelf_load_standard":
      return `Суммарная распределённая нагрузка на каждую **стандартную полку** **${GOLDEN_MODEL}** (п. 1.1.2.8): **не более ${GOLDEN_SHELF_LOAD_KG.standard} кг**.`;
    case "shelf_load_reinforced":
      return `Суммарная распределённая нагрузка на каждую **усиленную полку** **${GOLDEN_MODEL}** (п. 1.1.2.8): **не более ${GOLDEN_SHELF_LOAD_KG.reinforced} кг**.`;
    case "shelf_load_cutout":
      return `Нагрузка на **укороченную полку с вырезом** (опция подогрева) **${GOLDEN_MODEL}** (п. 1.1.2.8): **не более ${GOLDEN_SHELF_LOAD_KG.cutoutHeating} кг**.`;
    case "shelf_load_drawer":
      return `Суммарная распределённая нагрузка на каждую **выдвижную полку** **${GOLDEN_MODEL}** (п. 1.1.2.8): **не более ${GOLDEN_SHELF_LOAD_KG.drawer} кг**.`;
    case "power_on_procedure":
      return [
        "Включение шкафа **SDB1106NM** (п. 2.2.4–2.2.5):",
        "1. Проверьте комплектность и напряжение сети **220 В / 50 Гц**.",
        "2. Подключите шнур питания к розетке **220 В**.",
        "3. Переведите **тумблер «ВКЛ»** на кожухе осушителя в положение включения — должна загореться красная индикация.",
      ].join("\n");
    case "door_glass":
      return [
        `В корпус каждой двери **${GOLDEN_MODEL}** встроено **стекло** для обзора рабочего объёма (п. 1.1.4.2).`,
        "Марка или тип стекла (материал вставок) в РЭ **отдельно не указан**.",
      ].join("\n");
    case "chamber_temperature":
      return [
        `В РЭ **${GOLDEN_MODEL}** **не указан** отдельный допустимый диапазон температуры **внутри** рабочего объёма.`,
        "Условия эксплуатации по п. 1.1.2.12: температура **окружающего** воздуха **от +15 °C до +35 °C**.",
      ].join("\n");
    case "desiccant_zeolite":
      return `Поглотитель влаги в карманах осушителя **${GOLDEN_MODEL}** — **цеолит** (п. 1.1.4.2).`;
    case "esd_gost":
      return `Антистатическое покрытие **${GOLDEN_MODEL}** соответствует **GOST IEC 61340-5-1**, **GOST IEC TR 61340-5-2** (п. 1.1.2.9).`;
    case "explosive_storage":
      return [
        `Шкаф **${GOLDEN_MODEL}** **не предназначен** для хранения взрывоопасных, легковоспламеняющихся и иных опасных веществ.`,
        "Изделие предназначено для сухого хранения радиотехнических компонентов в контролируемой влажности (п. 1.1.1).",
        "Использовать шкаф для таких целей **запрещено** — в РЭ нет режима или комплектации для этого.",
      ].join("\n");
    default:
      return null;
  }
}

function isMassOrDimensionsIntent(intent = {}, message = "") {
  const fp = intent.focusParameter;
  const q = String(message || intent.originalQuery || "");
  if (fp === "dimensions" || fp === "load") return true;
  if (/масс|вес|габарит|ширин|высот|глубин/i.test(q)) return true;
  return false;
}

function isProtectionIntent(intent = {}, message = "") {
  const q = String(message || intent.originalQuery || "");
  return intent.focusParameter === "protection" || /\bip\b|класс\s+защиты/i.test(q);
}

function extractKgValues(text) {
  const s = String(text || "").toLowerCase();
  const out = new Set();
  const re = /(\d{2,4})\s*кг/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    out.add(m[1]);
  }
  return [...out];
}

function extractMmTriplet(text) {
  const s = String(text || "");
  return {
    has1204: /1204\s*мм/i.test(s),
    has1952: /1952\s*мм/i.test(s),
    has772: /772\s*мм/i.test(s),
    hasWrongMass: FORBIDDEN_ALIEN_MASS_KG.some((kg) => new RegExp(`\\b${kg}\\s*кг`, "i").test(s)),
  };
}

/**
 * Hard-check: ответ не соответствует golden table 1.1 для SDB1106NM.
 */
function goldenNumericMismatchFailures(answer, intent = {}, message = "") {
  const a = String(answer || "");
  if (!a.trim() || /информац(?:ия|ии)\s+.*отсутств|не\s+указан/i.test(a)) {
    return [];
  }

  const q = String(message || intent.originalQuery || "");
  const failures = [];
  const factKey = resolveGoldenFactKey(q);

  if (
    (factKey === "mass" || (isMassOrDimensionsIntent(intent, q) && /масс|вес/i.test(q))) &&
    !isShelfLoadQuery(q)
  ) {
    const kgs = extractKgValues(a);
    const has180 = kgs.includes("180") || /\b180\s*кг/i.test(a);
    const alien = kgs.filter((kg) => FORBIDDEN_ALIEN_MASS_KG.includes(kg));
    if (alien.length > 0 || (kgs.length > 0 && !has180)) {
      failures.push({
        code: "golden_numeric_mismatch",
        severity: "fail",
        detail: "wrong_mass_for_sdb1106nm",
        expected: "180 кг",
        found: kgs.join(", ") || "none",
      });
    }
  }

  if (factKey === "width" && !/1204\s*мм/i.test(a)) {
    failures.push({ code: "golden_numeric_mismatch", severity: "fail", detail: "wrong_width", expected: "1204 мм" });
  }
  if (factKey === "height" && !/1952\s*мм/i.test(a)) {
    failures.push({ code: "golden_numeric_mismatch", severity: "fail", detail: "wrong_height", expected: "1952 мм" });
  }
  if (factKey === "depth" && !/772\s*мм/i.test(a)) {
    failures.push({ code: "golden_numeric_mismatch", severity: "fail", detail: "wrong_depth", expected: "772 мм" });
  }

  if (factKey === "dimensions_all") {
    const mm = extractMmTriplet(a);
    if (!mm.has1204 || !mm.has1952 || !mm.has772 || mm.hasWrongMass) {
      failures.push({
        code: "golden_numeric_mismatch",
        severity: "fail",
        detail: "wrong_dimensions_table_11",
        expected: "1204×1952×772 мм, 180 кг",
      });
    }
  }

  if (factKey === "power_storage_base" && !/\b8\s*вт/i.test(a)) {
    failures.push({ code: "golden_numeric_mismatch", severity: "fail", detail: "wrong_power_storage_base", expected: "8 Вт" });
  }
  if (factKey === "power_storage_options" && !/\b810\s*вт/i.test(a)) {
    failures.push({ code: "golden_numeric_mismatch", severity: "fail", detail: "wrong_power_storage_options", expected: "810 Вт" });
  }
  if (factKey === "power_drying_base" && !/\b40\s*вт/i.test(a)) {
    failures.push({ code: "golden_numeric_mismatch", severity: "fail", detail: "wrong_power_drying", expected: "40 Вт" });
  }
  if (factKey === "power_regeneration" && !/\b540\s*вт/i.test(a)) {
    failures.push({ code: "golden_numeric_mismatch", severity: "fail", detail: "wrong_power_regen", expected: "540 Вт" });
  }

  if (factKey === "ip_protection" || isProtectionIntent(intent, q)) {
    if (!/\bip\s*65\b/i.test(a)) {
      failures.push({ code: "golden_numeric_mismatch", severity: "fail", detail: "wrong_ip_class", expected: "IP65" });
    }
  }

  if (factKey === "humidity_step" && !/0[,.]1\s*(?:%rh|rh)/i.test(a) && !/шаг[\p{L}\s]{0,20}0[,.]1/iu.test(a)) {
    failures.push({ code: "golden_numeric_mismatch", severity: "fail", detail: "wrong_humidity_step", expected: "0,1 %RH" });
  }

  if (factKey === "shelf_load_standard" && !/\b50\s*кг/i.test(a)) {
    failures.push({ code: "golden_numeric_mismatch", severity: "fail", detail: "wrong_shelf_load_standard", expected: "50 кг" });
  }

  return failures;
}

function shouldInjectTable11(query, routerDecision = {}) {
  const q = String(query || "");
  if (routerDecision?.focusParameter === "dimensions" || routerDecision?.focusParameter === "load") {
    return true;
  }
  if (
    /масс|габарит|ширин|высот|глубин|таблиц[аы]?\s*1\.1|1\.1\.2\.8|\bвес\b|сколько\s+весит|каков\s+вес|масса\s+шкафа/i.test(
      q
    )
  ) {
    return true;
  }
  if (isShelfLoadQuery(q)) {
    return true;
  }
  const k = resolveGoldenFactKey(q);
  if (k && ["mass", "width", "height", "depth", "dimensions_all"].includes(k)) {
    return true;
  }
  return false;
}

/** Inject P1 golden markdown chunks (мощность 810, цеолит, GOST, стекло, колёса…). */
function shouldInjectP1GoldenFacts(query, routerDecision = {}) {
  const q = String(query || "");
  if (shouldInjectTable11(q, routerDecision)) {
    return false;
  }
  if (isPeakOrDualOptionsPowerQuery(q)) {
    return true;
  }
  if (/цеолит|поглотител|адсорбент/i.test(q)) {
    return true;
  }
  if (/gost|гоуст|61340|антистат.*покрыт/i.test(q)) {
    return true;
  }
  if (/стекл|прозрач|вставк/i.test(q) && /двер|окон|смотров/i.test(q)) {
    return true;
  }
  if (/колес|колёс|дооснаст/i.test(q)) {
    return true;
  }
  if (/поражен.*током|класс\s+защиты|степень\s+защиты|\bip\b/i.test(q)) {
    return true;
  }
  if (/условия\s+эксплуатац|90\s*%|помещен/i.test(q) && /влажност|температур/i.test(q)) {
    return true;
  }
  if (/регенерац/i.test(q) && /услов|актив|когда|часто/i.test(q)) {
    return true;
  }
  return false;
}

module.exports = {
  GOLDEN_MODEL,
  GOLDEN_TABLE_11,
  GOLDEN_IP,
  GOLDEN_COAT_COLOR,
  GOLDEN_HUMIDITY_STEP,
  GOLDEN_POWER_W,
  GOLDEN_SHELF_LOAD_KG,
  FORBIDDEN_ALIEN_MASS_KG,
  combinedUserText,
  resolveGoldenFactKey,
  resolveGoldenFactMatch,
  isHighConfidenceDeterministic,
  formatGoldenFactAnswer,
  goldenNumericMismatchFailures,
  shouldInjectTable11,
  shouldInjectP1GoldenFacts,
  rowByKey,
  isShelfLoadQuery,
};
