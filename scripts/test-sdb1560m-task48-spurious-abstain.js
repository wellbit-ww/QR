const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { tryHonestWhitelistedDeterministicAnswer: honestDet } = require("../src/rag/honest-rag-deterministic");
const { tryDeterministicSdb1560mHonestCluster } = require("../src/rag/sdb1560m-honest-cluster-facts");
const {
  resolveExtractKind: resolveKind,
  extractSatisfiesQuery: satisfies,
  tryHonestContextualNumericFact: tryExtract,
} = require("../src/rag/honest-contextual-extract");

const EQUIPMENT = { id: "sdb1560m", name: "SDB1560 M" };

const CLUSTER = JSON.parse(
  fs.readFileSync(path.join(__dirname, "eval/sdb1560m-generalization-v1.json"), "utf8"),
).cases.filter((c) =>
  [
    "gen.num.ral",
    "gen.kit.wheels",
    "gen.maint.dust-months",
    "gen.maint.power-cable",
    "gen.proc.sound-door",
    "gen.proc.door-fan-off",
    "gen.multi.mass-depth",
    "gen.para.36m",
    "gen.disc.810-storage-vs-dry",
    "gen.spare.lock-excluded",
    "gen.proc.open-door-symbol",
    "gen.proc.fan-symbol",
  ].includes(c.id),
);

const CORPUS = fs.readFileSync(
  path.join(__dirname, "../knowledge/sdb1560m/golden-facts-sdb1560m.md"),
  "utf8",
);
const PDF_SNIPPET = `
табл. 1.1 масса 260 кг габариты 1202 × 1693 × 1028 мм
табл. 1.2 4 колеса для транспортирования
1.1.2.10 Цвет Шкафов RAL7035
1.1.2.7 хранение 8 Вт осушение 40 Вт с опциями 810 Вт
1.1.4.3.2 символ дверь открыта вентилятор осушителя
1.1.4.3.4 звуковой сигнал открытой двери
1.1.4.4.1 вентилятор осушителя отключается при открытой двери
табл. 3.1 замена блока осушения 36 месяцев кабель 220 В ежемесячно продувка 12 месяцев
Запасной замок на каждую дверь (кроме SDB1560M) 1
`;
const corpus = `${CORPUS}\n${PDF_SNIPPET}`;

function expectFact(answer, pattern, label) {
  assert.ok(answer, `${label}: empty`);
  assert.doesNotMatch(answer, /не\s+указан|отсутств|параметр не указан/ui, `${label}: spurious abstain`);
  assert.match(answer, pattern, `${label}: missing fact — ${answer.slice(0, 120)}`);
}

for (const c of CLUSTER) {
  const msg = c.message;
  const patterns = c.requiredFacts.map((f) => new RegExp(f.claimPattern, "i"));
  const det = honestDet(msg, {}, EQUIPMENT) || tryDeterministicSdb1560mHonestCluster(msg);
  expectFact(det, patterns[0], c.id);

  const kind = resolveKind(msg, {});
  if (kind) {
    const ex = tryExtract({
      equipmentId: "sdb1560m",
      message: msg,
      intent: {},
      promptChunks: [{ content: corpus, sourceDoc: "Руководство SDB1560NM.pdf" }],
      retrievalContext: corpus,
      parameterFactLlm: true,
      priorAnswer: "В документации на данную модель этот параметр не указан.",
    });
    if (ex) {
      for (const p of patterns) {
        assert.match(ex, p, `${c.id} extract ${kind}`);
      }
    }
  }
}

// mass-depth extract satisfaction
assert.equal(
  satisfies(
    "Назовите массу и глубину SDB1560М по Таблице 1.1.",
    "mass_and_dimensions",
    "**Масса** 260 кг, **глубина** — **1028 мм**",
  ),
  true,
);

console.log(`PASS task48 spurious-abstain cluster (${CLUSTER.length} cases)`);
