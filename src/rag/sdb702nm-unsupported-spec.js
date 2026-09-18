const { MODEL_PARAM_NOT_SPECIFIED } = require("./prompts");

const UNSUPPORTED_SPEC_RE =
  /(?:wi[\-\s]?fi|wifi|mqtt|modbus(?:\s*tcp)?|(?:^|\s)api(?:\s|$)|ip[\-\s]?адрес|процессор|мобильн[\p{L}]*\s+приложен|через\s+интернет|управл[\p{L}]*\s+через\s+интернет|интеграц[\p{L}]*\s+(?:api|с\s+api))/iu;

function isUnsupportedSdb702nmSpecQuery(message) {
  return UNSUPPORTED_SPEC_RE.test(String(message || ""));
}

function buildUnsupportedSdb702nmSpecReply() {
  return MODEL_PARAM_NOT_SPECIFIED;
}

module.exports = {
  UNSUPPORTED_SPEC_RE,
  isUnsupportedSdb702nmSpecQuery,
  buildUnsupportedSdb702nmSpecReply,
};
