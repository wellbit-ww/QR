/**
 * Пошаговая диагностика RAG: чанки (offline), intent, augmentation, retrieval (если есть POSTGRES_URL).
 * Запуск: node scripts/debug-rag-pipeline.js ["запрос"]
 */

const path = require("path");
const equipmentCatalog = require("../data/equipment.json");
const { getRagConfig } = require("../src/rag/config");
const { splitDocumentIntoChunks, extractFaultTableTextChunks } = require("../src/rag/chunking");
const { classifyQueryIntent } = require("../src/rag/query-intent");
const {
  expandRetrievalSynonyms,
  applyMandatoryRewriteRules,
} = require("../src/rag/query-rewriting");
const { rerankChunks } = require("../src/rag/rerank");
const { retrieveEquipmentContext } = require("../src/rag/retrieval");
const { loadPrimaryKnowledgeText } = require("./knowledge-content-loader");

const EQUIPMENT_ID = "sdb1106-nm";
const QUERY =
  process.argv[2] ||
  "Какой диапазон поддержания влажности внутри шкафа?";

/** Без побочных эффектов для регресса классификатора (печатается в отчёте всегда). */
const INTENT_REGRESSION_SAMPLES = [
  "Какая частота?",
  "Какое напряжение?",
  "Какой IP?",
  "Какой шаг установки влажности?",
  "Почему шкаф не выходит на влажность?",
  "Шкаф не включается",
  "Почему пищит шкаф?",
  "Влажность не падает",
  "Как пользоваться шкафом?",
  "Как начать работу?",
  "Первый запуск шкафа",
  "Как включить шкаф?",
  "Какие условия эксплуатации?",
  "Какой диапазон влажности?",
  "Какое атмосферное давление?",
  "Какое сопротивление заземления допускается?",
  "Какое питание?",
];

function offlineChunkMatchers(query) {
  const q = String(query || "").toLowerCase();
  if (/не\s+включается|не\s+запуска/i.test(q)) {
    return {
      label: "fault_power_on",
      test: (t) =>
        /симптом:\s*[^.]*не\s+включается/i.test(t) ||
        (/не\s+включается/i.test(t) && /питан|напряжен|предохранител/i.test(t)),
    };
  }
  if (/влажност/i.test(q) && /не\s+падает|не\s+снижается|не\s+выходит/i.test(q)) {
    return {
      label: "fault_humidity",
      test: (t) =>
        /симптом:\s*[^.]*влажност/i.test(t) ||
        (/не\s+выходит/i.test(t) && /влажност|уплотнител|осушител/i.test(t)),
    };
  }
  if (/\bшаг\b/i.test(q) && /влажност/i.test(q)) {
    return {
      label: "humidity_step",
      test: (t) => /0[,.]1\s*%?\s*RH|шаг/i.test(t) && /влажност|RH/i.test(t),
    };
  }
  return {
    label: "humidity_range",
    test: (t) => t.includes("0") && t.includes("80") && /RH/i.test(t),
  };
}

