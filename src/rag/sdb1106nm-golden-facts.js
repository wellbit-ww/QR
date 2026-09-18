/**
 * Эталонные ТТХ SDB1106NM — единый источник для deterministic, validation, chunking.
 */

const {
  normalizeRuleText,
  mergeUserContext,
  hasTerm,
  isShelfLoadQuery,
  isKitShelfCountQuery,
  isLocationSwitchQuery,
  isVoltageSurgeQuery,
  isNitrogenSupplyContext,
  isDesiccantIdentityQuery,
  isCabinetBodyMaterialQuery,
  isChamberTemperatureRangeQuery,
  isHeatingAirTemperatureQuery,
  isLowAmbientOperatingQuery,
  isAtmosphericPressureQuery,
  isHumidityIncreaseForbiddenQuery,
  isClimaticExecutionQuery,
  isMainPowerSwitchLocationQuery,
  isShelfConvectionSpacingQuery,
  isPowerCordLengthQuery,
  isRegenModeOverviewQuery,
  isRegenActivationQuery,
  isRegenDurationQuery,
  isHeatingOptionMountQuery,
  isNitrogenConnectQuery,
  isNitrogenConcentrationControlQuery,
  isNitrogenRotameterSetupQuery,
  isNitrogenOptionDimensionsQuery,
  isWindowCleaningQuery,
  isEsdBraceletQuery,
  isDryStorageSoftwareQuery,
  isTricolorIndicatorQuery,
  isPanelIndicatorColorsQuery,
  isPanelYellowIndicatorQuery,
  isPanelRedIndicatorQuery,
  isPanelGreenIndicatorQuery,
  isExternalInspectionProcedureQuery,
  isDamperRelatedQuery,
  isBasicKitSupplyQuery,
  isDocumentPocketQuery,
  isDesiccatorKitCountQuery,
  isLockKeysKitQuery,
  isShelfMaterialQuery,
  isLoadingWallClearanceQuery,
  isLoadingRulesQuery,
  isRhSetpointDefinitionsQuery,
  isHumidityTimeToSetpointQuery,
  isEthernetCommissioningQuery,
  isHumidityCalibrationQuery,
  isLightingOptionQuery,
  isWarrantyTermQuery,
  isDoorOpenBehaviorQuery,
  isTotalShelfLoadQuery,
  isDesiccantReplaceProcedureQuery,
  isDryingModeAfterPowerOnQuery,
  isHumidityMenuProcedureQuery,
  isDoorSoundFaultQuery,
  isKitWheelsFeetQuery,
  isWheelsUpgradeQuery,
  isCabinetWeldedConstructionQuery,
  isDoorMagneticSealsQuery,
  isDoorSensorPurposeQuery,
  isNitrogenTimerRangeQuery,
  isEthernetFaultQuery,
  isBrokenDoorGlassQuery,
  isContactSupportQuery,
  isFirstStartupGuideQuery,
  isFirstStartupFullQuery,
  isMaintenanceScheduleQuery,
  isMaintenanceAnnualQuery,
  isFaultHumidityTable32Query,
  isIntermittentSoundMeaningQuery,
} = require("./sdb1106nm-query-variants");
const { isEmergencySmokeQuery } = require("./safety-query-scope");
const { resolveSerialNumberAnswer, isEquipmentSerialNumberQuery } = require("./equipment-serial-number-scope");
const {
  isUnsupportedReplacementQuery,
  buildUnsupportedReplacementAnswer,
} = require("./unsupported-replacement-scope");
const {
  isHumidityNotDroppingQuery,
  isHumiditySpikeQuery,
  buildHumidityNotDroppingAnswer,
  buildHumiditySpikeAnswer,
} = require("./troubleshooting-scope");

const combinedUserText = mergeUserContext;

function isLocationQuery(message) {
  return isLocationSwitchQuery(message);
}

const GOLDEN_MODEL = "SDB1106NM";

const GOLDEN_TABLE_11 = Object.freeze([
  { key: "width", label: "Ширина", value: "1204", unit: "мм" },
  { key: "height", label: "Высота", value: "1952", unit: "мм" },
  { key: "depth", label: "Глубина", value: "772", unit: "мм" },
  { key: "mass", label: "Масса", value: "180", unit: "кг" },
]);

const GOLDEN_IP = Object.freeze({ value: "55", display: "IP55" });
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
  "power_storage_single_option",
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
  "drying_mode_after_power_on",
  "door_glass",
  "broken_door_glass",
  "unsupported_replacement",
  "cabinet_body_material",
  "chamber_temperature",
  "desiccant_zeolite",
  "esd_gost",
  "explosive_storage",
  "inspection_power_off",
  "regen_cycle_duration",
  "maintenance_desiccant_replace",
  "service_life",
  "mtbf_hours",
  "nitrogen_connect",
  "nitrogen_rotameter_setup",
  "nitrogen_concentration_control",
  "nitrogen_pressure_max",
  "door_sound_signal",
  "door_sound_check",
  "desiccant_drying_process",
  "sensor_brand_unknown",
  "kit_shelf_count",
  "nitrogen_shelf_count",
  "shelf_convection_spacing",
  "heating_air_max_temp",
  "main_power_switch_location",
  "climatic_execution_uhl",
  "humidity_increase_forbidden",
  "power_cord_length",
  "esd_bracelet_kit",
  "regen_mode_overview",
  "regen_activation_conditions",
  "heating_option_mount",
  "nitrogen_option_dimensions",
  "window_cleaning_alcohol",
  "voltage_surge_not_specified",
  "kit_dry_storage",
  "kit_tricolor_indicator",
  "panel_indicator_yellow",
  "panel_indicator_red",
  "panel_indicator_green",
  "panel_indicator_meanings",
  "external_inspection_222",
  "humidity_spike_troubleshooting",
  "kit_basic_supply",
  "kit_document_pocket",
  "kit_desiccator_count",
  "kit_lock_keys",
  "loading_wall_clearance",
  "loading_rules_21",
  "rh_setpoint_definitions",
  "humidity_time_to_setpoint",
  "ethernet_commissioning",
  "humidity_calibration_unknown",
  "lighting_option_unknown",
  "warranty_storage_term",
  "door_open_behavior",
  "total_shelf_load_info",
  "desiccant_replace_procedure",
  "humidity_menu_procedure",
  "door_sound_fault",
  "kit_wheels_feet",
  "wheels_upgrade_not_available",
  "door_magnetic_seals",
  "door_sensor_purpose",
  "nitrogen_timer_range",
  "ethernet_fault_table32",
  "first_startup_guide",
  "first_startup_full",
  "emergency_smoke",
  "maintenance_schedule",
  "maintenance_annual",
  "fault_humidity_table32",
  "humidity_not_dropping",
  "contact_support",
]);

const FOLLOWUP_POWER_RE =
  /^(?:а\s+)?(?:если|с\s+опци|без\s+опци|с\s+азот|с\s+подогрев|при\s+включ|при\s+установ)/iu;

function isPowerQuery(text) {
  return hasTerm(text, "power");
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

function isCabinetDimensionQuery(message) {
  const m = String(message || "");
  if (isShelfLoadQuery(m)) {
    return false;
  }
  if (isPowerCordLengthQuery(m)) {
    return false;
  }
  if (isExternalInspectionProcedureQuery(m)) {
    return false;
  }
  // «Внешняя ширина/габариты» — валидный вопрос по табл. 1.1.
  // Исключаем только собственно внешний (визуальный) осмотр.
  if (/(?:осмотр|визуальн)/i.test(m)) {
    return false;
  }
  if (hasTerm(m, "shelf") && /регулир|шаг|между\s+полк|конвекц/i.test(m)) {
    return false;
  }
  return true;
}

function countRequestedDimensionSignals(message) {
  const m = String(message || "");
  const signals = [
    /ширин/i.test(m),
    /высот/i.test(m),
    /глубин|длин(?!а\s+волны)/i.test(m),
    /масс|вес|сколько\s+весит|каков\s+вес|какая\s+масса|насколько\s+тяж[её]л/i.test(m),
  ];
  return signals.filter(Boolean).length;
}

function hasPowerOptionsInText(text) {
  const raw = String(text || "");
  if (
    /без\s+(?:всяк\S*\s+|дополнительн\S*\s+)?опци/iu.test(raw) ||
    (/(?:азот|подогрев)/iu.test(raw) &&
      /выключен|отключен/iu.test(raw) &&
      !/(?:включен|включён)/iu.test(raw))
  ) {
    return false;
  }
  if (
    /только\s+(?:с\s+)?подогрев|только\s+(?:с\s+)?азот|подогрев\s+без\s+азот|азот\s+без\s+подогрев|без\s+азот(?:а)?\s+.*подогрев|без\s+подогрева?\s+.*азот/iu.test(
      raw
    )
  ) {
    return false;
  }
  const azotOff = /без\s+азот/i.test(raw);
  const heatOff = /без\s+подогрев/i.test(raw);
  const hasAzot = /азот/i.test(raw) && !azotOff;
  const hasHeat = /подогрев/i.test(raw) && !heatOff;
  if (/\b810\s*вт/i.test(raw) && /хранен/i.test(raw)) {
    return true;
  }
  if (hasAzot && hasHeat) {
    return true;
  }
  if (/пиков|все\s+опци|обе\s+опци|одновременн\w*\s+(?:включ|работ)/iu.test(raw) && hasAzot && hasHeat) {
    return true;
  }
  const t = raw
    .replace(/без\s+азота?(?:\s+и\s+подогрева?)?/giu, "")
    .replace(/без\s+подогрева?(?:\s+и\s+азота?)?/giu, "")
    .replace(/без\s+всяк\S*\s+опци\w*/giu, "")
    .replace(/без\s+дополнительн\S*\s+опци\w*/giu, "")
    .replace(/без\s+опци\w*/giu, "")
    .replace(/\([^)]*(?:азот|подогрев)[^)]*(?:выключен|отключен)[^)]*\)/giu, "");
  if (
    /опци/i.test(t) &&
    /хранен/i.test(raw) &&
    /(?:включ\S*\s+опци|с\s+(?:дополнительн\w*\s+)?опци|при\s+опци)/iu.test(raw)
  ) {
    return true;
  }
  if (/опци/i.test(t)) {
    return /азот/i.test(t) && /подогрев/i.test(t);
  }
  return false;
}

function isPowerVoltageQuery(message) {
  const m = String(message || "");
  if (isNitrogenSupplyContext(m)) {
    return false;
  }
  return (
    /напряжен|питани|\b220\b.*в/i.test(m) &&
    !/мощност|вт\b/i.test(m) &&
    !isLocationQuery(m) &&
    !isVoltageSurgeQuery(m)
  );
}


