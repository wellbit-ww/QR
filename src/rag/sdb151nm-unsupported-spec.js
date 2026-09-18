const catalog = require("../equipment/catalogs/sdb151-nm");
const { textMatches } = require("./catalog-engine");

const MODEL_PARAM_NOT_SPECIFIED = catalog.unsupportedSpec.reply;
const UNSUPPORTED_SPEC_RE = catalog.unsupportedSpec.match;

function isUnsupportedSdb151nmSpecQuery(message) {
  return textMatches(UNSUPPORTED_SPEC_RE, message);
}

function buildUnsupportedSdb151nmSpecReply() {
  return MODEL_PARAM_NOT_SPECIFIED;
}

module.exports = {
  MODEL_PARAM_NOT_SPECIFIED,
  UNSUPPORTED_SPEC_RE,
  isUnsupportedSdb151nmSpecQuery,
  buildUnsupportedSdb151nmSpecReply,
};
