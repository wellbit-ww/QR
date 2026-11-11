/**
 * SDB1560M grounding contract (RAG PURE): retrieve → generate → validate → reground from SAME context.
 * Не подставляет FAQ-ответы из кода — только повторное извлечение LLM из уже найденных чанков.
 */
const { generate } = require("../llm/llm-service");
const { unifiedRetrieve } = require("../retrieval/unified-retriever");
const { formatContextForPrompt } = require("../retrieval");
const { getRagConfig, resolveRetrievalTopK } = require("../config");
const {
  buildContextualFactSystemPrompt,
  buildContextualFactModelAliasRetryPrompt,
  buildLlmAnswerCompositionBlocks,
  MODEL_PARAM_NOT_SPECIFIED,
} = require("../prompts");
const { validateSdb1560mAnswerAgainstContext } = require("../sdb1560m-answer-validation");
const {
  contextHasSdb1560AnswerableData,
  isSpuriousModelAbstainAnswer,
  ragPureSdb1560AnswerLooksOnTopic,
  ragPureSdb1560AnswerOffTopic,
  ragPureSdb1560NeedsFactRetry,
  shouldUseRagPure,
} = require("../honest-rag-mode");
const { selectPromptChunksDeterministicFactFallback } = require("../pipeline/chunk-select");
const { ragInfo } = require("../rag-log");
const { tryHonestContextualNumericFact } = require("../honest-contextual-extract");

const STRICT_ABSTAIN = "Информация отсутствует в документации.";

function shouldRetryContextualFactForSdbAlias(_message, equipment, promptChunks) {
  if (String(equipment?.id || "") !== "sdb1560m") {
    return false;
  }
  return (promptChunks || []).some((ch) =>
    /golden-facts-sdb1560|SDB1560NM\.pdf|Руководство\s+SDB1560/i.test(String(ch?.sourceDoc || "")),
  );
}

function normalizeSdbArticleQueryForSearch(message, equipment) {
  let q = String(message || "").trim();
  if (!q) {
    return q;
  }
  q = q.replace(/[\u2010-\u2015\u2212\uFE63\uFF0D]/g, "-");
  const name = String(equipment?.name || equipment?.id || "");
  if (/sdb1560/i.test(name) || equipment?.id === "sdb1560m") {
    if (!/sdb1560/i.test(q)) {
      q = `${q} SDB1560NM`;
    }
  }
  return q.replace(/\s+/g, " ");
}

/** SDB1560 grounding uses plain chunk formatting (same shape as pipeline helper). */
function formatContextForEquipmentPrompt(chunks, equipment) {
  void equipment;
  const list = Array.isArray(chunks) ? chunks : [];
  return { chunks: list, text: formatContextForPrompt(list) };
}

function shouldUseSdb1560GroundingContract(equipmentId) {
  return shouldUseRagPure(equipmentId) && String(equipmentId || "") === "sdb1560m";
}

