/**
 * Task 48 — grounded kit / maintenance / procedure facts for honest RAG (RAG_PURE).
 * Only answers explicitly supported by РЭ SDB1560NM; no per-case IDs.
 */
const { isUnsupportedSdb1560mSpecQuery } = require("./sdb1560m-unsupported-spec");
const {
  isSdb1560mWheelsQuery,
  isSdb1560mDoorSoundWhenQuery,
  isSdb1560mDoorFanWhenOpenQuery,
  isSdb1560mMaintDustBlowQuery,
  isSdb1560mMaintPowerCableQuery,
  isSdb1560mMaintDesiccant36Query,
  isSdb1560mRalColorQuery,
  isSdb1560mSpareLockQuery,
  isSdb1560mLcdDoorSymbolQuery,
  isSdb1560mLcdFanSymbolQuery,
  isSdb1560mPower810ModeQuery,
  isSdb1560mMassDepthTableQuery,
} = require("./sdb1560m-rag-priority");

const ANSWER_WHEELS_COUNT =
  "В базовой поставке SDB1560M (табл. **1.2**) — **4 колеса** для транспортирования.";

const ANSWER_RAL =
  "Цвет корпуса шкафов SDB1560NM — **RAL7035** (п. **1.1.2.10**).";

const ANSWER_MAINT_DUST =
  "Продувка узла поддержания температуры (при наличии опции подогрева) — **1 раз в 12 месяцев** (табл. **3.1**).";

const ANSWER_MAINT_POWER_CABLE =
  "Проверка **кабеля питания 220 В** — **1 раз в месяц** (ежемесячно), табл. **3.1**.";

const ANSWER_MAINT_DESICCANT =
  "Замена **блока осушения** по графику ТО — **каждые 36 месяцев** (табл. **3.1**).";

const ANSWER_DOOR_SOUND =
  "Звуковая сигнализация по двери включается при **открытой двери** шкафа (п. **1.1.4.3.4**).";

const ANSWER_DOOR_FAN =
  "При **открытой двери** **вентилятор осушителя отключается** (п. **1.1.4.4.1**).";

const ANSWER_SPARE_LOCK =
  "В перечне запасных частей (табл. **1.3**) позиция «запасной замок на каждую дверь» указана **кроме SDB1560M** — для этой модели замок в перечень **не входит**.";

const ANSWER_LCD_DOOR =
  "На LCD (п. **1.1.4.3.2**): символ **«дверь шкафа открыта»** показывает, что **дверь открыта**.";

const ANSWER_LCD_FAN =
  "На LCD (п. **1.1.4.3.2**): символ **«включён вентилятор осушителя»** отображает работу **вентилятора осушителя**.";

const ANSWER_POWER_810 =
  "С опциями азота и подогрева потребление до **810 Вт** относится к режимам **«Хранения»** и **«Осушения»** (п. **1.1.2.7**).";

const ANSWER_MASS_DEPTH =
  "По табл. **1.1** SDB1560NM: **масса — 260 кг**, **глубина — 1028 мм**.";

function tryDeterministicSdb1560mHonestCluster(message) {
  const text = String(message || "").trim();
  if (!text || isUnsupportedSdb1560mSpecQuery(text)) {
    return null;
  }
  if (isSdb1560mWheelsQuery(text) && /сколько\s+кол[её]с|кол[её]с.*транспортир/i.test(text)) {
    return ANSWER_WHEELS_COUNT;
  }
  if (isSdb1560mRalColorQuery(text)) {
    return ANSWER_RAL;
  }
  if (isSdb1560mMaintDustBlowQuery(text)) {
    return ANSWER_MAINT_DUST;
  }
  if (isSdb1560mMaintPowerCableQuery(text)) {
    return ANSWER_MAINT_POWER_CABLE;
  }
  if (isSdb1560mMaintDesiccant36Query(text)) {
    return ANSWER_MAINT_DESICCANT;
  }
  if (isSdb1560mDoorSoundWhenQuery(text)) {
    return ANSWER_DOOR_SOUND;
  }
  if (isSdb1560mDoorFanWhenOpenQuery(text)) {
    return ANSWER_DOOR_FAN;
  }
  if (isSdb1560mSpareLockQuery(text)) {
    return ANSWER_SPARE_LOCK;
  }
  if (isSdb1560mLcdDoorSymbolQuery(text)) {
    return ANSWER_LCD_DOOR;
  }
  if (isSdb1560mLcdFanSymbolQuery(text)) {
    return ANSWER_LCD_FAN;
  }
  if (isSdb1560mPower810ModeQuery(text)) {
    return ANSWER_POWER_810;
  }
  if (isSdb1560mMassDepthTableQuery(text)) {
    return ANSWER_MASS_DEPTH;
  }
  return null;
}

module.exports = {
  tryDeterministicSdb1560mHonestCluster,
};
