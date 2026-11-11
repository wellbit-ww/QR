const { MODEL_PARAM_NOT_SPECIFIED } = require("./prompts");

const UNSUPPORTED_SPEC_RE =
  /(?:wi[\-\s]?fi|wifi|mqtt|modbus(?:\s*tcp)?|(?:^|\s)api(?:\s|$)|ip[\-\s]?адрес|процессор|мобильн[\p{L}]*\s+приложен|через\s+интернет|управл[\p{L}]*\s+через\s+интернет|интеграц[\p{L}]*\s+(?:api|с\s+api)|прошив|firmware|верси[\p{L}]*\s+прошив)/iu;

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

function isUnsupportedSdb1560mSpecQuery(message) {
  const m = String(message || "");
  return UNSUPPORTED_SPEC_RE.test(m) || isUnverifiedVolumeLiterQuery(m);
}

function buildUnsupportedSdb1560mSpecReply() {
  return MODEL_PARAM_NOT_SPECIFIED;
}

module.exports = {
  UNSUPPORTED_SPEC_RE,
  UNVERIFIED_VOLUME_LITERS_RE,
  isUnverifiedVolumeLiterQuery,
  answerAssertsUnverifiedVolumeLiters,
  isUnsupportedSdb1560mSpecQuery,
  buildUnsupportedSdb1560mSpecReply,
};