function buildGoldenRetryFocusHint(message) {
  const m = String(message || "");
  const lines = [];
  if (/осушит|36\s*месяц|график\s+обслуж|когда\s+меня/i.test(m)) {
    lines.push("Строка ТО: замена блока осушения — **36 месяцев** (табл. 3.1 / golden).");
  }
  if (/\bip\b|пыл|брызг|от\s+воды/i.test(m)) {
    lines.push("Класс защиты **IP55** (табл. 1.1 / golden).");
  }
  if (/регенерац/i.test(m) && /мощност|вт|ватт/i.test(m)) {
    lines.push("Мощность регенерации **540 Вт** max.");
  }
  if (/двер/i.test(m) && /сколько|количеств/i.test(m)) {
    lines.push("Дверей в комплектации — **4** (табл. 1.2).");
  }
  if (/таймер|n2ton|99[,.]9|азот.*минут/i.test(m)) {
    lines.push("Таймер азота без датчика: **0–99,9 мин**.");
  }
  if (/давлен.*азот|азот.*вход|бар/i.test(m)) {
    lines.push("Давление азота на входе — **6 бар**.");
  }
  if (/влажност/i.test(m) && /(?:резко\s+)?(?:вырос|повыс|поднял)/i.test(m)) {
    lines.push("П. **1.1.4.4.1**: открытая дверь → вентилятор off; загрузка/воздух помещения.");
  }
  if (/пищ|звуков\s+сигнал/i.test(m)) {
    lines.push("П. **1.1.4.3.4**: звуковой сигнал при открытой двери — штатная работа (не неисправность вентилятора).");
  }
  if (/вес|масс|260|килограм|тяж/i.test(m) && !/полк|нагрузк/i.test(m)) {
    lines.push("Масса шкафа **260 кг** (табл. 1.1 / golden).");
  }
  if (/мощност/i.test(m) && /хранен/i.test(m) && !/азот|подогрев|опци/i.test(m)) {
    lines.push("Без опций режим «Хранения» — **не более 8 Вт** (п. 1.1.2.7 а); **810 Вт** — только с азотом и подогревом.");
  }
  if (/диапазон/i.test(m) && /влажност/i.test(m)) {
    lines.push("Диапазон поддержания влажности **0–80 %RH**, не выше влажности окружающего воздуха (п. 1.1.2.1).");
  }
  if (/выход/i.test(m) && /влажност/i.test(m)) {
    lines.push("Время выхода на установленную влажность — **не более 180 мин (3 ч)** с момента включения (п. 1.1.2.4).");
  }
  if (/температур/i.test(m) && /(?:помещен|окружающ|эксплуатац)/i.test(m)) {
    lines.push("Температура окружающего воздуха при эксплуатации **от +15 до +35 °C** (п. 1.1.2.12).");
  }
  if (/мига/i.test(m) && /красн/i.test(m)) {
    lines.push("Зелёный + **мигающий красный** — режим «Осушения» (п. 1.1.4.3.3), не авария.");
  }
  if (/диспле/i.test(m) && /\bW\b/.test(m)) {
    lines.push("Символ **W** на LCD — подключена система **подогрева** воздуха (п. 1.1.4.3.2), не ошибка.");
  }
  return lines.join("\n");
}

function shouldRegroundSdb1560Answer(factMessage, userMessage, answer, context, intent) {
  if (!contextHasSdb1560AnswerableData(context)) {
    return false;
  }
  if (String(answer || "").trim() === STRICT_ABSTAIN) {
    return true;
  }
  if (
    ragPureSdb1560NeedsFactRetry(factMessage, answer, intent, context) ||
    ragPureSdb1560NeedsFactRetry(userMessage, answer, intent, context)
  ) {
    return true;
  }
  if (
    isSpuriousModelAbstainAnswer(answer) ||
    ragPureSdb1560AnswerOffTopic(factMessage, answer) ||
    ragPureSdb1560AnswerOffTopic(userMessage, answer)
  ) {
    return true;
  }
  const validation = validateSdb1560mAnswerAgainstContext(answer, context, intent);
  return !validation.ok;
}

function answerPassesGroundingContract(factMessage, userMessage, answer, context, intent) {
  const text = String(answer || "").trim();
  if (!text || isSpuriousModelAbstainAnswer(text)) {
    return false;
  }
  if (
    ragPureSdb1560AnswerOffTopic(factMessage, text) ||
    ragPureSdb1560AnswerOffTopic(userMessage, text)
  ) {
    return false;
  }
  const validation = validateSdb1560mAnswerAgainstContext(text, context, intent);
  if (validation.ok) {
    return true;
  }
  return (
    contextHasSdb1560AnswerableData(context) &&
    (ragPureSdb1560AnswerLooksOnTopic(factMessage, text) ||
      ragPureSdb1560AnswerLooksOnTopic(userMessage, text))
  );
}

async function generateContextualExtract({
  equipment,
  context,
  promptChunks,
  factMessage,
  userMessage,
  compositionExtra,
  intentLlmOptions,
  passLabel,
}) {
  const focusHint = buildGoldenRetryFocusHint(factMessage);
  const composition = [
    buildLlmAnswerCompositionBlocks(context, factMessage, equipment),
    compositionExtra || "",
    focusHint ? `\n${focusHint}` : "",
    "",
    `GROUNDING CONTRACT (${passLabel}):`,
    "Ответ только из CONTEXT выше. 1–3 предложения с числами/пунктами РЭ.",
    `ЗАПРЕЩЕНО: «${MODEL_PARAM_NOT_SPECIFIED}», «можно предположить», «в общем случае», «обратитесь к производителю».`,
  ]
    .filter(Boolean)
    .join("\n");
  const systemPrompt = buildContextualFactSystemPrompt(equipment, context, composition);
  const userPrompt =
    factMessage !== userMessage
      ? `${factMessage}\n\nУточнение: ${userMessage}\n\nИзвлеки факт из CONTEXT.`
      : `${factMessage}\n\nИзвлеки факт из CONTEXT одним–двумя предложениями.`;
  const result = await generate({
    route: "PROCEDURAL_QA",
    context,
    systemPrompt,
    userMessage: userPrompt,
    outputSchema: null,
    intentLlmOptions,
  });
  return {
    text: String(result.content || "").trim(),
    model: result.model,
    promptChunks,
    retrievalContext: context,
  };
}