async function main() {
  const config = getRagConfig();
  const equipment = equipmentCatalog[EQUIPMENT_ID];

  const knowledge = await loadPrimaryKnowledgeText(EQUIPMENT_ID);
  let mdText = "";
  let step1SkipReason = null;
  let knowledgeSource = null;

  if (knowledge && knowledge.text.trim()) {
    mdText = knowledge.text;
    knowledgeSource = {
      path: path.join("knowledge", EQUIPMENT_ID, knowledge.sourcePath),
      sourceType: knowledge.sourceType,
      chars: mdText.length,
    };
  } else {
    step1SkipReason =
      `Нет файлов в knowledge/${EQUIPMENT_ID}/ (.md/.pdf) — offline chunking пропущен.`;
  }

  const legacyChunks = mdText
    ? splitDocumentIntoChunks(mdText, config.chunkSize, config.chunkOverlap)
    : [];
  const faultChunks = mdText
    ? extractFaultTableTextChunks(mdText, { equipmentName: equipment?.name })
    : [];
  const chunks = [...legacyChunks, ...faultChunks];

  const matcher = offlineChunkMatchers(QUERY);
  const foundChunks = chunks
    .filter((c) => matcher.test(c.content))
    .map((c) => ({
      text: c.content.slice(0, 800) + (c.content.length > 800 ? "…" : ""),
      chunkKind: c.metadata.chunkKind,
      tableToText: Boolean(c.metadata.tableToText),
      faultTableRow: c.metadata.faultTableRow,
      operatingModes: c.metadata.operatingModes,
      specSheetMerged: Boolean(c.metadata.specSheetMerged),
    }));

  const step1 = {
    matcher: matcher.label,
    knowledgeSource,
    faultTableChunksExtracted: faultChunks.length,
    foundChunks,
  };

  /** Шаг 4–5 */
  const intent = classifyQueryIntent(QUERY, equipment, { forceSafety: false });
  const originalQuery = QUERY.trim();
  const rewrittenQuery = applyMandatoryRewriteRules(originalQuery, originalQuery, [], equipment);
  const augmentedQuery = config.ragEmbedAugmentation
    ? `${intent.embeddingAugmentation}\n${expandRetrievalSynonyms(rewrittenQuery)}`
    : expandRetrievalSynonyms(rewrittenQuery);

  const step4 = {
    intentType: intent.intentType,
    queryOperatingModes: intent.queryOperatingModes,
  };

  const step5 = {
    originalQuery,
    rewrittenQuery,
    augmentedQuery,
    ragEmbedAugmentationEnvOn: config.ragEmbedAugmentation,
  };

  /** Шаг 2–3: нужна БД + embeddings */
  let step2 = { skipped: true, reason: "POSTGRES_URL не задан — см. offline чанки выше." };
  let step3 = { skipped: true };

  const retrievalQuery = expandRetrievalSynonyms(rewrittenQuery);

  if (config.postgresUrl) {
    const baseline = await retrieveEquipmentContext({
      equipmentId: EQUIPMENT_ID,
      query: retrievalQuery,
      topK: 10,
      intent: null,
      retrievalOverrides: {
        ragRerankEnabled: false,
        ragEmbedAugmentation: false,
      },
    });

    step2 = {
      query: retrievalQuery,
      topK: 10,
      note: "Без rerank; запрос с синонимами rewrite",
      results: baseline.chunks.map((ch) => ({
        text: ch.content.slice(0, 600) + (ch.content.length > 600 ? "…" : ""),
        score: Number(ch.score.toFixed(4)),
        tableToText: Boolean(ch.metadata?.tableToText),
      })),
      foundAny: baseline.chunks.length > 0,
      matchesMatcher: baseline.chunks.some((ch) => matcher.test(ch.content)),
    };

    const wide = await retrieveEquipmentContext({
      equipmentId: EQUIPMENT_ID,
      query: retrievalQuery,
      topK: 40,
      intent,
      retrievalOverrides: {
        ragRerankEnabled: false,
        ragEmbedAugmentation: config.ragEmbedAugmentation,
      },
    });

    const vectorsOrdered = [...wide.chunks].sort((a, b) => b.score - a.score);
    const reranked = rerankChunks(vectorsOrdered, intent);

    const matchIdx = (list) => list.findIndex((ch) => matcher.test(ch.content));

    const vecIdx = matchIdx(vectorsOrdered);
    const rrIdx = matchIdx(reranked);

    step3 = {
      note: "Кандидаты: vector-only vs после rerankChunks (как в проде)",
      targetChunkVectorRank: vecIdx >= 0 ? vecIdx + 1 : null,
      targetChunkRerankRank: rrIdx >= 0 ? rrIdx + 1 : null,
      candidates: reranked.slice(0, 12).map((ch) => ({
        text: ch.content.slice(0, 380) + (ch.content.length > 380 ? "…" : ""),
        vectorScore: ch.vectorScore != null ? Number(ch.vectorScore.toFixed(4)) : null,
        rerankScore: ch.rerankScore != null ? Number(ch.rerankScore.toFixed(4)) : null,
        chunkKind: ch.metadata?.chunkKind,
        tableToText: Boolean(ch.metadata?.tableToText),
        operatingModes: ch.metadata?.operatingModes,
      })),
    };
  }

  const report = {
    rootCauseHint: step1SkipReason
      ? step1SkipReason
      : foundChunks.length === 0
        ? `Offline: нет чанков для matcher=${matcher.label}. Проверьте ingest (fault table) и query rewrite.`
        : faultChunks.length > 0
          ? `Table-to-text: ${faultChunks.length} чанков неисправностей; matcher=${matcher.label} OK.`
          : "Чанки найдены offline; при пустом retrieval в проде — переиндексация и синонимы.",
    intentRegressionSamples: INTENT_REGRESSION_SAMPLES.map((q) => {
      const ci = classifyQueryIntent(q, equipment, { forceSafety: false });
      return {
        query: q,
        intentType: ci.intentType,
        focusParameter: ci.focusParameter,
        rewritePreview: expandRetrievalSynonyms(
          applyMandatoryRewriteRules(q, q, [], equipment)
        ).slice(0, 160),
      };
    }),
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