function parseDistributedShelfLoad(message, factKey) {
  const m = String(message || "");
  const totalMatch = m.match(/(\d+)\s*(?:кг|килограм)/i);
  if (!totalMatch) {
    return null;
  }
  const total = Number(totalMatch[1]);
  let shelfCount = null;
  if (/по\s+двум|на\s+двух|дв(?:ух|ум|е)\s+(?:усилен|стандарт|выдвиж|укороч|полк)|\b2\s+(?:усилен|стандарт|выдвиж|укороч|полк)/i.test(m)) {
    shelfCount = 2;
  } else if (/по\s+тр[её]м|на\s+тр[её]х|тр[её](?:х|м|и)\s+(?:усилен|стандарт|выдвиж|укороч|полк)|\b3\s+(?:усилен|стандарт|выдвиж|укороч|полк)/i.test(m)) {
    shelfCount = 3;
  } else {
    const countMatch = m.match(
      /(?:по|на)\s+(\d+)\s+(?:усиленн|стандартн|выдвижн|укороченн)?\s*полк/i
    );
    if (countMatch) {
      shelfCount = Number(countMatch[1]);
    }
  }
  if (!shelfCount || shelfCount < 1) {
    return null;
  }
  const limits = {
    shelf_load_reinforced: GOLDEN_SHELF_LOAD_KG.reinforced,
    shelf_load_standard: GOLDEN_SHELF_LOAD_KG.standard,
    shelf_load_drawer: GOLDEN_SHELF_LOAD_KG.drawer,
    shelf_load_cutout: GOLDEN_SHELF_LOAD_KG.cutoutHeating,
  };
  const limit = limits[factKey];
  if (!limit) {
    return null;
  }
  const perShelf = total / shelfCount;
  if (perShelf <= limit) {
    return `При равномерной загрузке **${total} кг** на **${shelfCount}** полки — **${perShelf} кг** на каждую; лимит **${limit} кг** **не превышен** — **нагрузку шкаф выдержит**.`;
  }
  return `При **${perShelf} кг** на полку (из **${total} кг** на **${shelfCount}** полки) лимит **${limit} кг** **превышен** — такую загрузку **нельзя** допускать.`;
}

function hasBothPowerOptionsExplicitlyOff(message) {
  const m = String(message || "");
  if (/без\s+(?:всяк\S*\s+)?(?:дополнительн\S*\s+)?опци\w*/iu.test(m)) {
    return true;
  }
  if (/без\s+азот\p{L}*\s+и\s+подогрев\p{L}*|без\s+подогрев\p{L}*\s+и\s+азот\p{L}*/iu.test(m)) {
    return true;
  }
  const azotOff = /без\s+азот|азот\s+(?:выключен|отключен)/iu.test(m);
  const heatOff = /без\s+подогрев|подогрев\s+(?:выключен|отключен)/iu.test(m);
  return azotOff && heatOff;
}

function isPowerStorageSingleOptionQuery(message) {
  const m = String(message || "");
  if (!/хранен/i.test(m)) {
    return false;
  }
  if (!isPowerQuery(m) && !/мощност|потребля|ватт|\bвт\b/i.test(m)) {
    return false;
  }
  if (hasBothPowerOptionsExplicitlyOff(m)) {
    return false;
  }
  if (
    /только/i.test(m) &&
    /подогрев/i.test(m) &&
    /азот/i.test(m) &&
    /(?:\/|или|,\s*только|и\s+только)/iu.test(m)
  ) {
    return true;
  }
  if (
    /только\s+(?:с\s+)?(?:подогрев|азот)|подогрев\s+без\s+азот|азот\s+без\s+подогрев|без\s+подач[ие]\s+азот|подогрев\s+(?:выключен|отключен)|азот\s+(?:выключен|отключен)/iu.test(
      m
    )
  ) {
    return true;
  }
  const azotOff = /без\s+азот|азот\s+(?:выключен|отключен)/iu.test(m);
  const heatOff = /без\s+подогрев|подогрев\s+(?:выключен|отключен)/iu.test(m);
  const hasAzot = /азот/i.test(m) && !azotOff;
  const hasHeat = /подогрев/i.test(m) && !heatOff;
  if (hasAzot && hasHeat) {
    return false;
  }
  return (hasHeat || hasAzot) && /мощност|потребля|ватт|\bвт\b/i.test(m);
}

