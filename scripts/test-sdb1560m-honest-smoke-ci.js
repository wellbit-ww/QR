process.env.RAG_HONEST_EQUIPMENT = process.env.RAG_HONEST_EQUIPMENT || "sdb1560m";
process.env.RAG_PURE = process.env.RAG_PURE || "1";
process.env.HONEST_SMOKE_REQUIRE_HTTP = "1";
require("./test-sdb1560m-honest-smoke.js");
