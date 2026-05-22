const SDB1106NM_PRODUCT_MODEL = "SDB1106NM";

const FOREIGN_MODEL_REPLY =
  "Я специализируюсь только на модели SDB1106NM. Могу подсказать параметры именно для этого устройства.";

const OTHER_SDB_MODEL_RE = /\bSDB(?!1106(?:\s*NM|NM|-NM)?\b)(\d{3,4})(?:\s*NM|\s*-\s*NM|NM|M)?\b/giu;

function detectForeignSdbModelQuery(text) {
  const s = String(text || "");
  if (!/\bSDB\d/i.test(s)) {
    return false;
  }
  OTHER_SDB_MODEL_RE.lastIndex = 0;
  return OTHER_SDB_MODEL_RE.test(s);
}

function contextHasCompetingSdbModels(retrievalContext) {
  const ctx = String(retrievalContext || "");
  const hasTarget = /\bSDB1106(?:\s*NM|NM|-NM)?\b/i.test(ctx) || /\bSDB1106\b/i.test(ctx);
  OTHER_SDB_MODEL_RE.lastIndex = 0;
  const hasForeign = OTHER_SDB_MODEL_RE.test(ctx);
  return hasTarget && hasForeign;
}

function asksStorageModePower(userMessage) {
  return /режим\s+хранен|мощност[\p{L}\s]{0,50}хранен|2\.2\.7\.1|потребляем[\p{L}\s]{0,30}хранен|в\s+режиме\s+хранен/iu.test(
    String(userMessage || ""),
  );
}

function contextSupportsStorageMode8W(retrievalContext) {
  const ctx = String(retrievalContext || "");
  return (
    (/режим\s+хранен/i.test(ctx) || /2\.2\.7\.1/i.test(ctx)) &&
    /(?:не\s+более\s+)?8\s*Вт/i.test(ctx)
  );
}

function asksShelfLoadCapacity(userMessage) {
  return /полк|нагрузк|масс|выдерж|кг\b|сколько\s+вес/i.test(String(userMessage || ""));
}

/** Обзор режимов работы (разд. 2.2), а не точечный вопрос про мощность одного режима. */
function asksOperatingModesOverview(userMessage) {
  const msg = String(userMessage || "");
  if (
    asksStorageModePower(msg) &&
    !/режим[а-яё]*\s+работ|какие\s+режим|виды\s+режим|перечисл|описан|назначен|2\.2\b|раздел\s+2\.2|осушени[ея].*регенерац|регенерац.*осушени/i.test(
      msg,
    )
  ) {
    return false;
  }
  return /режим[а-яё]*\s+работ|какие\s+режим|виды\s+режим|перечисл.*режим|описан.*режим|назначен.*режим|п\.?\s*2\.2\b|раздел\s+2\.2|что\s+такое\s+режим|осушени[ея]\s+и\s+регенерац|регенерац.*хранен/i.test(
    msg,
  );
}

function asksHowToConfigure(userMessage) {
  return /как\s+(?:настроить|установить|изменить|задать|включить)|инструкц|пошагов|настройк\s+(?:меню|диапазон|азот)/iu.test(
    String(userMessage || ""),
  );
}

function asksNitrogenConcentration(userMessage) {
  return /азот|n₂|n2|концентрац[\p{L}]*\s+азот|подач[\p{L}]*\s+азот/iu.test(String(userMessage || ""));
}

function anchorQueryToSdb1106nm(query) {
  let q = String(query || "").trim();
  if (!q) {
    return SDB1106NM_PRODUCT_MODEL;
  }
  q = q.replace(OTHER_SDB_MODEL_RE, " ").replace(/\s+/g, " ").trim();
  if (!/\bSDB1106\s*NM\b/i.test(q) && !/\bSDB1106NM\b/i.test(q)) {
    q = /\bSDB1106\b/i.test(q) ? q.replace(/\bSDB1106\b/gi, SDB1106NM_PRODUCT_MODEL) : `${q} ${SDB1106NM_PRODUCT_MODEL}`;
  }
  return q.replace(/\s+/g, " ").trim();
}

module.exports = {
  SDB1106NM_PRODUCT_MODEL,
  FOREIGN_MODEL_REPLY,
  detectForeignSdbModelQuery,
  contextHasCompetingSdbModels,
  asksStorageModePower,
  contextSupportsStorageMode8W,
  asksShelfLoadCapacity,
  asksOperatingModesOverview,
  asksHowToConfigure,
  asksNitrogenConcentration,
  anchorQueryToSdb1106nm,
};