function isPeakOrDualOptionsPowerQuery(message) {
  const m = String(message || "");
  if (!hasPowerOptionsInText(m)) {
    return false;
  }
  if (/без\s+(?:всяк\S*\s+)?(?:опци|азот|подогрев)/i.test(m)) {
    return false;
  }
  const hasBothOptions =
    /подогрев/i.test(m) &&
    /азот/i.test(m) &&
    !/(?:выключен|отключен)/iu.test(m);
  if (!hasBothOptions) {
    return false;
  }
  return (
    /пиков|максимальн|мощност|потребля|ватт|(?<=\d)\s*вт|энергопотреб|одновременн|сколько\s+(?:ватт|энерг)/i.test(m) ||
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
  if (
    isPowerStorageSingleOptionQuery(m) ||
    (followUp && isPowerStorageSingleOptionQuery(combinedUserText(m, history)))
  ) {
    return "power_storage_single_option";
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
  const m = normalizeRuleText(message);
  if (!m) {
    return null;
  }

  if (isEmergencySmokeQuery(m)) {
    return { key: "emergency_smoke", confidence: "high" };
  }

  if (isContactSupportQuery(m)) {
    return { key: "contact_support", confidence: "high" };
  }

  if (isBrokenDoorGlassQuery(m, history) || isUnsupportedReplacementQuery(m, history)) {
    return { key: "unsupported_replacement", confidence: "high" };
  }

  if (isEquipmentSerialNumberQuery(m)) {
    return { key: "equipment_serial_number", confidence: "high" };
  }

  if (isDryingModeAfterPowerOnQuery(m)) {
    return { key: "drying_mode_after_power_on", confidence: "high" };
  }

  if (isFirstStartupFullQuery(m)) {
    return { key: "first_startup_full", confidence: "high" };
  }

  if (isFirstStartupGuideQuery(m)) {
    return { key: "first_startup_guide", confidence: "high" };
  }

  if (isFaultHumidityTable32Query(m)) {
    return { key: "fault_humidity_table32", confidence: "high" };
  }

  if (isHumidityNotDroppingQuery(m)) {
    return { key: "humidity_not_dropping", confidence: "high" };
  }

  // Высокая влажность в помещении — вопрос об условиях эксплуатации,
  // а не симптом скачка RH внутри шкафа.
  if (
    isHumiditySpikeQuery(m) &&
    !(/помещен|окружающ/i.test(m) && /эксплуатац|допуск|можно|штатн|соответств/i.test(m))
  ) {
    return { key: "humidity_spike_troubleshooting", confidence: "high" };
  }

  if (isEthernetFaultQuery(m)) {
    return { key: "ethernet_fault_table32", confidence: "high" };
  }

  if (isMaintenanceAnnualQuery(m)) {
    return { key: "maintenance_annual", confidence: "high" };
  }

  if (isMaintenanceScheduleQuery(m)) {
    return { key: "maintenance_schedule", confidence: "high" };
  }

  if (isNitrogenTimerRangeQuery(m)) {
    return { key: "nitrogen_timer_range", confidence: "high" };
  }

  if (isIntermittentSoundMeaningQuery(m)) {
    return { key: "door_sound_signal", confidence: "high" };
  }

  if (isKitWheelsFeetQuery(m)) {
    return { key: "kit_wheels_feet", confidence: "high" };
  }

  if (isWheelsUpgradeQuery(m)) {
    return { key: "wheels_upgrade_not_available", confidence: "high" };
  }

  if (isDoorMagneticSealsQuery(m)) {
    return { key: "door_magnetic_seals", confidence: "high" };
  }

  if (isDoorSensorPurposeQuery(m)) {
    return { key: "door_sensor_purpose", confidence: "high" };
  }

  if (isCabinetWeldedConstructionQuery(m)) {
    return { key: "cabinet_body_material", confidence: "high" };
  }

  if (hasTerm(m, "powerOn")) {
    return { key: "power_on_procedure", confidence: "high" };
  }

  if (isPowerCordLengthQuery(m)) {
    return { key: "power_cord_length", confidence: "high" };
  }

  if (isEthernetCommissioningQuery(m)) {
    return { key: "ethernet_commissioning", confidence: "high" };
  }

  if (isHumidityMenuProcedureQuery(m)) {
    return { key: "humidity_menu_procedure", confidence: "high" };
  }

  if (isMainPowerSwitchLocationQuery(m)) {
    return { key: "main_power_switch_location", confidence: "high" };
  }

  if (isClimaticExecutionQuery(m)) {
    return { key: "climatic_execution_uhl", confidence: "high" };
  }

  if (
    (hasTerm(m, "inspection") && hasTerm(m, "powerOff")) ||
    (/заземл|кабел.*питан|кабель\s+пит/i.test(m) &&
      hasTerm(m, "inspection") &&
      /можно|нужно|должен|при\s+включ|включен|под\s+напряжен/i.test(m))
  ) {
    return { key: "inspection_power_off", confidence: "high" };
  }

  if (isExternalInspectionProcedureQuery(m)) {
    return { key: "external_inspection_222", confidence: "high" };
  }

  if (hasTerm(m, "sensor") && hasTerm(m, "sensorBrand")) {
    return { key: "sensor_brand_unknown", confidence: "high" };
  }

  if (isDoorSoundFaultQuery(m)) {
    return { key: "door_sound_fault", confidence: "high" };
  }

  if (isDoorOpenBehaviorQuery(m)) {
    return { key: "door_open_behavior", confidence: "high" };
  }

  if (isDamperRelatedQuery(m)) {
    return { key: "regen_mode_overview", confidence: "high" };
  }

  if (isRegenModeOverviewQuery(m)) {
    return { key: "regen_mode_overview", confidence: "high" };
  }

  if (isRegenActivationQuery(m)) {
    return { key: "regen_activation_conditions", confidence: "high" };
  }

  if (isRegenDurationQuery(m)) {
    return { key: "regen_cycle_duration", confidence: "high" };
  }

  if (isDesiccantReplaceProcedureQuery(m)) {
    return { key: "desiccant_replace_procedure", confidence: "high" };
  }

  if (
    (/замен|меня|ресурс|обслужив|частот|регламент|интервал|\bто\b/i.test(m) ||
      /часов|тысяч\s+час|как\s+часто/i.test(m)) &&
    /цеолит|осушител|блок.*осуш/i.test(m)
  ) {
    return { key: "maintenance_desiccant_replace", confidence: "high" };
  }

  if (
    /средн\w*\s+врем\w*\s+наработк\w*.*отказ|наработк\w*.*отказ|mtbf|mttf|17520|17\s*520/i.test(m) &&
    (/шкаф|sdb1106|издел/i.test(m) || /наработк\w*.*отказ|mtbf|mttf/i.test(m))
  ) {
    return { key: "mtbf_hours", confidence: "high" };
  }

  if (isWarrantyTermQuery(m)) {
    return { key: "warranty_storage_term", confidence: "high" };
  }

  if (
    /средн\w*\s+срок\s+служб|срок\s+служб|назначенн\w*\s+срок/i.test(m) &&
    /шкаф|sdb1106|издел/i.test(m) &&
    !/цеолит|осушител|блок.*осуш|гарантийн/i.test(m)
  ) {
    return { key: "service_life", confidence: "high" };
  }

  if (isNitrogenConnectQuery(m)) {
    return { key: "nitrogen_connect", confidence: "high" };
  }

  if (isNitrogenRotameterSetupQuery(m)) {
    return { key: "nitrogen_rotameter_setup", confidence: "high" };
  }

  if (isNitrogenConcentrationControlQuery(m)) {
    return { key: "nitrogen_concentration_control", confidence: "high" };
  }

  if (hasTerm(m, "nitrogen") && hasTerm(m, "nitrogenPressure")) {
    return { key: "nitrogen_pressure_max", confidence: "high" };
  }

  if (
    hasTerm(m, "doorSound") &&
    /как\s+(?:проверить|убедиться)|проверка|работоспособност|проверить\s+работ|убедиться.*работ/i.test(m) &&
    !/постоянн.*без|без\s+открыт/i.test(m) &&
    !isDoorSoundFaultQuery(m)
  ) {
    return { key: "door_sound_check", confidence: "high" };
  }

  if (
    (hasTerm(m, "doorSound") && hasTerm(m, "door")) ||
    (hasTerm(m, "doorSound") && hasTerm(m, "cabinet"))
  ) {
    return { key: "door_sound_signal", confidence: "high" };
  }

  if (
    /жидк|как\s+(?:именно\s+)?осуш|метод\s+осуш|происходит\s+осуш|химическ.*осуш/i.test(m) &&
    /осуш|влаж/i.test(m)
  ) {
    return { key: "desiccant_drying_process", confidence: "high" };
  }

  if (/сопротивлен.*заземл|заземляющ.*контур/i.test(m)) {
    return { key: "grounding_resistance", confidence: "high" };
  }

  if (/защитн.*заземл|требу.*заземл|нужн.*заземл|функциональн.*заземл/i.test(m) && !/осмотр|визуальн/i.test(m)) {
    return { key: "grounding_required", confidence: "high" };
  }

  if (/частот|\bгц\b/i.test(m) && !/мощност|вт\b/i.test(m) && !isLocationQuery(m)) {
    return { key: "frequency", confidence: "high" };
  }

  if (isVoltageSurgeQuery(m)) {
    return { key: "voltage_surge_not_specified", confidence: "high" };
  }

  if (
    hasTerm(m, "voltage") &&
    !hasTerm(m, "power") &&
    !isLocationQuery(m) &&
    !isVoltageSurgeQuery(m) &&
    !isNitrogenSupplyContext(m) &&
    !(hasTerm(m, "inspection") && /включ|питан/i.test(m))
  ) {
    return { key: "power_voltage", confidence: "high" };
  }

  if (isRhSetpointDefinitionsQuery(m)) {
    return { key: "rh_setpoint_definitions", confidence: "high" };
  }

  if (isHumidityTimeToSetpointQuery(m)) {
    return { key: "humidity_time_to_setpoint", confidence: "high" };
  }

  if (isHumidityCalibrationQuery(m)) {
    return { key: "humidity_calibration_unknown", confidence: "high" };
  }

  if (
    hasTerm(m, "humidityLimit") ||
    (hasTerm(m, "humidity") && /диапазон/i.test(m))
  ) {
    if (!/шаг/i.test(m) && !hasTerm(m, "ambientTemp") && !/помещен|окружающ/i.test(m)) {
      return { key: "humidity_range", confidence: "high" };
    }
  }

  if (/объем|объём/i.test(m) && /литр|л\b/i.test(m)) {
    return { key: "volume_liters", confidence: "low" };
  }

  const powerKey = resolvePowerFactKey(m, history);
  if (powerKey) {
    return { key: powerKey, confidence: "high" };
  }

  if (hasTerm(m, "humidityStep")) {
    return { key: "humidity_step", confidence: "high" };
  }

  if (isHeatingOptionMountQuery(m)) {
    return { key: "heating_option_mount", confidence: "high" };
  }

  if (isHeatingAirTemperatureQuery(m)) {
    return { key: "heating_air_max_temp", confidence: "high" };
  }

  if (
    /\bip\b|\bип\b|класс\s+защиты|степень\s+защиты|ip65|поражен.*током|электрическ.*ток/i.test(m)
  ) {
    return { key: "ip_protection", confidence: "high" };
  }

  if (hasTerm(m, "coat")) {
    return { key: "coat_color", confidence: "high" };
  }

  if (isWindowCleaningQuery(m)) {
    return { key: "window_cleaning_alcohol", confidence: "high" };
  }

  if (isLightingOptionQuery(m)) {
    return { key: "lighting_option_unknown", confidence: "high" };
  }

  if (isCabinetBodyMaterialQuery(m) || isShelfMaterialQuery(m)) {
    return { key: "cabinet_body_material", confidence: "high" };
  }

  if (/прозрач|вставк.*двер|стекл.*двер|материал.*(?:встав|окон)|смотров.*ок/i.test(m)) {
    return { key: "door_glass", confidence: "high" };
  }

  if (isCabinetBodyMaterialQuery(m)) {
    return { key: "cabinet_body_material", confidence: "high" };
  }

  if (isChamberTemperatureRangeQuery(m)) {
    return { key: "chamber_temperature", confidence: "high" };
  }

  if (isDesiccantIdentityQuery(m)) {
    return { key: "desiccant_zeolite", confidence: "high" };
  }

  if (isHumidityIncreaseForbiddenQuery(m)) {
    return { key: "humidity_increase_forbidden", confidence: "high" };
  }

  if (isEsdBraceletQuery(m)) {
    return { key: "esd_bracelet_kit", confidence: "high" };
  }

  if (hasTerm(m, "esd") && hasTerm(m, "esdCoat") && !/браслет/iu.test(m)) {
    return { key: "esd_gost", confidence: "high" };
  }

  if (
    /(?:взрыво|(?:легко)?воспламен|горюч|растворител|спирт)/i.test(m) &&
    /(?:хран|остав|можно|допуск|использ|на\s+ночь)/i.test(m)
  ) {
    return { key: "explosive_storage", confidence: "high" };
  }

  if (isTotalShelfLoadQuery(m)) {
    return { key: "total_shelf_load_info", confidence: "high" };
  }

  if (isShelfLoadQuery(m)) {
    if (hasTerm(m, "cutout")) {
      return { key: "shelf_load_cutout", confidence: "high" };
    }
    if (hasTerm(m, "reinforced")) {
      return { key: "shelf_load_reinforced", confidence: "high" };
    }
    if (hasTerm(m, "drawer")) {
      return { key: "shelf_load_drawer", confidence: "high" };
    }
    if (hasTerm(m, "standard") || /одна\s+полк|кажд.*полк|обычн.*полк/i.test(m)) {
      return { key: "shelf_load_standard", confidence: "high" };
    }
    return { key: "shelf_load_standard", confidence: "medium" };
  }

  if (
    isAtmosphericPressureQuery(m) ||
    hasTerm(m, "ambientTemp") ||
    isLowAmbientOperatingQuery(m) ||
    (hasTerm(m, "humidity") &&
      /помещен|окружающ/i.test(m) &&
      /эксплуатац|допуск|можно|штатн|соответств/i.test(m))
  ) {
    if (isChamberTemperatureRangeQuery(m)) {
      return null;
    }
    return { key: "operating_conditions", confidence: "high" };
  }

  if (
    hasTerm(m, "nitrogen") &&
    /пол(?:к|ок)|количеств|доступн.*пол(?:к|ок)|числ[оа]\s+полок/i.test(m) &&
    /влияет|измен|уменьш|увелич|меньш|больш/i.test(m)
  ) {
    return { key: "nitrogen_shelf_count", confidence: "high" };
  }

  if (isDryStorageSoftwareQuery(m)) {
    return { key: "kit_dry_storage", confidence: "high" };
  }

  if (isTricolorIndicatorQuery(m)) {
    return { key: "kit_tricolor_indicator", confidence: "high" };
  }

  if (isPanelIndicatorColorsQuery(m)) {
    return { key: "panel_indicator_meanings", confidence: "high" };
  }

  if (isPanelYellowIndicatorQuery(m)) {
    return { key: "panel_indicator_yellow", confidence: "high" };
  }

  if (isPanelRedIndicatorQuery(m)) {
    return { key: "panel_indicator_red", confidence: "high" };
  }

  if (isPanelGreenIndicatorQuery(m, history)) {
    return { key: "panel_indicator_green", confidence: "high" };
  }

  if (isDocumentPocketQuery(m)) {
    return { key: "kit_document_pocket", confidence: "high" };
  }

  if (isDesiccatorKitCountQuery(m)) {
    return { key: "kit_desiccator_count", confidence: "high" };
  }

  if (isLockKeysKitQuery(m)) {
    return { key: "kit_lock_keys", confidence: "high" };
  }

  if (isLoadingWallClearanceQuery(m)) {
    return { key: "loading_wall_clearance", confidence: "high" };
  }

  if (isLoadingRulesQuery(m)) {
    return { key: "loading_rules_21", confidence: "high" };
  }

  if (isShelfConvectionSpacingQuery(m)) {
    return { key: "shelf_convection_spacing", confidence: "high" };
  }

  if (isKitShelfCountQuery(m, history)) {
    return { key: "kit_shelf_count", confidence: "high" };
  }

  if (isBasicKitSupplyQuery(m, history)) {
    return { key: "kit_basic_supply", confidence: "high" };
  }

  if (isNitrogenOptionDimensionsQuery(m)) {
    return { key: "nitrogen_option_dimensions", confidence: "high" };
  }

  if (isCabinetDimensionQuery(m)) {
    const dimAxes = [/ширин/i, /высот/i, /глубин|длин(?!а\s+волны)/i].filter((re) => re.test(m)).length;
    const requestedSignals = countRequestedDimensionSignals(m);
    const wantsAllDims =
      dimAxes >= 2 ||
      requestedSignals >= 2 ||
      (/габарит/i.test(m) && dimAxes === 0) ||
      /(?:ширин|высот|глубин|длин|масс|вес).*(?:и|,).*(?:ширин|высот|глубин|длин|масс|вес)/i.test(m);
    if (wantsAllDims) {
      return { key: "dimensions_all", confidence: "high" };
    }
    if (/ширин/i.test(m)) return { key: "width", confidence: "high" };
    if (/высот/i.test(m)) return { key: "height", confidence: "high" };
    if (/глубин|длин(?!а\s+волны)/i.test(m)) return { key: "depth", confidence: "high" };
  }

  if (/габарит|размер.*табл|таблиц[аы]?\s*1\.1/i.test(m) && /1204|1952|772|габарит|размер/i.test(m)) {
    return { key: "dimensions_all", confidence: "high" };
  }

  if (
    isCabinetDimensionQuery(m) &&
    (/масс(?:а|у|ы|ой)?(?!\w)|вес(?:а|у|ом)?(?!\w|т[ия])/i.test(m) ||
      (/масс(?:а|у|ы|ой)?(?!\w)|вес(?:а|у|ом)?(?!\w|т[ия])/i.test(m) && /шкаф|sdb1106/i.test(m)) ||
      /сколько\s+весит|каков\s+вес|какая\s+масса|насколько\s+тяж[её]л/i.test(m)) &&
    !/осмотр|визуальн|внешн|полк/i.test(m) &&
    !isShelfLoadQuery(m)
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

function isGoldenMatchPlausible(message, match, history = []) {
  const key = match?.key;
  if (!key) {
    return false;
  }
  const m = String(message || "").trim();
  if (key === "voltage_surge_not_specified" && !isVoltageSurgeQuery(m)) {
    return false;
  }
  if (key === "mass" && /осмотр|внешн|визуальн/i.test(m)) {
    return false;
  }
  if (key === "door_glass" && isBrokenDoorGlassQuery(m, history)) {
    return false;
  }
  return true;
}

function rowByKey(key) {
  return GOLDEN_TABLE_11.find((r) => r.key === key) || null;
}

function extractAmbientRhPercent(message) {
  const m = String(message || "");
  if (!/влажност|%rh|\brh\b/i.test(m)) {
    return null;
  }
  const match = m.match(/(\d{1,3})\s*(?:%\s*rh|%\s*rh\b|%\b|\s*rh\b)/i) || m.match(/(\d{1,3})\s*%/i);
  if (!match) {
    return null;
  }
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

function formatOperatingConditionsAnswer(message) {
  const msg = String(message || "");
  const base = [
    `Условия эксплуатации **${GOLDEN_MODEL}** (п. 1.1.2.12):`,
    "• температура окружающего воздуха: **от +15 °C до +35 °C**;",
    "• относительная влажность воздуха в помещении: **не более 80 %**;",
    "• атмосферное давление: **84,0–106,7 кПа**.",
    "",
  ];
  const rh = extractAmbientRhPercent(msg);
  if (rh != null) {
    if (rh <= 80) {
      return [
        ...base,
        `При **${rh} %** RH в помещении (не выше предела **80 %**) эксплуатация по п. **1.1.2.12** **допускается**, если также соблюдается температура **+15…+35 °C**.`,
      ].join("\n");
    }
    return [
      ...base,
      `При **${rh} %** RH в помещении эксплуатация **не соответствует** п. **1.1.2.12** (в помещении допустимо **не более 80 %** RH).`,
    ].join("\n");
  }
  if (/90\s*%/i.test(msg)) {
    return [
      ...base,
      "Эксплуатация при **90 % RH** в помещении **не соответствует** п. 1.1.2.12.",
    ].join("\n");
  }
  return [
    ...base,
    "Влажность в помещении должна быть **не более 80 %**; при **RH > 80 %** эксплуатация по п. **1.1.2.12** **не допускается**.",
  ].join("\n");
}

function formatGoldenFactAnswer(factKey, message = "", history = []) {
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
    case "power_storage_single_option": {
      const dualTrap =
        /только/i.test(message) &&
        /подогрев/i.test(message) &&
        /азот/i.test(message) &&
        /(?:\/|или)/i.test(message);
      if (dualTrap) {
        return [
          `В режиме «Хранения» **${GOLDEN_MODEL}** при включении **только одной** опции (подогрев **или** азот, вторая выключена), п. **1.1.2.7**: не более **${GOLDEN_POWER_W.storageBase} Вт** — в обоих случаях.`,
          "",
          "Пиковое потребление при **одновременном** включении **обеих** опций (азот + подогрев) в том же пункте указано отдельно.",
        ].join("\n");
      }
      const onlyHeat =
        /подогрев/i.test(message) &&
        !/(?:без\s+подогрев|подогрев\s+(?:выключен|отключен))/i.test(message);
      const onlyAzot =
        /азот/i.test(message) &&
        !/(?:без\s+азот|азот\s+(?:выключен|отключен))/i.test(message);
      const optionLabel =
        onlyHeat && !onlyAzot
          ? "опции **подогрева воздуха** (подача азота выключена)"
          : onlyAzot && !onlyHeat
            ? "опции **подачи азота** (подогрев выключен)"
            : "одной из опций (**подогрев** или **азот**, без второй)";
      return `Потребляемая мощность **${GOLDEN_MODEL}** в режиме «Хранения» при включённой ${optionLabel}, п. **1.1.2.7**: не более **${GOLDEN_POWER_W.storageBase} Вт**.`;
    }
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
      return `В РЭ **${GOLDEN_MODEL}** (п. **2.2.4**) требуется **защитное заземление**; числовое сопротивление заземляющего контура **не указано**.`;
    case "grounding_required":
      return [
        `Шкаф **${GOLDEN_MODEL}** подключается к сети **220 В ± 10 %** с **защитным заземлением** (п. **2.2.4**).`,
        "В комплект входит провод **функционального заземления** (п. **1.1.2.8** / табл. **1.2**).",
      ].join("\n");
    case "frequency":
      return `Частота питающей сети (п. **1.1.2.6**): **50 Гц ± 0,4 Гц**.`;
    case "power_voltage":
      return `Напряжение питающей сети (п. **1.1.2.6**): **220 В ± 10 %**.`;
    case "humidity_range":
      return `Диапазон поддержания относительной влажности внутри рабочего объёма (п. 1.1.2.1–1.1.2.4): **0–80 %RH**, точность **±1 %RH**.`;
    case "coat_color":
      return `Цвет порошкового покрытия корпуса **${GOLDEN_MODEL}** (п. 1.1.2.10): **${GOLDEN_COAT_COLOR.value}**.`;
    case "humidity_increase_forbidden":
      return [
        `Шкаф **${GOLDEN_MODEL}** **не предназначен** для повышения влажности внутри рабочего объёма (табл. 2.1, п. 2.1).`,
        "Относительная влажность **внутри** **не может превышать** RH **окружающей** среды — шкаф только **осушает** и **поддерживает** заданный уровень вниз, не увлажняет камеру.",
      ].join("\n");
    case "operating_conditions": {
      const msg = String(message || "");
      if (
        isAtmosphericPressureQuery(msg) &&
        !hasTerm(msg, "ambientTemp") &&
        !hasTerm(msg, "humidity") &&
        !hasTerm(msg, "lowAmbientTemp")
      ) {
        return [
          `Атмосферное давление при эксплуатации **${GOLDEN_MODEL}** (п. **1.1.2.12**): **84,0–106,7 кПа** (630–800 мм рт. ст.).`,
        ].join("\n");
      }
      if (
        ((/(?:\+\s*)?(?:1[0-4])\s*(?:°|°c|,|\b)|опустил|ниже\s*\+?\s*15/i.test(msg) &&
          !/влажност|%rh|\brh\b|90\s*%/i.test(msg)) ||
          (/температур/i.test(msg) &&
            /(?:\+\s*)?(?:1[0-4])\s*(?:°|°c|,|\b)/i.test(msg) &&
            !/влажност|%rh|\brh\b|90\s*%/i.test(msg))) &&
        /эксплуатац|штатн|можно|продолж|работ/i.test(msg)
      ) {
        const tMatch = msg.match(/\+\s*(1[0-4]|\d{1,2})\s*(?:°|°C|,|\b)/i);
        const tVal = tMatch ? tMatch[1] : "10";
        return [
          `При температуре **+${tVal} °C** (ниже **+15 °C**) штатная эксплуатация **${GOLDEN_MODEL}** **недопустима** (п. **1.1.2.12**).`,
          "Допустимый диапазон температуры **окружающего** воздуха: **от +15 °C до +35 °C**.",
          "Продолжать эксплуатацию в штатном режиме **нельзя** до возвращения температуры в допустимый диапазон.",
        ].join("\n");
      }
      return formatOperatingConditionsAnswer(msg);
    }
    case "shelf_load_standard": {
      const distributed = parseDistributedShelfLoad(message, factKey);
      if (distributed) return distributed;
      return `Суммарная распределённая нагрузка на каждую **стандартную полку** **${GOLDEN_MODEL}** (п. 1.1.2.8): **не более ${GOLDEN_SHELF_LOAD_KG.standard} кг**.`;
    }
    case "shelf_load_reinforced": {
      const distributed = parseDistributedShelfLoad(message, factKey);
      if (distributed) return distributed;
      return `Суммарная распределённая нагрузка на каждую **усиленную полку** **${GOLDEN_MODEL}** (п. 1.1.2.8): **не более ${GOLDEN_SHELF_LOAD_KG.reinforced} кг**.`;
    }
    case "shelf_load_cutout": {
      const distributed = parseDistributedShelfLoad(message, factKey);
      if (distributed) return distributed;
      return `Нагрузка на **укороченную полку с вырезом** (опция подогрева) **${GOLDEN_MODEL}** (п. 1.1.2.8): **не более ${GOLDEN_SHELF_LOAD_KG.cutoutHeating} кг**.`;
    }
    case "shelf_load_drawer": {
      const distributed = parseDistributedShelfLoad(message, factKey);
      if (distributed) return distributed;
      return `Суммарная распределённая нагрузка на каждую **выдвижную полку** **${GOLDEN_MODEL}** (п. 1.1.2.8): **не более ${GOLDEN_SHELF_LOAD_KG.drawer} кг**.`;
    }
    case "power_on_procedure":
      return [
        "Включение шкафа **SDB1106NM** (п. 2.2.4–2.2.5):",
        "1. Проверьте комплектность и напряжение сети **220 В / 50 Гц**.",
        "2. Подключите шнур питания к розетке **220 В**.",
        "3. Переведите **тумблер «ВКЛ»** на кожухе осушителя в положение включения — должна загореться красная индикация.",
      ].join("\n");
    case "drying_mode_after_power_on":
      return [
        `После включения **${GOLDEN_MODEL}** для выхода на режим **«Осушения»** (п. **2.2.4–2.2.5**, **2.3**, **1.1.4.4.1**):`,
        "",
        "1. **Включите** шкаф: сеть **220 В / 50 Гц** → шнур в розетку → тумблер **«ВКЛ»** на кожухе осушителя (п. **2.2.5**); должна загореться **красная** индикация.",
        "2. **Задайте порог влажности RH%п** в меню (п. **1.1.4.3.5**).",
        "3. **Закройте дверь** — при **RH%т** > **RH%п** шкаф автоматически переходит в режим **«Осушения»** (п. **1.1.4.4.1**).",
        "4. **Дождитесь** выхода на заданную влажность: **не более 3 часов** с момента включения (п. **1.1.2.4**).",
        "",
        "Перед первым пуском выполните **внешний осмотр** по п. **2.2.2** (уплотнители дверей, замки, осушитель).",
        "",
        "Если за **30 ± 1 мин** после отключения вентилятора влажность снизилась **менее чем на 1 %RH** — возможна **регенерация** (жёлтый индикатор, п. **1.1.4.4.3**). **Запрещено** выключать шкаф в режиме регенерации.",
        "",
        "Не загружайте чувствительные изделия, пока RH не в заданном диапазоне (**0–80 %RH**, п. **1.1.2.1–1.1.2.4**).",
      ].join("\n");
    case "door_glass":
      return [
        `В корпус каждой двери **${GOLDEN_MODEL}** встроено **стекло** для обзора рабочего объёма (п. 1.1.4.2).`,
        "Марка или тип стекла (материал вставок) в РЭ **отдельно не указан**.",
      ].join("\n");
    case "cabinet_body_material":
      return [
        `Конструкция **${GOLDEN_MODEL}** (п. **1.1.4.2**): сварно-сборная конструкция с **антистатическим порошковым покрытием**.`,
        "**Корпус** выполнен из **стали** (соединение заклёпками, винтами и сваркой, стыки герметизированы).",
        "**Двери** — сталь со встроенным стеклом для обзора; **полки** — перфорированная сталь; **навесы полок** — оцинкованная сталь.",
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
    case "inspection_power_off":
      return [
        `Визуальный осмотр шкафа **${GOLDEN_MODEL}** (п. **2.2.2**) выполняется **только при отключённом электропитании**.`,
        "Перед осмотром заземления и кабеля питания **отключите шкаф от сети 220 В** (снимите вилку или переведите тумблер «ВЫКЛ» на кожухе осушителя).",
      ].join("\n");
    case "power_cord_length":
      return [
        `В базовой комплектации **${GOLDEN_MODEL}** (табл. **1.2**): **шнур питания** длиной **не менее 4 м** — **1 шт.**`,
        "Подключение — розетка **220 В** (п. **2.2.5**).",
      ].join("\n");
    case "esd_bracelet_kit":
      return [
        `В комплекте **${GOLDEN_MODEL}** (табл. **1.2**):`,
        "• **антистатический тканевый браслет** с кнопкой (STUD) и проводом — **1 шт.**;",
        "• **провод функционального заземления** — **1 шт.**",
        "",
        "При работе с чувствительными к платам изделиями **подключайте браслет** к кнопке заземления на задней стенке шкафа (п. **2.3**).",
        "Антистатическое **покрытие** корпуса — **GOST IEC 61340-5-1**, **GOST IEC TR 61340-5-2** (п. **1.1.2.9**).",
      ].join("\n");
    case "regen_mode_overview":
      return [
        `В режиме **«Регенерации»** **${GOLDEN_MODEL}** (п. **1.1.4.4.3**) на панели управления горит **жёлтый** индикатор. В этом режиме:`,
        "",
        "1. Включается **ТЭН** на **45 ± 1 мин**.",
        "2. Открываются **заслонки** осушителя на **60 ± 1 мин**.",
        "3. После отключения ТЭНа вентилятор работает **5 ± 1 мин** для охлаждения осушителя.",
        "4. Заслонки закрываются, вентилятор снова включается на **60 ± 1 мин**.",
        "5. Шкаф переходит в режим **«Осушения»**.",
        "",
        "Режим активируется, если **RH%т** > **RH%п** и за **30 ± 1 мин** после выключения вентилятора влажность снизилась **менее чем на 1 %RH**.",
        "",
        "**Запрещено** выключать шкаф в режиме регенерации.",
      ].join("\n");
    case "regen_activation_conditions":
      return [
        `Условия перехода в режим **«Регенерации»** **${GOLDEN_MODEL}** (п. **1.1.4.4.3**):`,
        "",
        "• **RH%т** (текущая влажность) **выше** порога **RH%п** (установленного порога);",
        "• после отключения вентилятора осушителя за **30 ± 1 мин** влажность снизилась **менее чем на 1 %RH** — включается регенерация на **60 ± 1 мин**;",
        "• индикация — **жёлтый** индикатор на панели управления.",
        "",
        "**Запрещено** выключать шкаф в режиме регенерации.",
      ].join("\n");
    case "regen_cycle_duration":
      return `Полный цикл регенерации осушителя **${GOLDEN_MODEL}** (п. **1.1.4.4.3**): **60 ± 1 мин**.`;
    case "heating_option_mount":
      return [
        `Монтаж опции **«Система подогрева воздуха»** для **${GOLDEN_MODEL}** (п. **1.2.1.3**, примечания к табл. **1.2**):`,
        "",
        "• **Вариант 2:** две опции подогрева в верхней части шкафа, поток воздуха вниз по **двум** воздуховодам;",
        "• при установке опции **две** стандартные полки заменяются **укороченными полками с вырезом**;",
        "• нагрузка на полку с вырезом — **не более 20 кг**.",
        "",
        "Установка температуры подогрева — в **меню** шкафа (п. **1.1.4.3.5** г), диапазон **Тос +5 °C … +40 °C** (п. **1.2.1.1**).",
      ].join("\n");
    case "nitrogen_option_dimensions":
      return [
        `Габариты **${GOLDEN_MODEL}** с опциями (азот, Ethernet, светоколонна «Светофор»):`,
        "",
        "• **Базовое исполнение** (табл. **1.1**): ширина **1204 мм**, высота **1952 мм**, глубина **772 мм**, масса **180 кг**.",
        "• С учётом модулей опций — **приложение В** РЭ (габариты шкафов с системой подачи азота, разъёмом Ethernet и светоколонной).",
        "",
        "Опция азота **не уменьшает** число полок; может изменяться **наружная ширина** корпуса с модулем подачи азота.",
      ].join("\n");
    case "window_cleaning_alcohol":
      return [
        `В РЭ **${GOLDEN_MODEL}** **не указано** применение **спиртосодержащих** и других агрессивных растворителей для протирки **смотровых окон** в дверях.`,
        "",
        "В корпус дверей встроено **стекло** для обзора (п. **1.1.4.2**). Для ухода используйте **мягкую сухую** салфетку без растворителей; не допускайте попадания жидкостей на уплотнители и электронику.",
      ].join("\n");
    case "voltage_surge_not_specified":
      return [
        `В РЭ **${GOLDEN_MODEL}** **не указана** встроенная **защита от перепадов напряжения**.`,
        "",
        "Параметры питания (п. **1.1.2.6**): **220 В ± 10 %**, **50 Гц ± 0,4 Гц**.",
        "При нестабильной сети организация может использовать **внешнее** стабилизирующее/защитное устройство — в РЭ конкретная модель не регламентирована.",
      ].join("\n");
    case "kit_dry_storage":
      return [
        `ПО **«Dry Storage»** в комплекте **${GOLDEN_MODEL}** (табл. **1.2**): **1 шт.**`,
        "",
        "Назначение (п. **1.1.3.2**): удалённый доступ по **Ethernet**, управление режимами, сбор статистики.",
        "Подробности — в руководстве пользователя **САТЕ.421411.013.00.00.00.000 И3**.",
      ].join("\n");
    case "kit_tricolor_indicator":
      return [
        `**Трёхцветная** световая индикация **${GOLDEN_MODEL}** (табл. **1.2** — **1 шт.**) дублирует режимы на панели управления:`,
        "",
        "• отображение работы в режимах **хранения**, **регенерации** и **осушения** (п. **1.1.3.2**);",
        "• на панели: **жёлтый** — регенерация, **красный** — осушение/открытие двери (п. **1.1.4.4.3**, **1.1.4.4.1**).",
      ].join("\n");
    case "panel_indicator_yellow":
      return [
        `Если на панели **${GOLDEN_MODEL}** горит **жёлтый** индикатор — шкаф в режиме **«Регенерация»** (п. **1.1.4.4.3**).`,
        "",
        "Условия перехода: **RH%т** > **RH%п**; если за **30 ± 1 мин** после выключения вентилятора влажность снизилась **менее чем на 1 %RH** — цикл регенерации **60 ± 1 мин**.",
        "",
        "**Запрещено** выключать шкаф в режиме регенерации.",
      ].join("\n");
    case "panel_indicator_red":
      return [
        `**Красный** индикатор на панели **${GOLDEN_MODEL}** (п. **1.1.4.4.1**, **1.1.4.4.3**):`,
        "",
        "• в режиме **«Осушения»** — горит/мигает, когда **RH%т** выше **RH%п**;",
        "• при **открытии двери** — загорается, звучит **прерывистый** сигнал; после закрытия — **мигает** (п. **1.1.4.3.4**).",
      ].join("\n");
    case "panel_indicator_green":
      return [
        `**Зелёный** индикатор на панели **${GOLDEN_MODEL}** (п. **1.1.4.3.3**):`,
        "",
        "• **горит зелёным** — шкаф в режиме **«Хранения»** (норма);",
        "• **зелёный + мигающий красный** — режим **«Осушения»** (норма, п. **1.1.4.4.1**).",
        "",
        "Жёлтый индикатор — режим **«Регенерации»** (п. **1.1.4.4.3**).",
      ].join("\n");
    case "panel_indicator_meanings":
      return [
        `Индикация на панели **${GOLDEN_MODEL}** (п. **1.1.4.4.1**, **1.1.4.4.3**):`,
        "",
        "• **Жёлтый** — режим **«Регенерации»** (RH%т > RH%п, слабое снижение влажности за 30 мин → цикл **60 ± 1 мин**).",
        "• **Красный** — режим **«Осушения»** (RH%т > RH%п) и/или **открытая дверь** (звуковой сигнал, п. **1.1.4.3.4**).",
        "",
        "Трёхцветная световая индикация в комплекте (табл. **1.2**) **дублирует** эти режимы (п. **1.1.3.2**).",
      ].join("\n");
    case "kit_basic_supply":
      return [
        `Базовая комплектация **${GOLDEN_MODEL}** (табл. **1.2**):`,
        "",
        "• **Полка с перфорацией** — **10 шт.** (п. 8.1);",
        "• **Осушитель** — **2 шт.** (п. 6.2);",
        "• **Колёса** для транспортирования — **4 шт.**;",
        "• **Регулируемые ножки** — **4 шт.**;",
        "• ПО **«Dry Storage»** — **1 шт.**;",
        "• **Трёхцветный индикатор** — **1 шт.**;",
        "• **Шнур питания** (не менее 4 м) — **1 шт.**;",
        "• **Комплект ключей** — **1 комп.**;",
        "• **Антистатический браслет** — **1 шт.**;",
        "• **Провод функционального заземления** — **1 шт.**;",
        "• **Карман для документов А4** — **1 шт.**;",
        "• **РЭ** и **паспорт** — по **1 шт.**",
        "",
        "Опции (**азот**, **подогрев**, светоколонна «Светофор» и др.) в базовую поставку **не входят** — заказываются отдельно.",
        "",
        "**Примечание:** при опции **подогрева** **2** стандартные полки заменяются **укороченными с вырезом** (нагрузка на такую полку — **не более 20 кг**); общее число полок остаётся **10**.",
      ].join("\n");
    case "kit_document_pocket":
      return [
        `В базовой комплектации **${GOLDEN_MODEL}** (табл. **1.2**): **карман для документов формата А4** — **1 шт.**`,
      ].join("\n");
    case "kit_desiccator_count":
      return `В комплект поставки **${GOLDEN_MODEL}** (табл. **1.2**, п. **6.2**): осушитель — **2 шт.**`;
    case "kit_lock_keys":
      return [
        `В базовой комплектации **${GOLDEN_MODEL}** (табл. **1.2**): **комплект ключей** — **1 комп.**`,
        "По одному комплекту ключей для замков дверей шкафа.",
      ].join("\n");
    case "loading_wall_clearance":
      return [
        `Минимальное расстояние от **стенок шкафа** при загрузке **${GOLDEN_MODEL}** (п. **2.1**): **не менее 50 мм**.`,
        "",
        "Также при размещении груза: элементы **не выступают** за края полки; обеспечивается **свободная подача воздуха** к каждому предмету.",
      ].join("\n");
    case "loading_rules_21":
      return [
        `Правила размещения груза в **${GOLDEN_MODEL}** (п. **2.1**):`,
        "",
        "• элементы **не должны выступать** за края полки;",
        "• обеспечить **свободную подачу воздуха** к каждому предмету;",
        "• от **стенок шкафа** — **не менее 50 мм**;",
        "• мелкие элементы — **в таре**, не россыпью;",
        "• **не выдвигать более 1** выдвижной полки одновременно;",
        "• укороченная полка с вырезом — **не ниже** нижнего края опции подогрева.",
      ].join("\n");
    case "rh_setpoint_definitions":
      return [
        `Обозначения влажности в **${GOLDEN_MODEL}** (п. **1.1.4.3.5**, **1.1.4.4**):`,
        "",
        "• **RH%т** — **текущая** относительная влажность внутри рабочего объёма;",
        "• **RH%п** — **пороговое (установленное)** значение влажности, заданное в меню.",
        "",
        "Режимы осушения и регенерации сравнивают **RH%т** с **RH%п** (п. **1.1.4.4.1**, **1.1.4.4.3**).",
      ].join("\n");
    case "humidity_time_to_setpoint": {
      const asksDoorOrFiveRh = /после\s+закрыт|5\s*%?\s*rh/i.test(message);
      if (!asksDoorOrFiveRh) {
        return `Время выхода на установленную влажность (режим осушения) **${GOLDEN_MODEL}** (п. **1.1.2.4**): **не более 3 часов** с момента **включения** шкафа.`;
      }
      return [
        `Время выхода на установленную влажность **${GOLDEN_MODEL}** (п. **1.1.2.4**): **не более 3 часов** с момента **включения** шкафа.`,
        "",
        "Отдельное время выхода именно на **5 %RH** после закрытия двери в РЭ **не приведено**.",
        "После открытия двери ускоренное осушение **начинается заново** (п. **1.1.4.4.1**).",
      ].join("\n");
    }
    case "ethernet_commissioning":
      return [
        `Подключение **Ethernet** при вводе **${GOLDEN_MODEL}** (п. **2.2.5**):`,
        "",
        "• кабель Ethernet подключается к **сетевому разъёму** шкафа (в комплекте — разъём **1 шт.**, табл. **1.2**);",
        "• ПО **«Dry Storage»** использует сеть для удалённого доступа (п. **1.1.3.2**).",
        "",
        "Для **локальной** работы с панели управления Ethernet может не использоваться, но в типовом алгоритме включения (п. **2.2.5**) его подключают.",
      ].join("\n");
    case "humidity_calibration_unknown":
      return [
        `Периодичность **калибровки** встроенного датчика влажности **${GOLDEN_MODEL}** в РЭ **не указана**.`,
        "",
        "Регламент ТО (табл. **3.1**): проверки уплотнителей, кабелей — **1 месяц**; замена блока осушения — **36 месяцев**.",
      ].join("\n");
    case "lighting_option_unknown":
      return [
        `Состав опции **«Освещение рабочего объёма»** для **${GOLDEN_MODEL}** в тексте данного РЭ **не расшифрован**.`,
        "",
        "В комплектации фигурирует **трёхцветная индикация** режимов и **LCD**-индикация (п. **1.1.3.2**), а также опциональная светоколонна **«Светофор»** (п. **1.1.4.3.2**).",
        "Уточнение по опции освещения — у изготовителя или в отдельном описании опций.",
      ].join("\n");
    case "warranty_storage_term":
      return [
        `По разделу **5** РЭ **${GOLDEN_MODEL}**:`,
        "",
        "• **Гарантийный срок хранения** — **3 месяца** с момента отгрузки потребителю (п. **4.2.3** / раздел **5**);",
        "• прекращается при **вводе в эксплуатацию**;",
        "• **гарантийный срок эксплуатации** шкафа в данном РЭ **отдельно не приведён**.",
        "",
        "Срок хранения осушителей — **36 месяцев** (отдельно от гарантии хранения шкафа).",
      ].join("\n");
    case "door_open_behavior":
      return [
        `При **открытии** двери **${GOLDEN_MODEL}** (п. **1.1.4.4.1**, **1.1.4.3.4**):`,
        "",
        "• **вентилятор осушителя отключается**;",
        "• на **LCD** — символ открытой двери;",
        "• **прерывистый звуковой сигнал**;",
        "• загорается **красный** световой индикатор.",
        "",
        "После **закрытия** двери: вентилятор включается, ускоренное осушение **начинается заново**, звук отключается, красный индикатор **мигает**.",
        "Отдельный порог «**более 1 минуты**» в РЭ **не указан** — логика привязана к факту открытой двери.",
      ].join("\n");
    case "total_shelf_load_info":
      return [
        `Суммарная нагрузка по полкам **${GOLDEN_MODEL}** (п. **2.1**):`,
        "",
        "• на каждую **стандартную** полку — **не более 50 кг** (распределённо);",
        "• на **усиленную** — **100 кг**; на полку с вырезом (подогрев) — **20 кг**.",
        "",
        "Единый лимит «на все полки сразу» в РЭ **не задан** — оценивайте загрузку **по каждой** полке.",
      ].join("\n");
    case "desiccant_replace_procedure":
      return [
        `Замена блока осушения (цеолита) **${GOLDEN_MODEL}** (табл. **3.1**, п. **3.1.3**):`,
        "",
        "1. Соблюдайте меры безопасности (п. **2.2.1**, **3.1.2**).",
        "2. **Отключите** шкаф от сети **220 В**.",
        "3. Выполните замену блока осушения — **не реже 1 раза в 36 месяцев**.",
        "4. Проверьте уплотнители и плотность закрытия дверей.",
        "5. Включите шкаф и дождитесь выхода на режим.",
        "",
        "Детальная пошаговая механика разборки модуля в РЭ **не приведена** — при необходимости обращайтесь к **изготовителю**.",
      ].join("\n");
    case "humidity_menu_procedure":
      return [
        `Установка порога влажности **${GOLDEN_MODEL}** (п. **1.1.4.3.5**):`,
        "",
        "1. Нажмите **«SET»** — подменю порога RH.",
        "2. Кнопками **«◄/►»** выберите разряд (мигает).",
        "3. **«UP»/«DN»** — значение порога (**00,0…99,9 %RH**, шаг **0,1 %RH**).",
        "4. Подтвердите выбор (по РЭ — завершение установки в меню).",
        "",
        "Диапазон поддержания: **0–80 %RH**, точность **±1 %RH** (п. **1.1.2.1–1.1.2.4**).",
      ].join("\n");
    case "door_sound_fault":
      return [
        `Если **постоянный звуковой сигнал** без нормального открытия двери **${GOLDEN_MODEL}** (табл. **3.2**, п. **2**):`,
        "",
        "1. Убедитесь, что дверь **закрыта**.",
        "2. Проверьте/отрегулируйте **датчик закрытия** двери (п. **2.2.2.3**).",
        "3. При неисправности датчика — **замена** (табл. **3.2**).",
        "",
        "Норма: сигнал только при **открытой** двери (п. **1.1.4.3.4**).",
      ].join("\n");
    case "maintenance_desiccant_replace":
      return [
        `Замена блока осушения (цеолита) в **${GOLDEN_MODEL}** выполняется по регламенту ТО (п. **2.5**): **не реже 1 раза в 36 месяцев**.`,
        "В РЭ **не указан** ресурс в **тысячах часов** непрерывной работы — ориентируйтесь на период **36 месяцев**.",
      ].join("\n");
    case "service_life":
      return [
        `Средний **срок службы** шкафа **${GOLDEN_MODEL}** в данном РЭ **не указан** (раздел **4.1.2** — меры безопасности при ремонте).`,
        "Ориентируйтесь на регламент ТО и условия эксплуатации из настоящего руководства.",
      ].join("\n");
    case "mtbf_hours":
      return [
        `Среднее **время наработки на отказ** для **${GOLDEN_MODEL}** в данном РЭ **не указано** (раздел **4.1.1** — общие указания по ремонту).`,
        "Конкретные часы наработки в тексте руководства не приведены.",
      ].join("\n");
    case "emergency_smoke":
      return [
        `При **дыме**, запахе **гари** или иных признаках аварии **${GOLDEN_MODEL}** (п. **2.4**):`,
        "",
        "1. **Немедленно отключите питание** (снимите вилку **220 В** или тумблер «ВЫКЛ» на кожухе осушителя).",
        "2. **Не проверяйте** уплотнители, замки или RH — сначала только обесточивание.",
        "3. Режим **регенерации** не отменяет немедленное отключение при дыме/запахе гари.",
        "",
        "После обесточивания — действия по п. **2.4** РЭ и инструкциям организации.",
      ].join("\n");
    case "contact_support":
      return require("./portal-contact-support-answer").buildPortalContactSupportAnswer();
    case "broken_door_glass":
    case "unsupported_replacement":
      return buildUnsupportedReplacementAnswer(GOLDEN_MODEL, message, history);
    case "equipment_serial_number":
      return resolveSerialNumberAnswer(message, GOLDEN_MODEL) || "";
    case "first_startup_guide":
      return [
        `С чего начать эксплуатацию **${GOLDEN_MODEL}** (п. **2.2.2**–**2.2.5**, **2.3**):`,
        "",
        "1. **Внешний осмотр** при отключённом питании (п. **2.2.2**): корпус, кабель **220 В**, уплотнители дверей, замки, заземление, браслет.",
        "2. **Подготовка** (п. **2.2.4**): комплектность; сеть **220 В / 50 Гц**.",
        "3. **Включение** (п. **2.2.5**): Ethernet (при необходимости) → вилка **220 В** → тумблер **«ВКЛ»** на кожухе осушителя.",
        "4. **Настройка RH%п** (п. **1.1.4.3.5**) и выход на режим **«Осушения»** — до **3 ч** (п. **1.1.2.4**).",
        "5. При работе с платами — **антистатический браслет** (п. **2.3**).",
      ].join("\n");
    case "first_startup_full":
      return [
        `Полный алгоритм первого включения и выхода на режим **${GOLDEN_MODEL}**:`,
        "",
        "**Подготовка (п. 2.2.2–2.2.4):**",
        "• осмотр при **отключённом** питании: корпус, кабель, уплотнители, замки, заземление;",
        "• проверка комплектности; сеть **220 В / 50 Гц**.",
        "",
        "**Включение (п. 2.2.5):**",
        "• кабель **Ethernet** (при необходимости) → вилка **220 В** → тумблер **«ВКЛ»**; красная индикация на кнопке.",
        "",
        "**Выход на режим (п. 2.3, 1.1.4.4.1):**",
        "• задать порог **RH%п** (п. **1.1.4.3.5**);",
        "• при **RH%т** > **RH%п** — режим **«Осушения»**;",
        "• выход на влажность — **не более 3 ч** (п. **1.1.2.4**);",
        "• при слабом снижении RH за **30 мин** — **регенерация** (жёлтый индикатор, п. **1.1.4.4.3**). **Запрещено** выключать шкаф в регенерации.",
        "",
        "Не загружайте чувствительные изделия, пока RH не в диапазоне **0–80 %RH**.",
      ].join("\n");
    case "kit_wheels_feet":
      return [
        `В базовой комплектации **${GOLDEN_MODEL}** (табл. **1.2**):`,
        "",
        "• **колёса** для транспортирования — **4 шт.**;",
        "• **регулируемые ножки** (max высота **50 мм**) — **4 шт.**",
        "",
        "Ножки выравнивают шкаф по высоте и фиксируют его от перемещения после установки (п. **1.1.4.2**).",
      ].join("\n");
    case "wheels_upgrade_not_available":
      return [
        `Для **${GOLDEN_MODEL}** колёса **уже входят** в базовую поставку — **4 шт.** (табл. **1.2**).`,
        "",
        "Отдельная «дооснащение колёсными опорами вместо стационарных» в РЭ **не описана** — шкаф поставляется на колёсах с регулируемыми ножками.",
        "Замена комплектации — только через **изготовителя**.",
      ].join("\n");
    case "door_magnetic_seals":
      return [
        `У дверей **${GOLDEN_MODEL}** (п. **1.1.4.2**):`,
        "",
        "• по периметру корпуса двери — **магнитный уплотнитель**;",
        "• обеспечивает **герметичность** закрытия рабочего объёма.",
      ].join("\n");
    case "door_sensor_purpose":
      return [
        `Датчики открытия дверей **${GOLDEN_MODEL}** (п. **1.1.4.2**):`,
        "",
        "• установлены **в проёме каждой двери**;",
        "• при открытии — **отключение вентилятора** осушителя, **звуковой сигнал**, индикация на LCD (п. **1.1.4.3.4**, **1.1.4.4.1**);",
        "• обеспечивают безопасность и корректный режим осушения после закрытия двери.",
      ].join("\n");
    case "nitrogen_timer_range":
      return [
        `Диапазон **таймера подачи азота** для **${GOLDEN_MODEL}** **без датчика концентрации** (п. **1.2.2.1**, **2.3.1.3**):`,
        "",
        "• **от 0 до 99 минут** (в характеристиках опции — до **99,9 мин**);",
        "• устанавливается в меню шкафа кнопкой **SET** (п. **2.3.1.3**).",
        "",
        "С датчиком азота управление ведётся по **концентрации N₂%**, а не по таймеру (п. **1.2.2.5**).",
      ].join("\n");
    case "ethernet_fault_table32":
      return [
        `Нет связи по **Ethernet** у **${GOLDEN_MODEL}** — табл. **3.2**, п. **4**:`,
        "",
        "**Возможные причины и действия:**",
        "• **плохой контакт** кабеля Ethernet в разъёме шкафа → проверить/переподключить, при необходимости **заменить разъём**;",
        "• **неисправен кабель Ethernet** → **заменить кабель**.",
        "",
        "Регламент ТО: проверка кабеля Ethernet — **1 месяц** (табл. **3.1**, п. 5).",
      ].join("\n");
    case "maintenance_schedule":
      return [
        `График технического обслуживания **${GOLDEN_MODEL}** (табл. **3.1**):`,
        "",
        "• замена блока осушения — **36 месяцев**;",
        "• продувка от пыли узла подогрева (при наличии опции) — **12 месяцев**;",
        "• проверка уплотнительных резинок дверей — **1 месяц**;",
        "• проверка кабеля питания **220 В** — **1 месяц**;",
        "• проверка кабеля **Ethernet** — **1 месяц**.",
      ].join("\n");
    case "maintenance_annual":
      return [
        `Ежегодное (12 месяцев) регламентное обслуживание **${GOLDEN_MODEL}** по табл. **3.1**:`,
        "",
        "• **продувка от пыли** узла поддержания температуры — **при наличии опции подогрева**;",
        "",
        "Остальные работы по другим периодам: уплотнители и кабели — **ежемесячно**; замена блока осушения — **36 месяцев**.",
      ].join("\n");
    case "fault_humidity_table32":
      return [
        `Если **влажность не выходит на заданный режим** — табл. **3.2**, п. **3** для **${GOLDEN_MODEL}**:`,
        "",
        "**Возможные причины → действия:**",
        "• **повреждение уплотнителей** дверей → **заменить уплотнитель**;",
        "• **блок осушения неисправен** или исчерпал ресурс → **заменить блок осушения**.",
        "",
        "Дополнительно по п. **2.2.2**: проверить плотность закрытия замков; визуальный осмотр осушителя.",
      ].join("\n");
    case "humidity_not_dropping":
      return buildHumidityNotDroppingAnswer(GOLDEN_MODEL);
    case "humidity_spike_troubleshooting":
      return buildHumiditySpikeAnswer(GOLDEN_MODEL);
    case "external_inspection_222":
      return [
        `**Внешний осмотр** шкафа **${GOLDEN_MODEL}** перед вводом в эксплуатацию (п. **2.2.2**):`,
        "",
        "**2.2.2.1** — осмотр **кожуха шкафа** и **осушителя**: отсутствие механических повреждений, коррозии, следов перегрева, целостность механизмов.",
        "",
        "**2.2.2.2** — осмотр **уплотнителя дверей**: отсутствие повреждений, правильная установка.",
        "",
        "**2.2.2.3** — проверка **замков дверей**; при необходимости отрегулировать **ригель** для плотного закрытия.",
        "",
        "Осмотр выполняется **до подключения к сети** (далее — п. **2.2.4**–**2.2.5**).",
      ].join("\n");
    case "nitrogen_concentration_control":
      return [
        `Контроль концентрации азота в **${GOLDEN_MODEL}** — опция **«Система автоматической подачи азота» с датчиком азота** (п. **1.2.2.4**–**1.2.2.5**, **2.3.2**):`,
        "",
        "**Принцип работы (п. 1.2.2.5):**",
        "• датчик отслеживает текущую концентрацию **N2%т** внутри рабочего объёма;",
        "• если **N2%т < N2%п** (порог) — открывается электромагнитный клапан, азот поступает через регулятор **Ррег.**;",
        "• при **N2%т = N2%п + 0,1 %** клапан закрывается;",
        "• повторное включение — при **N2%т = N2%п − 1 %**.",
        "",
        "**Установка порога N2%п (п. 2.3.2.3, 1.1.4.3.5 в)):**",
        "• диапазон **78–98 %**;",
        "• **SET** (2 с) → **SET** → **◄/►** разрядность, **UP/DN** значение → **SET** для подтверждения.",
        "",
        "**Важно:** при датчике азота регулятор **Рпост. закрыт**; подача только через **Ррег.** (п. **1.2.2.4**). Точность поддержания порога — **±1 %** (п. **1.2.2.1**).",
        "",
        "Без датчика азота контроль концентрации **не ведётся** — используется **таймер** подачи (п. **2.3.1.3**).",
      ].join("\n");
    case "nitrogen_rotameter_setup":
      return [
        `Настройка ротаметров и постоянного расхода азота для **${GOLDEN_MODEL}** (п. **1.2.2.1**, **2.3.1**):`,
        "",
        "Опция азота имеет **два ротаметра**: **Рпос.** (постоянный расход) и **Ррег.** (дополнительный расход после открытия двери).",
        "",
        "**Постоянный расход — без датчика азота (п. 2.3.1.2):**",
        "• после подключения азота (п. **2.3.1.1**) установить **постоянный расход** регулятором **Рпост.**;",
        "• показания контролировать по **шкале ротаметра**;",
        "• величина расхода — по требованиям потребителя и внутреннему объёму шкафа.",
        "",
        "**Расход после открытия двери (п. 2.3.1.4):**",
        "• открыть и закрыть дверь шкафа;",
        "• регулятором **Ррег.** задать расход азота при автоматической подаче — по шкале ротаметра.",
        "",
        "**С датчиком азота (п. 2.3.2):** регулятор **Рпост. закрыть**; расход задаётся через **Ррег.** (п. **2.3.2.2**–**2.3.2.4**).",
        "",
        "Диапазон расхода азота: **3–30 л/мин** (п. **1.2.2.1**).",
      ].join("\n");
    case "nitrogen_connect":
      return [
        `Подключение опции **«Система автоматической подачи азота»** для **${GOLDEN_MODEL}** (п. **2.2.1.5**, **2.3.1.1**, **1.2.2.1**):`,
        "",
        "**Перед подачей азота:**",
        "• магистраль (баллон) — **запорный кран** и **регулятор давления** с манометром;",
        "• проверить **надёжность крепления** трубки к быстросъёмному соединению на **задней стенке** опции Азот и на выходе регулятора магистрали;",
        "• давление на выходе регулятора — **не более 6 бар**.",
        "",
        "**Подключение:**",
        "• установить давление азота на выходе магистрали (баллона) **6 бар**;",
        "• подключить опцию Азот ко **входу регулятора давления** пневматической трубкой **Ø 8 мм** (п. **2.3.1.1** / **2.3.2.1**).",
        "",
        "Источник азота — **внешний** (баллон или магистраль); расход **3–30 л/мин** (п. **1.2.2.1**).",
        "Дальнейшая настройка ротаметров и режима — п. **2.3.1** (без датчика азота) или **2.3.2** (с датчиком).",
      ].join("\n");
    case "nitrogen_pressure_max":
      return [
        `Максимальное избыточное давление азота на входе шкафа **${GOLDEN_MODEL}** с опцией азотного питания (п. **1.1.2.6**): **не более 6 бар** (≈ **0,6 МПа**).`,
        "Это давление **азота**, не напряжение электросети **220 В**.",
      ].join("\n");
    case "shelf_convection_spacing":
      return [
        `В РЭ **${GOLDEN_MODEL}** **не задано** отдельное минимальное расстояние **между полками по высоте** (в миллиметрах) специально «для конвекции».`,
        "",
        "Для нормальной циркуляции воздуха при размещении груза (п. **2.1**) указано:",
        "• элементы **не должны выступать** за края полки;",
        "• загрузка должна обеспечивать **свободную подачу воздуха** к каждому предмету;",
        "• от **стенок шкафа** — **не менее 50 мм**.",
        "",
        "Полки **регулируются по высоте** (п. **1.1.2.8**): выбирайте шаг по габариту изделий и свободному обдуву; фиксированный «шаг между полками» в мм в РЭ не приведён.",
      ].join("\n");
    case "door_sound_check":
      return [
        `Проверка звуковой сигнализации **${GOLDEN_MODEL}** (п. **1.1.4.3.4**, **2.2.2.3**):`,
        "",
        "1. Убедитесь, что шкаф подключён к сети **220 В** и тумблер на кожухе осушителя в положении «ВКЛ».",
        "2. **Откройте дверь** — должен включиться **прерывистый** звуковой сигнал.",
        "3. **Закройте дверь** — сигнал должен **отключиться**.",
        "4. Если сигнал не срабатывает или не отключается — проверьте плотность закрытия и регулировку замков/датчика двери (п. **2.2.2.3**); при необходимости см. табл. **3.2** («шкаф издаёт звуковой сигнал»).",
      ].join("\n");
    case "door_sound_signal":
      return [
        `Звуковая сигнализация **${GOLDEN_MODEL}** (п. **1.1.4.3.4**): при **открытии** двери включается **прерывистый звуковой сигнал**, при **закрытии** — **отключается**.`,
        "",
        "Если дверь **открыли** и шкаф **пищит** — **это нормально** (сигнализация открытой двери).",
        "Отдельный порог «более 1 минуты» в РЭ **не указан** — сигнал привязан к факту открытой двери.",
      ].join("\n");
    case "desiccant_drying_process":
      return [
        `Осушение воздуха в **${GOLDEN_MODEL}** выполняется **адсорбционным модулем** с **цеолитом** в карманах осушителя (п. **1.1.4.2**).`,
        "**Жидкий химический осушитель не используется** — это твёрдый поглотитель влаги (цеолит).",
      ].join("\n");
    case "sensor_brand_unknown":
      return [
        `Производитель / бренд цифрового датчика влажности и температуры в **${GOLDEN_MODEL}** в РЭ **не указан**.`,
        "В документе описаны функции датчиков и индикация, но без привязки к Siemens, Honeywell и т.п.",
      ].join("\n");
    case "nitrogen_shelf_count":
      return [
        `Установка **системы подачи азота** на **${GOLDEN_MODEL}** **не уменьшает** количество полок в шкафе.`,
        "",
        `В базовой комплектации — **10** полок с перфорацией (табл. 1.2, п. 8.1). Опция азота может влиять на **габариты** корпуса (ширина с учётом модуля подачи азота, п. 1.1.2.6), но **не на число полок**.`,
        "",
        "**Важно:** замена **двух** стандартных полок на **укороченные с вырезом** относится к опции **подогрева воздуха**, а **не** к азоту (примечание к табл. 1.2); общее число полок при этом остаётся **10**.",
      ].join("\n");
    case "kit_shelf_count":
      return [
        `В **базовой комплектации** шкафа **${GOLDEN_MODEL}** (табл. 1.2, п. 8.1):`,
        "",
        "• **Полка с перфорацией** — **10 шт.**",
        "",
        "Дополнительно по табл. 1.2 для SDB1106NM: осушитель — **2 шт.** (п. 6.2), колёса — 4, ножки регулируемые — 4, ПО «Dry Storage» — 1, трёхцветный индикатор — 1 и др.",
        "",
        "**Примечание к табл. 1.2:** при установке **системы подогрева** **две** стандартные полки заменяются **укороченными полками с вырезом** (нагрузка на такую полку — не более **20 кг**); общее число полок в шкафе при этом остаётся **10**, но 2 из них — укороченные с вырезом.",
      ].join("\n");
    case "main_power_switch_location":
      return [
        `Основной выключатель питания **${GOLDEN_MODEL}** (п. **2.2.3.1**):`,
        "• **Тумблер «ВКЛ»/«ВЫКЛ»** на **кожухе осушителя** (задняя стенка шкафа, защитный кожух осушающего модуля).",
        "• Перед визуальным осмотром кабеля и заземления шкаф **отключают от сети 220 В** (тумблер «ВЫКЛ» или вилка из розетки, п. **2.2.2**).",
      ].join("\n");
    case "climatic_execution_uhl":
      return [
        `Климатическое исполнение **${GOLDEN_MODEL}** (вводная часть РЭ, **ГОСТ 15150-69**): **УХЛ 4.2**.`,
        "Категория размещения изделия при эксплуатации — **4.2** (умеренный и холодный климат, сухие помещения).",
      ].join("\n");
    case "heating_air_max_temp":
      return [
        `Опция **«Система подогрева воздуха»** для **${GOLDEN_MODEL}** (п. **1.2.1.1**):`,
        "",
        "• **Максимальная** температура нагрева воздуха: **плюс 40 °C**;",
        "• **Минимальная**: **температура окружающей среды +5 °C**.",
        "",
        "Установка температуры — в **меню настроек** шкафа (п. **1.1.4.3.5** г)).",
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
  if (factKey === "power_storage_single_option") {
    if (!/\b8\s*вт/i.test(a)) {
      failures.push({
        code: "golden_numeric_mismatch",
        severity: "fail",
        detail: "wrong_power_storage_single_option",
        expected: "8 Вт",
      });
    }
    if (/\b810\s*вт/i.test(a)) {
      failures.push({
        code: "golden_numeric_mismatch",
        severity: "fail",
        detail: "wrong_power_storage_single_option_810_trap",
        expected: "no 810 Вt for single option",
      });
    }
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
    if (!/\bip\s*55\b/i.test(a)) {
      failures.push({ code: "golden_numeric_mismatch", severity: "fail", detail: "wrong_ip_class", expected: "IP55" });
    }
  }

  if (factKey === "humidity_step" && !/0[,.]1\s*(?:%rh|rh)/i.test(a) && !/шаг[\p{L}\s]{0,20}0[,.]1/iu.test(a)) {
    failures.push({ code: "golden_numeric_mismatch", severity: "fail", detail: "wrong_humidity_step", expected: "0,1 %RH" });
  }

  if (factKey === "heating_air_max_temp" && !/(?:\+|плюс\s*)?40\s*°?\s*[сc]/iu.test(a)) {
    failures.push({
      code: "golden_numeric_mismatch",
      severity: "fail",
      detail: "wrong_heating_air_max_temp",
      expected: "+40 °C",
    });
  }

  if (factKey === "drying_mode_after_power_on") {
    if (!/осушен/i.test(a)) {
      failures.push({
        code: "golden_numeric_mismatch",
        severity: "fail",
        detail: "wrong_drying_mode_after_power_on",
        expected: "режим Осушения",
      });
    }
    if (!/3\s*час/i.test(a)) {
      failures.push({
        code: "golden_numeric_mismatch",
        severity: "fail",
        detail: "wrong_drying_mode_time",
        expected: "3 часов",
      });
    }
  }

  if (factKey === "loading_wall_clearance" && !/\b50\s*мм/i.test(a)) {
    failures.push({
      code: "golden_numeric_mismatch",
      severity: "fail",
      detail: "wrong_loading_wall_clearance",
      expected: "50 мм",
    });
  }

  if (factKey === "shelf_load_standard" && !/\b50\s*кг/i.test(a)) {
    failures.push({ code: "golden_numeric_mismatch", severity: "fail", detail: "wrong_shelf_load_standard", expected: "50 кг" });
  }

  if (factKey === "kit_shelf_count" && !/\b10\s*шт/i.test(a)) {
    failures.push({ code: "golden_numeric_mismatch", severity: "fail", detail: "wrong_kit_shelf_count", expected: "10 шт." });
  }

  return failures;
}

/**
 * Детерминированный ответ не соответствует теме вопроса (например, «180 кг» на «как осмотреть»).
 */
function deterministicTopicMismatchFailures(answer, intent = {}, message = "", factKeyOverride = null) {
  const q = String(message || intent.originalQuery || "");
  const a = String(answer || "");
  if (!a.trim()) {
    return [];
  }
  const factKey = factKeyOverride || resolveGoldenFactKey(q);
  const failures = [];

  if (factKey === "voltage_surge_not_specified" && !isVoltageSurgeQuery(q)) {
    failures.push({
      code: "deterministic_topic_mismatch",
      severity: "fail",
      detail: "voltage_surge_on_non_voltage_question",
    });
  }
  if (factKey === "mass" && /осмотр|внешн|визуальн/i.test(q)) {
    failures.push({
      code: "deterministic_topic_mismatch",
      severity: "fail",
      detail: "mass_on_inspection_question",
    });
  }
  if (
    /\b180\s*кг/i.test(a) &&
    /осмотр|внешн|визуальн|как\s+произвест/i.test(q) &&
    !/масс|вес|сколько\s+весит|каков\s+вес|какая\s+масса/i.test(q)
  ) {
    failures.push({
      code: "deterministic_topic_mismatch",
      severity: "fail",
      detail: "mass_answer_on_inspection_question",
    });
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
  if (/средн\w*\s+врем\w*\s+наработк\w*.*отказ|наработк\w*.*отказ|mtbf|mttf|17520|17\s*520/i.test(q)) {
    return true;
  }
  if (/средн\w*\s+срок\s+служб|срок\s+служб|назначенн\w*\s+срок/i.test(q) && /шкаф|sdb1106|издел/i.test(q)) {
    return true;
  }
  if (/регенерац/i.test(q) && /услов|актив|когда|часто/i.test(q)) {
    return true;
  }
  if (isKitShelfCountQuery(q)) {
    return true;
  }
  if (isBasicKitSupplyQuery(q)) {
    return true;
  }
  if (/желт|жёлт|красн/iu.test(q) && /индикатор|горит|свет|ламп/iu.test(q)) {
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
  isGoldenMatchPlausible,
  formatGoldenFactAnswer,
  goldenNumericMismatchFailures,
  deterministicTopicMismatchFailures,
  shouldInjectTable11,
  shouldInjectP1GoldenFacts,
  rowByKey,
  isShelfLoadQuery,
  isKitShelfCountQuery,
};
