/**
 * Пошаговая диагностика RAG: чанки (offline), intent, augmentation, retrieval (если есть POSTGRES_URL).
 * Запуск: node scripts/debug-rag-pipeline.js
 */

const fs = require("fs");
const path = require("path");
const equipmentCatalog = require("../data/equipment.json");
const { getRagConfig } = require("../src/rag/config");
const { splitDocumentIntoChunks } = require("../src/rag/chunking");
const { classifyQueryIntent } = require("../src/rag/query-intent");
const { rerankChunks } = require("../src/rag/rerank");
const { retrieveEquipmentContext } = require("../src/rag/retrieval");

const EQUIPMENT_ID = "sdb1106-nm";
const QUERY =
  process.argv[2] ||
  "Какой диапазон поддержания влажности внутри шкафа?";

async function main() {
  const config = getRagConfig();
  const equipment = equipmentCatalog[EQUIPMENT_ID];

  const mdPath = path.join(
    __dirname,
    "..",
    "knowledge",
    EQUIPMENT_ID,
    "Руководство SDB_2017 [22] 1106NM.md"
  );

  const mdText = fs.readFileSync(mdPath, "utf8");
  const chunks = splitDocumentIntoChunks(mdText, config.chunkSize, config.chunkOverlap);

  /** Шаг 1 */
  const foundChunks = chunks
    .filter((c) => {
      const t = c.content;
      return t.includes("0") && t.includes("80") && /RH/i.test(t);
    })
    .map((c) => ({
      text: c.content.slice(0, 800) + (c.content.length > 800 ? "…" : ""),
      chunkKind: c.metadata.chunkKind,
      operatingModes: c.metadata.operatingModes,
      specSheetMerged: Boolean(c.metadata.specSheetMerged),
    }));

  const step1 = { foundChunks };

  /** Шаг 4–5 */
  const intent = classifyQueryIntent(QUERY, equipment, { forceSafety: false });
  const originalQuery = QUERY.trim();
  const augmentedQuery = config.ragEmbedAugmentation
    ? `${intent.embeddingAugmentation}\n${originalQuery}`
    : originalQuery;

  const step4 = {
    intentType: intent.intentType,
    queryOperatingModes: intent.queryOperatingModes,
  };

  const step5 = {
    originalQuery,
    augmentedQuery,
    ragEmbedAugmentationEnvOn: config.ragEmbedAugmentation,
  };

  /** Шаг 2–3: нужна БД + embeddings */
  let step2 = { skipped: true, reason: "POSTGRES_URL не задан — см. offline чанки выше." };
  let step3 = { skipped: true };

  if (config.postgresUrl) {
    const baseline = await retrieveEquipmentContext({
      equipmentId: EQUIPMENT_ID,
      query: QUERY,
      topK: 10,
      intent: null,
      retrievalOverrides: {
        ragRerankEnabled: false,
        ragEmbedAugmentation: false,
      },
    });

    step2 = {
      query: QUERY,
      topK: 10,
      note: "Без rerank, без intent в запросе эмбеддинга, без augmentation",
      results: baseline.chunks.map((ch) => ({
        text: ch.content.slice(0, 600) + (ch.content.length > 600 ? "…" : ""),
        score: Number(ch.score.toFixed(4)),
      })),
      has080rh:
        baseline.chunks.some((ch) =>
          /\[?\s*0\s*[-–—]\s*80\s*RH\s*%?\]?/i.test(ch.content)
        ) || baseline.chunks.some((ch) => /0\s*-\s*80\s*RH/i.test(ch.content)),
    };

    const wide = await retrieveEquipmentContext({
      equipmentId: EQUIPMENT_ID,
      query: QUERY,
      topK: 40,
      intent,
      retrievalOverrides: {
        ragRerankEnabled: false,
        ragEmbedAugmentation: config.ragEmbedAugmentation,
      },
    });

    const vectorsOrdered = [...wide.chunks].sort((a, b) => b.score - a.score);
    const reranked = rerankChunks(vectorsOrdered, intent);

    const needle = (txt) =>
      /\[?\s*0\s*[-–—]\s*80\s*RH\s*%?\]?/i.test(txt) || /0\s*-\s*80\s*RH/i.test(txt);

    const vecIdx = vectorsOrdered.findIndex((ch) => needle(ch.content));
    const rrIdx = reranked.findIndex((ch) => needle(ch.content));

    step3 = {
      note: "Кандидаты: vector-only vs после rerankChunks (как в проде)",
      targetChunkVectorRank: vecIdx >= 0 ? vecIdx + 1 : null,
      targetChunkRerankRank: rrIdx >= 0 ? rrIdx + 1 : null,
      candidates: reranked.slice(0, 12).map((ch) => ({
        text: ch.content.slice(0, 380) + (ch.content.length > 380 ? "…" : ""),
        vectorScore: ch.vectorScore != null ? Number(ch.vectorScore.toFixed(4)) : null,
        rerankScore: ch.rerankScore != null ? Number(ch.rerankScore.toFixed(4)) : null,
        chunkKind: ch.metadata?.chunkKind,
        operatingModes: ch.metadata?.operatingModes,
      })),
    };
  }

  const report = {
    rootCauseHint:
      foundChunks.length === 0
        ? "Чанк с 0…80 RH не найден в offline — проверить chunking (FIX_CHUNKING)."
        : foundChunks.some((f) => f.specSheetMerged)
          ? "Спецификации склеены (spec_sheet merge); если раньше RH и IP были в разных чанках — это была основная потеря контекста."
          : "Чанки содержат маркеры; при симптомах в проде проверить embeddings/rerank.",
    step1_chunkSearch: step1,
    step2_retrievalNoRerank: step2,
    step3_rerankInspect: step3,
    step4_intent: step4,
    step5_augmentation: step5,
    configSnapshot: {
      chunkSize: config.chunkSize,
      chunkOverlap: config.chunkOverlap,
      ragEmbedAugmentation: config.ragEmbedAugmentation,
      ragRerankEnabled: config.ragRerankEnabled,
      ragAnswerValidation: config.ragAnswerValidation,
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
