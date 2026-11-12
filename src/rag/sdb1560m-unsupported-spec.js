const { MODEL_PARAM_NOT_SPECIFIED } = require("./prompts");
const { foreignSdbModels } = require("./sdb-model-scope");

const UNSUPPORTED_SPEC_RE =
  /(?:wi[\-\s]?fi|wifi|mqtt|modbus(?:\s*tcp)?|(?:^|\s)api(?:\s|$)|ip[\-\s]?адрес|процессор|мобильн[\p{L}]*\s+приложен|через\s+интернет|управл[\p{L}]*\s+через\s+интернет|интеграц[\p{L}]*\s+(?:api|с\s+api)|прошив|firmware|верси[\p{L}]*\s+прошив|bluetooth|блютуз|blockchain|блокчейн)/iu;

/** C4 policy: liter volumes for SDB1560NM are not verified in the PDF text layer — must not assert. */
const UNVERIFIED_VOLUME_LITERS_RE =
  /(?:внутренн[\p{L}]*\s+объ[её]м|объ[её]м\s+внутр|рабоч[^\n]{0,24}объ[её]м|полн[\p{L}]*\s+объ[её]м)/iu;

function isUnverifiedVolumeLiterQuery(message) {
  const m = String(message || "");
  if (!UNVERIFIED_VOLUME_LITERS_RE.test(m)) {
    return false;
  }
  if (/(?:литр|\bл\b|в\s+литрах)/iu.test(m)) {
    return true;
  }
  if (/точн[\p{L}]*\s+(?:внутренн|полн)/iu.test(m)) {
    return true;
  }
  if (/сколько\s+литр|объ[её]м[^\n]{0,40}(?:\d[\d\s]*\s*)?л\b/iu.test(m)) {
    return true;
  }
  return false;
}

function isUnverifiedSerialDecodeQuery(message) {
  const m = String(message || "");
  if (/расшифров|декодир|расшифровать\s+серийн|формат\s+серийн|порядков.*серийн/i.test(m)) {
    if (/где\s+(?:на|указан)|на\s+табличк|шильдик.*(?:где|указан)|место.*серийн/i.test(m)) {
      return false;
    }
    return true;
  }
  return false;
}

function isN2ConsumptionWithoutOptionQuery(message) {
  const m = String(message || "");
  if (!/азот/i.test(m)) {
    return false;
  }
  if (!/(?:расход|л\/мин|потреблен|давлен|бар)/i.test(m)) {
    return false;
  }
  return /без\s+(?:установленн|установ)[\p{L}]*\s*опци|опци[^\n]{0,32}(?:не\s+установ|отсутств)|шкаф[^\n]{0,24}без\s+опци/iu.test(m);
}

function isInsufficientWarehouseHumidityQuery(message) {
  const m = String(message || "");
  if (!/(?:влажност|\brh\b)/iu.test(m)) {
    return false;
  }
  return (
    /(?:хранен|склад)[^\n]{0,48}(?:плат|печат)|(?:плат|печат)[^\n]{0,48}(?:хранен|склад)/iu.test(m) &&
    /без\s+указан|без\s+класс|класс[^\n]{0,24}не\s+указан|ipc|ipc\s*класс/i.test(m)
  );
}

function isForeignModelSpecTransferQuery(message, equipment) {
  const eq = equipment || { id: "sdb1560m", name: "SDB1560 M" };
  if (!foreignSdbModels(message, eq).length) {
    return false;
  }
  return /(?:масс|вес|весит|сколько\s+вес|\bкг\b|габарит|размер|глубин|ширин|высот)/iu.test(String(message || ""));
}

function answerAssertsUnverifiedVolumeLiters(answer) {
  const a = String(answer || "");
  if (/1896|1\s*896|\b896\s*л|\b896\b[^\n]{0,12}л|2070|2\s*070|2\s*070\s*л/i.test(a)) {
    return true;
  }
  if (/внутренн[^\n]{0,32}объ[её]м[^\n]{0,48}\d[\d\s]{2,}\s*л/i.test(a)) {
    return true;
  }
  if (/полн[^\n]{0,32}объ[её]м[^\n]{0,48}\d[\d\s]{2,}\s*л/i.test(a)) {
    return true;
  }
  return false;
}

function isUnsupportedSdb1560mSpecQuery(message, equipment) {
  const m = String(message || "");
  if (UNSUPPORTED_SPEC_RE.test(m)) {
    return true;
  }
  if (isUnverifiedVolumeLiterQuery(m)) {
    return true;
  }
  if (isUnverifiedSerialDecodeQuery(m)) {
    return true;
  }
  if (isN2ConsumptionWithoutOptionQuery(m)) {
    return true;
  }
  if (isInsufficientWarehouseHumidityQuery(m)) {
    return true;
  }
  if (isForeignModelSpecTransferQuery(m, equipment)) {
    return true;
  }
  return false;
}

function buildUnsupportedSdb1560mSpecReply() {
  return MODEL_PARAM_NOT_SPECIFIED;
}

function enforceUnsupportedSpecAnswer(message, answer, equipment) {
  if (!isUnsupportedSdb1560mSpecQuery(message, equipment)) {
    return answer;
  }
  const a = String(answer || "");
  if (/не\s+указан|отсутств|Информация отсутствует/i.test(a)) {
    return a;
  }
  return buildUnsupportedSdb1560mSpecReply();
}

module.exports = {
  UNSUPPORTED_SPEC_RE,
  UNVERIFIED_VOLUME_LITERS_RE,
  isUnverifiedVolumeLiterQuery,
  answerAssertsUnverifiedVolumeLiters,
  isUnsupportedSdb1560mSpecQuery,
  buildUnsupportedSdb1560mSpecReply,
  enforceUnsupportedSpecAnswer,
  isN2ConsumptionWithoutOptionQuery,
  isUnverifiedSerialDecodeQuery,
  isForeignModelSpecTransferQuery,
  isInsufficientWarehouseHumidityQuery,
};