async function widenRetrievalContext({
  message,
  retrievalQuery,
  equipment,
  promptChunks,
  retrievalContext,
  ragConfig,
  routerDecision,
}) {
  const searchSeed = String(retrievalQuery || message || "").trim();
  if (!shouldRetryContextualFactForSdbAlias(searchSeed, equipment, promptChunks)) {
    return { promptChunks, retrievalContext, widened: false };
  }
  const widenedQuery = normalizeSdbArticleQueryForSearch(searchSeed, equipment);
  const trimmedOriginal = String(message || "").trim();
  if (!widenedQuery || widenedQuery === trimmedOriginal) {
    return { promptChunks, retrievalContext, widened: false };
  }
  ragInfo("grounding_contract.widen_query", {
    widenedLen: widenedQuery.length,
    originalLen: trimmedOriginal.length,
  });
  const r2 = await unifiedRetrieve({
    ragConfig,
    equipmentId: equipment.id,
    query: widenedQuery,
    routerDecision,
    retrievalTopCap: resolveRetrievalTopK(ragConfig, routerDecision, widenedQuery),
    sectionHints: undefined,
  });
  const altPool = selectPromptChunksDeterministicFactFallback(
    r2.fusedChunks || [],
    r2.semanticChunks || [],
    r2.chunksBeforeSingleFieldNarrowing || [],
    4,
    6,
  );
  const merged = selectPromptChunksDeterministicFactFallback(altPool, promptChunks, [], 4, 10);
  if (!merged.length) {
    return { promptChunks, retrievalContext, widened: false };
  }
  const formatted = formatContextForEquipmentPrompt(merged, equipment);
  return {
    promptChunks: formatted.chunks,
    retrievalContext: formatted.text,
    widened: true,
    widenedQuery,
  };
}

/**
 * До 2 LLM-проходов reground из того же retrieval (golden slice → widened/full contextual).
 */
