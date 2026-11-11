const assert = require("node:assert/strict");
const { isUnsupportedSdb1560mSpecQuery, buildUnsupportedSdb1560mSpecReply } = require("../src/rag/sdb1560m-unsupported-spec");

const msg = "Какая версия прошивки установлена с завода?";
assert.equal(isUnsupportedSdb1560mSpecQuery(msg), true);
assert.match(buildUnsupportedSdb1560mSpecReply(), /не указан/u);
console.log("test-sdb1560m-task33-unsupported-firmware: OK");