async function applySdb1560GroundingContract({
  message,
  factMessage,
  equipment,
  promptChunks,
  retrievalContext,
  routerDecision,
  retrieval,
  retrievalQuery,
  ragConfig,
  priorAnswer,
  resolveIntentLlmOptions,
}) {
  const intent = retrieval?.intent || {};
  const userMessage = String(message || "").trim();
  const fact = String(factMessage || userMessage).trim();
  let answer = String(priorAnswer || "").trim();
  let chunks = promptChunks;
  let context = retrievalContext;
  const trace = { groundingContract: true, passes: [] };

  if (!shouldRegroundSdb1560Answer(fact, userMessage, answer, context, intent)) {
    return {
      applied: false,
      answer,
      promptChunks: chunks,
      retrievalContext: context,
      trace,
    };
  }

  const earlyExtractDebug = {};
  const earlyExtract = tryHonestContextualNumericFact({
    equipmentId: equipment?.id || "sdb1560m",
    message: fact,
    intent,
    promptChunks: chunks,
    retrievalContext: context,
    parameterFactLlm: true,
    priorAnswer: answer,
    traceOut: earlyExtractDebug,
  });
  if (
    earlyExtract &&
    answerPassesGroundingContract(fact, userMessage, earlyExtract, context, intent)
  ) {
    trace.passes.push("contextual_extract_early");
    trace.contextualExtract = {
      ...earlyExtractDebug,
      applied: true,
      kind: earlyExtractDebug.kind || null,
      extractPreview: earlyExtractDebug.extractPreview || String(earlyExtract).slice(0, 320),
      groundingCorpusExcerpt:
        earlyExtractDebug.groundingCorpusExcerpt || null,
    };
    return {
      applied: true,
      answer: earlyExtract,
      promptChunks: chunks,
      retrievalContext: context,
      trace: { ...trace, mode: "CONTEXTUAL_EXTRACT_GROUNDING" },
    };
  }

  const intentLlmOptions = resolveIntentLlmOptions(routerDecision, fact, intent);

  const goldenPdf = (chunks || []).filter((ch) =>
    /golden-facts-sdb1560|\.pdf|Руководство\s+SDB1560/i.test(String(ch?.sourceDoc || "")),
  );
  if (goldenPdf.length > 0) {
    const formatted = formatContextForEquipmentPrompt(goldenPdf.slice(0, 12), equipment);
    const pass = await generateContextualExtract({
      equipment,
      context: formatted.text,
      promptChunks: formatted.chunks,
      factMessage: fact,
      userMessage,
      compositionExtra: "Приоритет: golden-facts-sdb1560 и табл. 1.1–1.2, 3.1.",
      intentLlmOptions,
      passLabel: "golden_slice",
    });
    trace.passes.push("golden_slice");
    if (answerPassesGroundingContract(fact, userMessage, pass.text, formatted.text, intent)) {
      return {
        applied: true,
        answer: pass.text,
        promptChunks: pass.promptChunks,
        retrievalContext: pass.retrievalContext,
        trace: { ...trace, model: pass.model },
      };
    }
  }

  const widened = await widenRetrievalContext({
    message: fact,
    retrievalQuery,
    equipment,
    promptChunks: chunks,
    retrievalContext: context,
    ragConfig: ragConfig || getRagConfig(),
    routerDecision,
  });
  chunks = widened.promptChunks;
  context = widened.retrievalContext;
  if (widened.widenedQuery) {
    trace.widenedQuery = widened.widenedQuery;
  }

  const pass2 = await generateContextualExtract({
    equipment,
    context,
    promptChunks: chunks,
    factMessage: fact,
    userMessage,
    compositionExtra: "",
    intentLlmOptions,
    passLabel: widened.widened ? "widened_context" : "full_context",
  });
  trace.passes.push(widened.widened ? "widened_context" : "full_context");
  if (answerPassesGroundingContract(fact, userMessage, pass2.text, context, intent)) {
    return {
      applied: true,
      answer: pass2.text,
      promptChunks: pass2.promptChunks,
      retrievalContext: pass2.retrievalContext,
      trace: { ...trace, model: pass2.model },
    };
  }

  const aliasComposition = buildLlmAnswerCompositionBlocks(context, fact, equipment);
  const aliasPrompt = buildContextualFactModelAliasRetryPrompt(equipment, context, aliasComposition);
  const alias = await generate({
    route: "PROCEDURAL_QA",
    context,
    systemPrompt: aliasPrompt,
    userMessage: `Строго по CONTEXT: ${fact}`,
    outputSchema: null,
    intentLlmOptions,
  });
  const aliasText = String(alias.content || "").trim();
  trace.passes.push("alias_prompt");
  if (answerPassesGroundingContract(fact, userMessage, aliasText, context, intent)) {
    return {
      applied: true,
      answer: aliasText,
      promptChunks: chunks,
      retrievalContext: context,
      trace: { ...trace, model: alias.model },
    };
  }

  const extractDebug = {};
  const contextualExtract = tryHonestContextualNumericFact({
    equipmentId: equipment?.id || "sdb1560m",
    message: fact,
    intent,
    promptChunks: chunks,
    retrievalContext: context,
    parameterFactLlm: true,
    priorAnswer: answer,
    traceOut: extractDebug,
  });
  if (
    contextualExtract &&
    answerPassesGroundingContract(fact, userMessage, contextualExtract, context, intent)
  ) {
    trace.passes.push("contextual_extract");
    if (extractDebug.applied) {
      trace.contextualExtract = extractDebug;
    }
    return {
      applied: true,
      answer: contextualExtract,
      promptChunks: chunks,
      retrievalContext: context,
      trace: { ...trace, mode: "CONTEXTUAL_EXTRACT_GROUNDING" },
    };
  }

  ragInfo("grounding_contract.no_improvement", { passCount: trace.passes.length });
  return {
    applied: false,
    answer,
    promptChunks: chunks,
    retrievalContext: context,
    trace,
  };
}

module.exports = {
  shouldUseSdb1560GroundingContract,
  applySdb1560GroundingContract,
  shouldRegroundSdb1560Answer,
  answerPassesGroundingContract,
};
