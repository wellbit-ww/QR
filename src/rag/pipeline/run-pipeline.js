const { getRagConfig, resolveRetrievalTopK } = require("../config");
const { extractSources, getChunkBodyForPrompt, formatContextForPrompt } = require("../retrieval");
const { unifiedRetrieve } = require("../retrieval/unified-retriever");
const { makeDecision, ACTIONS } = require("../decision/decision-engine");
const { generate } = require("../llm/llm-service");
const { runGuardrails } = require("../guardrails/guardrail-engine");
const { buildTroubleshootingFallback } = require("../synthesis/troubleshooting-fallbacks");
const { TraceModel } = require("../telemetry/trace-model");
const { summarizeChunkForTrace } = require("../telemetry/rag-trace");
const {
  buildProceduralSystemPrompt,
  buildTroubleshootingSystemPrompt,
  buildReasoningSystemPrompt,
  buildSafetySystemPrompt,
  buildSafetyPlainTextSystemPrompt,
  buildContextualFactSystemPrompt,
  buildContextualFactModelAliasRetryPrompt,
  buildGeneralFactSystemPrompt,
  buildSafetyGroundedSystemPrompt,
  buildLlmAnswerCompositionBlocks,
  STRICT_ABSTAIN,
  MODEL_PARAM_NOT_SPECIFIED,
} = require("../prompts");
const { isRegenerationShutdownQuery, isEmergencySmokeQuery } = require("../safety-query-scope");
const { llmGenerationOptionsForIntent, equipmentIsSdb151nm } = require("../query-intent");
const {
  filterSdb151nmChunks,
  prependSdb151nmContextPreface,
} = require("../sdb151nm-context-filter");
const {
  isHumidityNotDroppingQuery,
  appendHumidityMandatoryChecks,
} = require("../troubleshooting-scope");
const { validateAnswerAgainstContext } = require("../answer-validation");
const { resolveEquipmentProfile } = require("../../equipment/equipment-runtime");
const {
  shouldDeferGuardrailsToPostGate,
  shouldUseHonestRag,
  shouldUseRagPure,
  filterFusedChunksForRagPure,
  prioritizeSdb1560PurePromptChunks,
  contextHasSdb1560AnswerableData,
  isSpuriousModelAbstainAnswer,
  isNumericTtxRetrievalQuery,
  ragPureSdb1560AnswerLooksOnTopic,
  ragPureSdb1560AnswerOffTopic,
  ragPureSdb1560NeedsFactRetry,
} = require("../honest-rag-mode");
const { isUnsupportedReplacementQuery } = require("../unsupported-replacement-scope");
const { tryHonestContextualNumericFact, appendRetrievalCardSource } = require("../honest-contextual-extract");
const { isEvalCaptureRagTraceEnabled } = require("../eval-capture");

function sourcesFromPromptChunks(promptChunks, captureTrace) {
  if (!captureTrace) {
    return extractSources(promptChunks);
  }
  const seen = new Set();
  const sources = [];
  for (const chunk of promptChunks.slice(0, 14)) {
    const key = `${chunk.sourceDoc}|${chunk.page || ""}|${chunk.section || ""}|${chunk.chunkIndex ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const body = String(chunk.content || getChunkBodyForPrompt(chunk) || "");
    sources.push({
      sourceDoc: chunk.sourceDoc,
      page: chunk.page,
      section: chunk.section,
      chunkIndex: chunk.chunkIndex,
      score: chunk.rerankScore ?? chunk.score,
      content: body.slice(0, 2000),
    });
  }
  return sources;
}
const {
  tryDeterministicSdb1106nmAnswer,
  directContextHintsForMessage,
} = require("../sdb1106nm-direct-facts");
const {
  resolveGoldenFactMatch,
  isHighConfidenceDeterministic,
} = require("../sdb1106nm-golden-facts");
const {
  prefersRagOverDeterministic,
  proceduralSectionHintsForMessage,
} = require("../sdb1106nm-rag-priority");
const {
  isSdb1560mKitShelfCountQuery,
  isSdb1560mLoadHumidityRiseQuery,
  isSdb1560mDoorSoundNormalityQuery,
} = require("../sdb1560m-rag-priority");
const {
  parseSafetyChecklistItems,
  formatSafetyChecklistLines,
} = require("../synthesis/safety-checklist-parse");
const { sanitizeLlmAnswerArtifacts } = require("../synthesis/strip-spurious-checklist");
const { ragInfo, ragWarn } = require("../rag-log");
const { rewriteQueryForRetrieval, resolveEffectiveUserQuestion } = require("../query-rewriting");
const {
  applySdb1560GroundingContract,
  shouldUseSdb1560GroundingContract,
} = require("../synthesis/sdb1560-grounding-contract");

const SDB_MODEL_BASE_RE = /\b(SDB\d{4})\b/gi;

function collectSdbModelBases(...parts) {
  const bases = new Set();
  for (const p of parts) {
    const s = String(p || "");
    const re = new RegExp(SDB_MODEL_BASE_RE.source, "gi");
    let m;
    while ((m = re.exec(s)) !== null) {
      bases.add(m[1].toUpperCase());
    }
  }
  return [...bases];
}

function chunkHaystackContainsModelBases(chunks, bases) {
  if (!bases.length) {
    return false;
  }
  const hay = chunks
    .map((ch) => `${ch.content || ""}\n${ch.section || ""}`)
    .join("\n")
    .toUpperCase();
  return bases.some((b) => hay.includes(b));
}

function shouldRetryContextualFactForSdbAlias(message, equipment, promptChunks) {
  if (shouldUseRagPure(equipment?.id) && equipment?.id === "sdb1560m") {
    return (promptChunks || []).some((ch) =>
      /golden-facts-sdb1560|SDB1560NM\.pdf|Руководство\s+SDB1560/i.test(String(ch?.sourceDoc || "")),
    );
  }
  const bases = collectSdbModelBases(message, equipment?.name, equipment?.id);
  return bases.length > 0 && chunkHaystackContainsModelBases(promptChunks, bases);
}

/**
 * Нормализация запроса для hybrid FTS (PostgreSQL text_search_config = simple):
 * унификация дефисов/пробелов в артикулах и добавление вариантов SDB#### / SDB####NM.
 */
function normalizeSdbArticleQueryForSearch(message, equipment) {
  let q = String(message || "").trim();
  if (!q) {
    return q;
  }
  q = q.replace(/[\u2010-\u2015\u2212\uFE63\uFF0D]/g, "-");
  q = q.replace(/\b(SDB\d{4})\s*-\s*([A-Za-zА-Яа-яёЁ]{1,8})\b/gi, "$1$2");
  q = q.replace(/\b(SDB\d{4})\s+([A-Za-z]{1,4})\b/gi, "$1$2");
  const bases = collectSdbModelBases(q, equipment?.name, equipment?.id);
  const extra = [];
  for (const b of bases) {
    extra.push(b, `${b}NM`, `${b} ${b}NM`);
  }
  if (extra.length) {
    q = `${q} ${extra.join(" ")}`.trim();
  }
  return q.replace(/\s+/g, " ");
}

/** REASONING_QA с «почему/если…» оставляем на causal prompt; остальное — фактический. */
function looksCausalExplanationQuery(m) {
  return /почему|зачем|как\s+работает|принцип\s+действия|опиши\s+подробн|расскажи\s+подробн|объясни|вследствие|что\s+произойдет|что\s+будет|если\s+/iu.test(
    String(m || "")
  );
}

function buildClarification(symptoms = []) {
  const out = [];
  if (!symptoms.includes("door")) out.push("дверь шкафа открыта или закрыта?");
  if (!symptoms.includes("indicator")) out.push("есть ли мигающий или горящий индикатор?");
  if (!symptoms.includes("humidity")) out.push("проблема связана с осушением или влажностью?");
  if (!symptoms.includes("ethernet")) out.push("наблюдается ли ошибка связи по Ethernet?");
  if (!out.length) out.push("какие признаки неисправности вы наблюдаете на панели?");
  return ["Уточните:", ...out.map((x, i) => `${i + 1}. ${x}`)].join("\n");
}

function buildSystemPromptByRoute(route, equipment, retrievalContext, causalChainContext = "", opts = {}) {
  const compositionBlocks =
    opts.compositionBlocks ||
    buildLlmAnswerCompositionBlocks(
      retrievalContext,
      opts.userMessage || "",
      equipment,
      opts.chatHistory || [],
    );
  if (opts.factExtraction) {
    return buildContextualFactSystemPrompt(equipment, retrievalContext, compositionBlocks);
  }
  if (route === "SAFETY_QA") {
    if (opts.safetyAnswerMode === "grounded_text") {
      return buildSafetyGroundedSystemPrompt(equipment, retrievalContext, compositionBlocks);
    }
    return buildSafetySystemPrompt(equipment, retrievalContext, compositionBlocks);
  }
  if (route === "PROCEDURAL_QA") {
    return buildProceduralSystemPrompt(equipment, retrievalContext, compositionBlocks);
  }
  if (route === "TROUBLESHOOTING_QA") {
    return buildTroubleshootingSystemPrompt(equipment, retrievalContext, compositionBlocks);
  }
  if (route === "UNKNOWN") {
    return buildGeneralFactSystemPrompt(equipment, retrievalContext, compositionBlocks);
  }
  if (route === "REASONING_QA" && opts.userMessage && !looksCausalExplanationQuery(opts.userMessage)) {
    return buildGeneralFactSystemPrompt(equipment, retrievalContext, compositionBlocks);
  }
  return buildReasoningSystemPrompt(equipment, retrievalContext, causalChainContext, compositionBlocks);
}

function normalizePlainSafetyList(text) {
  const t = String(text || "").trim();
  if (!t) {
    return STRICT_ABSTAIN;
  }
  const looksLikeNumberedChecklist = /(?:^|\n)\s*\d{1,2}\.\s+\S/.test(t) || /что\s+проверить/i.test(t);
  if (looksLikeNumberedChecklist) {
    return t;
  }
  if (/^информац(?:ия|ии)\s+.*отсутств/i.test(t)) {
    return STRICT_ABSTAIN;
  }
  return t;
}

/** Какой путь сформировал кандидат на ответ до пост-валидации (для логов / ragTrace). */
function resolveAnswerDeliveryMethod(llm) {
  const t = llm || {};
  if (t.safetyPlainTextFallback === true || t.safetyPlainTextAfterTransportError === true) {
    return "safety_fallback";
  }
  if (t.groundingContract === true || t.mode === "GROUNDING_CONTRACT_REGROUND") {
    return "grounding_contract";
  }
  if (t.contextualFactModelAliasRetry === true) {
    return "alias_retry";
  }
  if (t.deterministicTroubleshootingFallback === true) {
    return "troubleshooting_fallback";
  }
  if (
    t.mode === "CONTEXTUAL_FACT_LLM" ||
    t.mode === "CONTEXTUAL_FACT_FALLBACK" ||
    t.deterministicParseFallback === true
  ) {
    return "contextual_fact_fallback";
  }
  return "standard";
}

async function generateSafetyPlainTextList({ equipment, retrievalContext, message }) {
  const systemPrompt = buildSafetyPlainTextSystemPrompt(equipment, retrievalContext);
  return generate({
    route: "SAFETY_QA",
    context: retrievalContext,
    systemPrompt,
    userMessage: message,
    outputSchema: null,
    intentLlmOptions: llmGenerationOptionsForIntent("SAFETY_QUERY"),
  });
}

function resolveIntentLlmOptions(routerDecision, message, retrievalIntent) {
  const intentType =
    routerDecision?.route === "SAFETY_QA" || routerDecision?.intent === "SAFETY_QUERY" ?
      "SAFETY_QUERY"
    : retrievalIntent?.intentType || routerDecision?.intent || null;
  return llmGenerationOptionsForIntent(intentType, message);
}

function pipelineIntentForValidation(routerDecision, retrieval) {
  if (routerDecision?.route === "SAFETY_QA" || routerDecision?.intent === "SAFETY_QUERY") {
    return {
      intentType: "SAFETY_QUERY",
      focusParameter: retrieval.intent.focusParameter || routerDecision.focusParameter,
      queryScope: retrieval.intent.queryScope,
      queryOperatingModes: retrieval.intent.queryOperatingModes || [],
      originalQuery: retrieval.intent.originalQuery,
    };
  }
  return {
    intentType:
      routerDecision.intent === "SINGLE_FIELD_QUERY"
        ? "SINGLE_FIELD_QUERY"
        : retrieval.intent.intentType,
    focusParameter: retrieval.intent.focusParameter || routerDecision.focusParameter,
    queryScope: retrieval.intent.queryScope,
    queryOperatingModes: retrieval.intent.queryOperatingModes || [],
    originalQuery: retrieval.intent.originalQuery,
  };
}

/**
 * Humidity deterministic fallback is a fixed checklist from docs — good when the user
 * asks explicitly what to check, but it makes distinct "why" questions look identical.
 * Only opt into that checklist when the query is action/checklist-oriented, not causal.
 */
function isHumidityChecklistIntent(message) {
  const q = String(message || "").trim();
  if (!q) return false;
  const asksWhyOrCause =
    /\bпочему\b|\bзачем\b|\bпричин(?:а|ы|ой|ами)?\b|\bиз-за\s+чего\b|\bв\s+ч[её]м\s+причин|\bотчего\b|\bкак\s+объяснить\b/iu.test(
      q
    );
  if (asksWhyOrCause) return false;
  return /что\s+проверить|в\s+первую\s+очередь|что\s+делать|как\s+(?:проверить|диагностировать)|не\s+снижает\s+влажность/iu.test(
    q
  );
}

/** Golden есть, но ответ должен быть развёрнутым RAG (дверь >1 мин, описание режима). */
function goldenShouldDeferToRag(match, message) {
  const m = String(message || "");
  const key = match?.key;
  if (key === "door_sound_signal" && /минут|долго|забыл|что\s+случит|что\s+произойд/i.test(m)) {
    return true;
  }
  if (key === "regen_cycle_duration" && /опиш|кратко|что\s+происход/i.test(m)) {
    return true;
  }
  return false;
}

function isParameterFactLlmQuery(routerDecision, message = "") {
  const m = String(message || "");
  if (
    /конвекц|как\s+работ|что\s+произойд|что\s+случит|опиш|погруз|разгруз|установить\s+полк|расстояни.*полк|между\s+полк/i.test(
      m
    )
  ) {
    return false;
  }
  if (/конвекц|между\s+полк|расстояни.*полк/i.test(m) && /полк/i.test(m)) {
    return false;
  }
  return (
    routerDecision?.intent === "SINGLE_FIELD_QUERY" || Boolean(routerDecision?.parameterResolved)
  );
}

function selectPromptChunks(route, fusedChunks, opts = {}) {
  const chunks = Array.isArray(fusedChunks) ? fusedChunks : [];
  const wide = opts.retrievalMode === "hybrid_wide" || opts.ragPriority === true || opts.ragPure === true;
  const minCount = opts.ragPure ? 10 : 0;
  const cap = wide ? (opts.ragPure ? 14 : 12) : null;
  const take = (n) => chunks.slice(0, Math.max(n, minCount));
  switch (route) {
    case "TROUBLESHOOTING_QA":
      return take(cap || 8);
    case "PROCEDURAL_QA":
      return take(cap || 8);
    case "REASONING_QA":
      return take(cap || 10);
    case "SAFETY_QA":
      return take(cap || 8);
    default:
      return take(cap || 8);
  }
}

function mergeSectionHints(routerDecision, message, equipment) {
  const base = Array.isArray(routerDecision?.sectionHints) ? routerDecision.sectionHints : [];
  const equipmentId = equipment?.id;
  if (equipmentId === "sdb1106-nm") {
    return [...new Set([...base, ...proceduralSectionHintsForMessage(message)])];
  }
  const profile = resolveEquipmentProfile(equipmentId);
  const modelHints = profile?.sectionHints ? profile.sectionHints(message) : [];
  return [...new Set([...base, ...modelHints])];
}

function formatContextForEquipmentPrompt(chunks, equipment) {
  const selected = equipmentIsSdb151nm(equipment) ? filterSdb151nmChunks(chunks) : chunks;
  let text = formatContextForPrompt(selected);
  if (equipmentIsSdb151nm(equipment)) {
    text = prependSdb151nmContextPreface(text);
  }
  return { chunks: selected, text };
}

function prependRetrievalGuidance(message, retrievalContext, equipment) {
  const equipmentId = equipment?.id;
  const profile = resolveEquipmentProfile(equipmentId);
  const hints =
    equipmentId === "sdb1106-nm"
      ? directContextHintsForMessage(message)
      : profile?.directContextHints?.(message);
  if (!hints) {
    return retrievalContext;
  }
  return `[Ориентиры по разделам РЭ]\n${hints}\n\n---\n\n${retrievalContext}`;
}

const { selectPromptChunksDeterministicFactFallback } = require("./chunk-select");

/**
 * Повторное извлечение факта из таблицы (SDB1106 / SDB1106NM) после ложного abstain.
 */
function buildGoldenRetryFocusHint(message) {
  const m = String(message || "");
  const lines = [];
  if (/осушит|36\s*месяц|график\s+обслуж|когда\s+меня/i.test(m)) {
    lines.push("Ищи в golden / табл. 3.1: период замены блока осушения (36 месяцев).");
  }
  if (/\bip\b|пыл|брызг|от\s+воды/i.test(m)) {
    lines.push("Ищи класс защиты IP55 (табл. 1.1 / golden).");
  }
  if (/регенерац/i.test(m) && /мощност|вт|ватт/i.test(m)) {
    lines.push("Ищи максимальную мощность в режиме регенерации (540 Вт).");
  }
  if (/двер/i.test(m) && /сколько|количеств/i.test(m)) {
    lines.push("Ищи число дверей в табл. 1.2 / golden (4 шт.).");
  }
  if (/таймер|n2ton|99[,.]9|азот.*минут/i.test(m)) {
    lines.push("Ищи диапазон таймера подачи азота 0–99,9 мин (опция без датчика).");
  }
  if (/давлен.*азот|азот.*вход|бар/i.test(m)) {
    lines.push("Ищи максимальное давление азота на входе (6 бар).");
  }
  if (/ухл|климат/i.test(m)) {
    lines.push("Ищи климатическое исполнение УХЛ 4.2 по ГОСТ 15150.");
  }
  if (/мига|красн.*норм|индикатор/i.test(m)) {
    lines.push("Ищи п. 1.1.4.3.3: красный мигающий — режим «Осушения».");
  }
  if (/слом|замен|что\s+делать/i.test(m)) {
    lines.push(
      "Замена узла без инструкции в РЭ: нет процедуры для оператора + контакты техподдержки из CONTEXT.",
    );
  }
  if (/вес|масс|260|килограм/i.test(m) && !/полк|нагрузк/i.test(m)) {
    lines.push("Ищи массу шкафа 260 кг (табл. 1.1 / golden).");
  }
  if (/габарит|ширин|высот|глубин/i.test(m)) {
    lines.push("Ищи габаритные размеры 1202 × 1693 × 1028 мм (табл. 1.1).");
  }
  return lines.join("\n");
}

async function maybeContextualFactAliasRetry({
  message,
  retrievalQuery,
  equipment,
  promptChunks,
  retrievalContext,
  ragConfig,
  routerDecision,
  priorAnswer,
}) {
  const ragPure1560 = shouldUseRagPure(equipment?.id) && equipment?.id === "sdb1560m";
  const priorNeedsFactRetry =
    priorAnswer === STRICT_ABSTAIN ||
    (ragPure1560 &&
      contextHasSdb1560AnswerableData(retrievalContext) &&
      (isSpuriousModelAbstainAnswer(priorAnswer) ||
        String(priorAnswer || "").trim() === MODEL_PARAM_NOT_SPECIFIED ||
        ragPureSdb1560AnswerOffTopic(message, priorAnswer)));
  if (!priorNeedsFactRetry) {
    return { answer: priorAnswer, promptChunks, retrievalContext, aliasRetry: false };
  }
  const searchSeed = String(retrievalQuery || message || "").trim();
  if (!shouldRetryContextualFactForSdbAlias(searchSeed, equipment, promptChunks)) {
    return { answer: priorAnswer, promptChunks, retrievalContext, aliasRetry: false };
  }

  const widenedQuery = normalizeSdbArticleQueryForSearch(searchSeed, equipment);
  let retryContext = retrievalContext;
  let chunks = promptChunks;
  const trimmedOriginal = String(message || "").trim();

  if (widenedQuery && widenedQuery !== trimmedOriginal) {
    ragInfo("pipeline.alias_retry_widen_query", {
      widenedLen: widenedQuery.length,
      originalLen: trimmedOriginal.length,
    });
    const r2 = await unifiedRetrieve({
      ragConfig,
      equipmentId: equipment.id,
      query: widenedQuery,
      routerDecision,
      retrievalTopCap: resolveRetrievalTopK(ragConfig, routerDecision, widenedQuery || message),
      sectionHints: undefined,
    });
    const altPool = selectPromptChunksDeterministicFactFallback(
      r2.fusedChunks || [],
      r2.semanticChunks || [],
      r2.chunksBeforeSingleFieldNarrowing || [],
      4,
      6
    );
    const merged = selectPromptChunksDeterministicFactFallback(altPool, chunks, [], 4, 8);
    if (merged.length) {
      const formatted = formatContextForEquipmentPrompt(merged, equipment);
      chunks = formatted.chunks;
      retryContext = formatted.text;
    }
  }

  const retryComposition = buildLlmAnswerCompositionBlocks(
    retryContext,
    widenedQuery || message,
    equipment
  );
  const retryPrompt = buildContextualFactModelAliasRetryPrompt(equipment, retryContext, retryComposition);
  const retry = await generate({
    route: "PROCEDURAL_QA",
    context: retryContext,
    systemPrompt: retryPrompt,
    userMessage: `Ответь строго на вопрос пользователя (только запрошенный параметр, без других ТТХ): ${widenedQuery || message}\n\nОдним–двумя предложениями; обязательно число или формулировка из фрагментов CONTEXT выше.`,
    outputSchema: null,
  });

  const retryText = String(retry.content || "").trim();
  if (ragPure1560 && isSpuriousModelAbstainAnswer(retryText)) {
    return { answer: priorAnswer, promptChunks, retrievalContext, aliasRetry: false };
  }
  if (ragPure1560 && ragPureSdb1560AnswerOffTopic(message, retryText)) {
    return { answer: priorAnswer, promptChunks, retrievalContext, aliasRetry: false };
  }

  return {
    answer: retryText,
    promptChunks: chunks,
    retrievalContext: retryContext,
    aliasRetry: true,
    widenedArticleQuery: widenedQuery !== trimmedOriginal ? widenedQuery : undefined,
    model: retry.model,
  };
}

async function maybeRagPureGoldenFocusedRetry({
  message,
  equipment,
  promptChunks,
  routerDecision,
  retrieval,
  priorAnswer,
}) {
  if (!shouldUseRagPure(equipment?.id) || equipment?.id !== "sdb1560m") {
    return { answer: priorAnswer, applied: false, promptChunks, retrievalContext: null };
  }
  const goldenPdf = (promptChunks || []).filter((ch) =>
    /golden-facts-sdb1560|\.pdf|Руководство\s+SDB1560/i.test(String(ch?.sourceDoc || "")),
  );
  if (goldenPdf.length < 1) {
    return { answer: priorAnswer, applied: false, promptChunks, retrievalContext: null };
  }
  const formatted = formatContextForEquipmentPrompt(goldenPdf.slice(0, 12), equipment);
  const focusHint = buildGoldenRetryFocusHint(message);
  const composition = [
    buildLlmAnswerCompositionBlocks(formatted.text, message, equipment),
    "",
    "GOLDEN-FOCUSED RETRY (RAG PURE):",
    "Используй только фрагменты golden-facts-sdb1560 и PDF выше — перенеси нужную цифру или формулировку в ответ.",
    `Запрещены «${MODEL_PARAM_NOT_SPECIFIED}» и отказы «контекст не содержит».`,
    focusHint ? `\n${focusHint}` : "",
  ].join("\n");
  const retryPrompt = buildContextualFactModelAliasRetryPrompt(
    equipment,
    formatted.text,
    composition,
  );
  try {
    const retry = await generate({
      route: "PROCEDURAL_QA",
      context: formatted.text,
      systemPrompt: retryPrompt,
      userMessage: `${message}\n\nОдин–два предложения с фактом из golden-facts / табл. 1.1–1.2.`,
      outputSchema: null,
      intentLlmOptions: resolveIntentLlmOptions(
        routerDecision,
        message,
        retrieval?.intent,
      ),
    });
    const text = String(retry.content || "").trim();
    if (
      text &&
      !isSpuriousModelAbstainAnswer(text) &&
      text !== MODEL_PARAM_NOT_SPECIFIED &&
      !ragPureSdb1560AnswerOffTopic(message, text)
    ) {
      return {
        answer: text,
        applied: true,
        promptChunks: formatted.chunks,
        retrievalContext: formatted.text,
        model: retry.model,
      };
    }
  } catch (_goldenRetryErr) {
    /* keep prior */
  }
  return { answer: priorAnswer, applied: false, promptChunks, retrievalContext: null };
}

function buildSdb1106nmDeterministicResult(equipment, message, routerDecision, trace, answer) {
  const mode =
    isEmergencySmokeQuery(message) || isRegenerationShutdownQuery(message)
      ? "SAFETY_DETERMINISTIC"
      : "RAG_DETERMINISTIC";
  trace.setLlm({ used: false, mode, deterministic: true });
  return {
    answer,
    sources: [],
    retrievalContext: "",
    retrieval: {
      route: routerDecision.route,
      retrievalStrategy: "deterministic",
      topScore: 1,
      chunks: 0,
      fallback: false,
      llmUsed: false,
      deterministicUsed: true,
      groundingPassed: true,
      abstained: false,
    },
    ragTrace: {
      ...trace.build(),
      mode,
      deterministicUsed: true,
      used: false,
    },
  };
}

function ragPureUnsupportedShelfAnswerOk(message, history, answer) {
  if (!isUnsupportedReplacementQuery(message, history)) {
    return true;
  }
  return /полк|техподдерж|замен|комплект|800\s*\(\s*800|нет\s+инструкц/i.test(String(answer || ""));
}

async function runPipeline({
  equipment,
  message,
  history = [],
  routerDecision,
  evalCaptureRagTrace = false,
}) {
  const captureTrace = evalCaptureRagTrace || isEvalCaptureRagTraceEnabled();
  const ragConfig = getRagConfig();
  const trace = new TraceModel({ equipmentId: equipment.id });
  trace.setRouter(routerDecision);
  const equipmentProfile = resolveEquipmentProfile(equipment.id);
  const ragPure = shouldUseRagPure(equipment.id);

  const ragPriority =
    equipment.id === "sdb1106-nm" && prefersRagOverDeterministic(message, routerDecision);

  if (equipment.id === "sdb1106-nm") {
    const deterministic = tryDeterministicSdb1106nmAnswer(message, { history });
    const goldenMatch = resolveGoldenFactMatch(message, history);
    const forceGoldenDeterministic =
      deterministic &&
      goldenMatch &&
      isHighConfidenceDeterministic(goldenMatch) &&
      !goldenShouldDeferToRag(goldenMatch, message);
    if (deterministic && (!ragPriority || forceGoldenDeterministic)) {
      ragInfo("pipeline.sdb1106nm_deterministic", {
        mode: forceGoldenDeterministic && ragPriority ? "pre_llm_golden_override" : "pre_llm",
        questionLen: message.length,
        factKey: goldenMatch?.key || null,
      });
      return buildSdb1106nmDeterministicResult(
        equipment,
        message,
        routerDecision,
        trace,
        deterministic
      );
    }
  } else if (equipmentProfile?.tryDeterministicAnswer) {
    const deterministic = equipmentProfile.tryDeterministicAnswer(message, { history });
    if (deterministic) {
      ragInfo("pipeline.equipment_deterministic", {
        equipmentId: equipment.id,
        questionLen: message.length,
      });
      return buildSdb1106nmDeterministicResult(
        equipment,
        message,
        routerDecision,
        trace,
        deterministic
      );
    }
  }

  if (ragPriority) {
    ragInfo("pipeline.sdb1106nm_rag_priority", {
      route: routerDecision?.route,
      retrievalMode: routerDecision?.retrievalMode,
    });
  }

  const rewriteResult = await rewriteQueryForRetrieval({
    userQuery: message,
    history,
    equipment,
    ragConfig,
  });
  const retrievalQuery = rewriteResult.standaloneQuery || message;

  ragInfo("pipeline.query_rewrite", {
    source: rewriteResult.source,
    rewritten: rewriteResult.rewritten,
    originalLen: String(message || "").length,
    standaloneLen: String(retrievalQuery).length,
  });

  const sectionHints = mergeSectionHints(routerDecision, message, equipment);

  const retrieval = await unifiedRetrieve({
    ragConfig,
    equipmentId: equipment.id,
    query: retrievalQuery,
    routerDecision,
    retrievalTopCap: resolveRetrievalTopK(ragConfig, routerDecision, retrievalQuery),
    sectionHints,
  });

  const factMessage = resolveEffectiveUserQuestion(message, history);

  const fusedChunksRaw = retrieval.fusedChunks || [];
  let fusedChunks = ragPure ? filterFusedChunksForRagPure(fusedChunksRaw) : fusedChunksRaw;
  if (ragPure && equipment.id === "sdb1560m") {
    fusedChunks = prioritizeSdb1560PurePromptChunks(fusedChunks);
    if (isSdb1560mKitShelfCountQuery(message)) {
      fusedChunks = fusedChunks.filter(
        (ch) => !/18\s+перфорирован|18\s+полок|\b18\b[^\n]{0,20}полок/i.test(String(ch?.content || "")),
      );
    }
  }
  let parameterFactLlm = isParameterFactLlmQuery(routerDecision, message);
  let contextualFactMode = parameterFactLlm;
  if (ragPure && equipment.id === "sdb1560m") {
    const unsupportedReplacement = isUnsupportedReplacementQuery(message, history);
    contextualFactMode =
      !unsupportedReplacement &&
      (isNumericTtxRetrievalQuery(factMessage, retrieval.intent) ||
        Boolean(routerDecision?.indicatorNormalMode) ||
        routerDecision?.intent === "MAINTENANCE_QUERY" ||
        retrieval.intent?.intentType === "MAINTENANCE_QUERY" ||
        isSdb1560mLoadHumidityRiseQuery(factMessage) ||
        isSdb1560mDoorSoundNormalityQuery(factMessage) ||
        routerDecision?.route === "REASONING_QA");
    parameterFactLlm = contextualFactMode;
  }
  let promptChunks = selectPromptChunks(routerDecision.route, fusedChunks, {
    retrievalMode: routerDecision.retrievalMode,
    ragPriority,
    ragPure,
  });
  if (parameterFactLlm) {
    promptChunks = selectPromptChunksDeterministicFactFallback(
      fusedChunks,
      retrieval.semanticChunks,
      retrieval.chunksBeforeSingleFieldNarrowing,
      4,
      10
    );
  } else if (ragPure && promptChunks.length < 10) {
    promptChunks = selectPromptChunksDeterministicFactFallback(
      fusedChunks,
      retrieval.semanticChunks,
      retrieval.chunksBeforeSingleFieldNarrowing,
      10,
      14
    );
  }
  const promptFormatted = formatContextForEquipmentPrompt(promptChunks, equipment);
  promptChunks = promptFormatted.chunks;
  let retrievalContext = prependRetrievalGuidance(message, promptFormatted.text, equipment);
  let sources = sourcesFromPromptChunks(promptChunks, captureTrace);
  trace.setRetrieval({
    route: routerDecision.route,
    bestMode: retrieval.bestMode,
    chunks: fusedChunks.length,
    promptChunks: promptChunks.length,
    topScore: retrieval.scores.topScore,
    minSimilarityScore: retrieval.scores.minSimilarityScore,
    originalUserQuery: message,
    standaloneRetrievalQuery: retrievalQuery,
    queryRewriteSource: rewriteResult.source,
    queryRewritten: rewriteResult.rewritten,
    queryRewriteModel: rewriteResult.model || null,
    ...(captureTrace
      ? {
          fusedChunkSummaries: fusedChunks.slice(0, 16).map(summarizeChunkForTrace),
          promptChunkSummaries: promptChunks.slice(0, 14).map(summarizeChunkForTrace),
        }
      : {}),
  });
  trace.setScores(retrieval.scores);

  const decision = makeDecision({
    routerDecision,
    retrieval,
    minScoreThreshold: ragConfig.minSimilarityScore,
  });
  trace.setDecision(decision);

  let finalAnswer = "";
  let llmUsed = false;

  const skipClarificationForUnsupported =
    ragPure &&
    equipment.id === "sdb1560m" &&
    isUnsupportedReplacementQuery(message, history) &&
    (retrieval.fusedChunks?.length || 0) > 0;

  const force1560LlmOnWeakRetrieval =
    ragPure &&
    equipment.id === "sdb1560m" &&
    shouldUseSdb1560GroundingContract(equipment.id) &&
    decision.action === ACTIONS.ABSTAIN &&
    contextHasSdb1560AnswerableData(retrievalContext) &&
    (retrieval.fusedChunks?.length || 0) > 0;

  if (decision.action === ACTIONS.ASK_CLARIFICATION && !skipClarificationForUnsupported) {
    finalAnswer = buildClarification(routerDecision.symptoms || []);
  } else if (decision.action === ACTIONS.ABSTAIN && !force1560LlmOnWeakRetrieval) {
    finalAnswer = STRICT_ABSTAIN;
  } else {
    const llmRouteOverride =
      skipClarificationForUnsupported && decision.action === ACTIONS.ASK_CLARIFICATION
        ? "PROCEDURAL_QA"
        : null;
    const effectiveRoute = llmRouteOverride || routerDecision.route;
    const causalContext =
      routerDecision.route === "REASONING_QA"
        ? formatContextForEquipmentPrompt((retrieval.raw.causalChain || []).slice(0, 6), equipment).text
        : "";
    const systemPrompt = buildSystemPromptByRoute(
      effectiveRoute,
      equipment,
      retrievalContext,
      causalContext,
      {
        userMessage: factMessage,
        chatHistory: history,
        factExtraction: contextualFactMode,
        safetyAnswerMode: routerDecision.safetyAnswerMode,
      }
    );
    try {
      const intentLlmOptions = resolveIntentLlmOptions(
        routerDecision,
        message,
        retrieval.intent
      );
      const result = await generate({
        route: parameterFactLlm ? "PROCEDURAL_QA" : effectiveRoute,
        context: retrievalContext,
        systemPrompt,
        userMessage:
          factMessage !== message
            ? `${factMessage}\n\nУточнение пользователя (ответь по факту из CONTEXT на основной вопрос): ${message}`
            : message,
        outputSchema: decision.action === ACTIONS.SAFETY_CHECKLIST ? { type: "json" } : null,
        intentLlmOptions,
      });
      finalAnswer = result.content;
      llmUsed = true;
      const llmTrace = {
        used: true,
        model: result.model,
        mode: parameterFactLlm ? "CONTEXTUAL_FACT_LLM" : decision.action,
      };

      const needs1560FactRetry =
        ragPure &&
        equipment.id === "sdb1560m" &&
        !shouldUseSdb1560GroundingContract(equipment.id) &&
        (ragPureSdb1560NeedsFactRetry(message, finalAnswer, retrieval.intent, retrievalContext) ||
          ragPureSdb1560NeedsFactRetry(factMessage, finalAnswer, retrieval.intent, retrievalContext));

      if (shouldUseSdb1560GroundingContract(equipment.id)) {
        try {
          const grounded = await applySdb1560GroundingContract({
            message,
            factMessage,
            equipment,
            promptChunks,
            retrievalContext,
            routerDecision,
            retrieval,
            retrievalQuery,
            ragConfig,
            priorAnswer: finalAnswer,
            resolveIntentLlmOptions,
          });
          if (grounded.applied) {
            finalAnswer = grounded.answer;
            promptChunks = grounded.promptChunks;
            retrievalContext = grounded.retrievalContext;
            sources = sourcesFromPromptChunks(promptChunks, captureTrace);
            llmTrace.groundingContract = grounded.trace;
            llmTrace.mode = "GROUNDING_CONTRACT_REGROUND";
            if (grounded.trace?.contextualExtract) {
              llmTrace.contextualExtract = grounded.trace.contextualExtract;
              llmTrace.groundingContract = {
                ...grounded.trace,
                contextualExtract: grounded.trace.contextualExtract,
              };
              const kind = grounded.trace.contextualExtract.kind;
              if (kind) {
                sources = appendRetrievalCardSource(sources, kind);
              }
            } else if (grounded.trace?.passes?.includes("contextual_extract_early")) {
              const kind = llmTrace.contextualExtract?.kind || "rh_setpoint_rule";
              sources = appendRetrievalCardSource(sources, kind);
            }
            if (grounded.trace?.model) {
              llmTrace.model = grounded.trace.model;
            }
          } else if (grounded.trace?.passes?.length) {
            llmTrace.groundingContractAttempted = grounded.trace;
          }
        } catch (groundingErr) {
          llmTrace.groundingContractFailed = true;
          llmTrace.groundingContractError =
            groundingErr instanceof Error ? groundingErr.message : String(groundingErr);
        }
      } else if (contextualFactMode || needs1560FactRetry) {
        const alias = await maybeContextualFactAliasRetry({
          message: factMessage,
          retrievalQuery,
          equipment,
          promptChunks,
          retrievalContext,
          ragConfig,
          routerDecision,
          priorAnswer: finalAnswer,
        });
        if (alias.aliasRetry) {
          finalAnswer = alias.answer;
          promptChunks = alias.promptChunks;
          retrievalContext = alias.retrievalContext;
          sources = sourcesFromPromptChunks(promptChunks, captureTrace);
          llmTrace.contextualFactModelAliasRetry = true;
          llmTrace.priorAnswerWasAbstain = true;
          if (alias.widenedArticleQuery) {
            llmTrace.widenedArticleQuery = alias.widenedArticleQuery;
          }
          if (alias.model) {
            llmTrace.model = alias.model;
          }
        }
      }

      if (
        !shouldUseSdb1560GroundingContract(equipment.id) &&
        ragPure &&
        equipment.id === "sdb1560m" &&
        needs1560FactRetry
      ) {
        const goldenRetry = await maybeRagPureGoldenFocusedRetry({
          message: factMessage,
          equipment,
          promptChunks,
          routerDecision,
          retrieval,
          priorAnswer: finalAnswer,
        });
        if (goldenRetry.applied) {
          finalAnswer = goldenRetry.answer;
          promptChunks = goldenRetry.promptChunks;
          retrievalContext = goldenRetry.retrievalContext;
          sources = sourcesFromPromptChunks(promptChunks, captureTrace);
          llmTrace.ragPureGoldenFocusedRetry = true;
          if (goldenRetry.model) {
            llmTrace.model = goldenRetry.model;
          }
        }
      }

      if (
        !shouldUseSdb1560GroundingContract(equipment.id) &&
        ragPure &&
        equipment.id === "sdb1560m" &&
        isSpuriousModelAbstainAnswer(finalAnswer) &&
        contextHasSdb1560AnswerableData(retrievalContext)
      ) {
        const retryComposition = [
          buildLlmAnswerCompositionBlocks(retrievalContext, message, equipment),
          "",
          "ПОВТОР (RAG PURE SDB1560NM):",
          "В CONTEXT уже есть табл. 1.1, табл. 1.2 и/или golden-facts — извлеки ответ на вопрос.",
          "1–3 предложения с числами и формулировками из CONTEXT; укажи таблицу/пункт, если видно во фрагменте.",
          `ЗАПРЕЩЕНО: «${MODEL_PARAM_NOT_SPECIFIED}», «контекст не содержит», «не предоставлен контекст», «рекомендуется обратиться».`,
        ].join("\n");
        const retryPrompt = buildSystemPromptByRoute(
          routerDecision.route,
          equipment,
          retrievalContext,
          "",
          {
            userMessage: message,
            compositionBlocks: retryComposition,
            safetyAnswerMode: routerDecision.safetyAnswerMode,
          },
        );
        try {
          const pureRetry = await generate({
            route: routerDecision.route,
            context: retrievalContext,
            systemPrompt: retryPrompt,
            userMessage: `${message}\n\nОтветь одним–двумя предложениями с числом из фрагментов CONTEXT; без отказов.`,
            outputSchema: null,
            intentLlmOptions: resolveIntentLlmOptions(
              routerDecision,
              message,
              retrieval.intent,
            ),
          });
          if (!isSpuriousModelAbstainAnswer(pureRetry.content)) {
            finalAnswer = pureRetry.content;
            llmTrace.ragPureAbstainRetry = true;
            if (pureRetry.model) {
              llmTrace.model = pureRetry.model;
            }
          } else {
            llmTrace.ragPureAbstainRetryStillHedged = true;
            try {
              const aliasPrompt = buildContextualFactModelAliasRetryPrompt(
                equipment,
                retrievalContext,
                retryComposition,
              );
              const aliasRetry = await generate({
                route: "PROCEDURAL_QA",
                context: retrievalContext,
                systemPrompt: aliasPrompt,
                userMessage: message,
                outputSchema: null,
                intentLlmOptions: resolveIntentLlmOptions(
                  routerDecision,
                  message,
                  retrieval.intent,
                ),
              });
              if (!isSpuriousModelAbstainAnswer(aliasRetry.content)) {
                finalAnswer = aliasRetry.content;
                llmTrace.ragPureAliasRetry = true;
                if (aliasRetry.model) {
                  llmTrace.model = aliasRetry.model;
                }
              }
            } catch (_aliasErr) {
              llmTrace.ragPureAliasRetryFailed = true;
            }
          }
        } catch (_pureRetryErr) {
          llmTrace.ragPureAbstainRetryFailed = true;
        }
      }

      if (
        ragPure &&
        equipment.id === "sdb1560m" &&
        isUnsupportedReplacementQuery(message, history) &&
        !ragPureUnsupportedShelfAnswerOk(message, history, finalAnswer)
      ) {
        const unsupportedComposition = [
          buildLlmAnswerCompositionBlocks(retrievalContext, message, equipment, history),
          "",
          "ПОВТОР — замена узла без инструкции (SDB1560NM):",
          "Не проси уточнить симптом. Ответ: в РЭ нет инструкции по замене + контакты техподдержки из CONTEXT.",
          buildGoldenRetryFocusHint(message),
        ].join("\n");
        try {
          const unsupportedRetry = await generate({
            route: "PROCEDURAL_QA",
            context: retrievalContext,
            systemPrompt: buildProceduralSystemPrompt(equipment, retrievalContext, unsupportedComposition),
            userMessage: `${message}\n\nКороткий ответ: нет инструкции по замене + техподдержка.`,
            outputSchema: null,
            intentLlmOptions: resolveIntentLlmOptions(routerDecision, message, retrieval.intent),
          });
          const uText = String(unsupportedRetry.content || "").trim();
          if (uText && ragPureUnsupportedShelfAnswerOk(message, history, uText)) {
            finalAnswer = uText;
            llmTrace.ragPureUnsupportedRetry = true;
          }
        } catch (_unsupportedErr) {
          llmTrace.ragPureUnsupportedRetryFailed = true;
        }
      }

      if (
        ragPure &&
        equipment.id === "sdb1560m" &&
        isSdb1560mKitShelfCountQuery(message) &&
        /\b18\b[^\n]{0,24}полок/i.test(String(finalAnswer || ""))
      ) {
        const shelfRetryComposition = [
          buildLlmAnswerCompositionBlocks(retrievalContext, message, equipment),
          "",
          "ПОВТОР — полки в комплекте SDB1560NM:",
          "В golden-facts / табл. 1.2: «Полки (стандартные) | 2 шт.» — ответ **2 полки** (не 18 перфорированных из семейной таблицы).",
        ].join("\n");
        try {
          const shelfRetry = await generate({
            route: "PROCEDURAL_QA",
            context: retrievalContext,
            systemPrompt: buildContextualFactModelAliasRetryPrompt(
              equipment,
              retrievalContext,
              shelfRetryComposition,
            ),
            userMessage: `${message}\n\nТолько число полок в базовой комплектации из CONTEXT.`,
            outputSchema: null,
            intentLlmOptions: resolveIntentLlmOptions(routerDecision, message, retrieval.intent),
          });
          if (!/\b18\b[^\n]{0,24}полок/i.test(String(shelfRetry.content || ""))) {
            finalAnswer = shelfRetry.content;
            llmTrace.ragPureShelfCountRetry = true;
          }
        } catch (_shelfErr) {
          llmTrace.ragPureShelfCountRetryFailed = true;
        }
      }

      if (decision.action === ACTIONS.SAFETY_CHECKLIST) {
        const items = parseSafetyChecklistItems(finalAnswer);
        const formatted = formatSafetyChecklistLines(items);
        if (formatted) {
          finalAnswer = formatted;
        } else {
          try {
            const fb = await generateSafetyPlainTextList({ equipment, retrievalContext, message });
            finalAnswer = normalizePlainSafetyList(fb.content);
            llmTrace.model = fb.model;
            llmTrace.mode = "LLM_GENERATE";
            llmTrace.safetyPlainTextFallback = true;
            llmTrace.priorSafetyJsonModel = result.model;
          } catch (_plainErr) {
            llmTrace.safetyPlainTextFallbackFailed = true;
            finalAnswer = STRICT_ABSTAIN;
          }
        }
      }

      if (llmUsed && String(finalAnswer || "").trim()) {
        const valIntent = pipelineIntentForValidation(routerDecision, retrieval);
        valIntent.originalQuery = message;
        const preCheck = validateAnswerAgainstContext(finalAnswer, retrievalContext, valIntent);
        const tempPowerFail = (preCheck.failures || []).some(
          (f) => f.detail === "temperature_answer_contains_power_watts"
        );
        if (tempPowerFail && !equipmentIsSdb151nm(equipment)) {
          const retryComposition = [
            buildLlmAnswerCompositionBlocks(retrievalContext, message, equipment),
            "",
            "ПОВТОР: вопрос про температуру нагрева (°C), не про потребляемую мощность (Вт).",
            "Ответь только диапазоном **T окр. +5 °C … +40 °C** по опции «Система подогрева» (п. 1.2.1.1); значения выше +40 °C — запрещены.",
          ].join("\n");
          const retryPrompt = buildSystemPromptByRoute(
            parameterFactLlm ? "PROCEDURAL_QA" : routerDecision.route,
            equipment,
            retrievalContext,
            "",
            {
              userMessage: message,
              compositionBlocks: retryComposition,
              safetyAnswerMode: routerDecision.safetyAnswerMode,
            }
          );
          try {
            const tempRetry = await generate({
              route: parameterFactLlm ? "PROCEDURAL_QA" : routerDecision.route,
              context: retrievalContext,
              systemPrompt: retryPrompt,
              userMessage: message,
              outputSchema: null,
              intentLlmOptions: resolveIntentLlmOptions(
                routerDecision,
                message,
                retrieval.intent
              ),
            });
            finalAnswer = tempRetry.content;
            llmTrace.temperaturePowerRetry = true;
            if (tempRetry.model) {
              llmTrace.model = tempRetry.model;
            }
          } catch (_tempRetryErr) {
            llmTrace.temperaturePowerRetryFailed = true;
          }
        }
      }

      if (
        (routerDecision.route === "SAFETY_QA" || isRegenerationShutdownQuery(message)) &&
        String(finalAnswer || "").trim()
      ) {
        const safetyIntent = pipelineIntentForValidation(routerDecision, retrieval);
        safetyIntent.originalQuery = message;
        const regCheck = validateAnswerAgainstContext(finalAnswer, retrievalContext, safetyIntent);
        const regMissing = (regCheck.failures || []).some((f) => f.code === "regeneration_forbidden_missing");
        const extraReasoning = (regCheck.failures || []).some((f) => f.code === "safety_extra_reasoning");
        if (regMissing || extraReasoning) {
          const retryLines = [
            buildLlmAnswerCompositionBlocks(retrievalContext, message, equipment),
            "",
          ];
          if (regMissing) {
            retryLines.push(
              "ПОВТОР: в ответе обязательно «ЗАПРЕЩАЕТСЯ» и запрет выключения шкафа при работе в режиме регенерации (п. 1.1.4.4.3).",
            );
          }
          if (extraReasoning) {
            retryLines.push(
              "ПОВТОР: без причин и последствий («риск пожара», «может привести», «из-за риска») — только формулировки из контекста РЭ.",
            );
          }
          const retryPrompt = buildSafetyGroundedSystemPrompt(
            equipment,
            retrievalContext,
            retryLines.join("\n")
          );
          try {
            const regRetry = await generate({
              route: "SAFETY_QA",
              context: retrievalContext,
              systemPrompt: retryPrompt,
              userMessage: message,
              outputSchema: null,
              intentLlmOptions: llmGenerationOptionsForIntent("SAFETY_QUERY"),
            });
            finalAnswer = regRetry.content;
            llmTrace.safetyGroundedRetry = true;
            if (regMissing) {
              llmTrace.regenerationForbiddenRetry = true;
            }
            if (extraReasoning) {
              llmTrace.safetyExtraReasoningRetry = true;
            }
            if (regRetry.model) {
              llmTrace.model = regRetry.model;
            }
          } catch (_regRetryErr) {
            llmTrace.safetyGroundedRetryFailed = true;
          }
        }
      }

      trace.setLlm(llmTrace);
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      if (decision.action === ACTIONS.SAFETY_CHECKLIST) {
        try {
          const fb = await generateSafetyPlainTextList({ equipment, retrievalContext, message });
          finalAnswer = normalizePlainSafetyList(fb.content);
          llmUsed = true;
          trace.setLlm({
            used: true,
            model: fb.model,
            mode: "LLM_GENERATE",
            safetyPlainTextAfterTransportError: true,
            priorError: details,
          });
        } catch (_e2) {
          trace.setLlm({
            used: true,
            failed: true,
            mode: decision.action,
            error: details,
            safetyPlainTextFallbackFailed: true,
          });
          finalAnswer = STRICT_ABSTAIN;
          llmUsed = false;
        }
      } else {
        trace.setLlm({
          used: true,
          failed: true,
          mode: decision.action,
          error: details,
        });
        finalAnswer = STRICT_ABSTAIN;
        llmUsed = false;
      }
    }
  }

  if (
    routerDecision.route === "TROUBLESHOOTING_QA" &&
    isHumidityNotDroppingQuery(message) &&
    String(finalAnswer || "").trim()
  ) {
    finalAnswer = appendHumidityMandatoryChecks(finalAnswer);
  }

  if (routerDecision.route === "TROUBLESHOOTING_QA") {
    const fallback = buildTroubleshootingFallback(routerDecision.symptom, promptChunks);
    const answerLooksUnsupported = /информац(?:ия|ии)\s+.*отсутств|не\s+найден|недостаточно\s+данных/iu.test(
      finalAnswer
    );
    const prefersChecklistFallback =
      routerDecision.symptom === "humidity" && isHumidityChecklistIntent(message);
    if (
      fallback &&
      !ragPure &&
      (!llmUsed || answerLooksUnsupported || prefersChecklistFallback)
    ) {
      finalAnswer = fallback;
      trace.setLlm({
        ...(trace.llm || {}),
        deterministicTroubleshootingFallback: true,
        fallbackSymptom: routerDecision.symptom,
      });
    }
    if (isHumidityNotDroppingQuery(message) && String(finalAnswer || "").trim()) {
      finalAnswer = appendHumidityMandatoryChecks(finalAnswer);
    }
  }

  finalAnswer = sanitizeLlmAnswerArtifacts(finalAnswer, {
    route: routerDecision.route,
    message,
  });

  if (shouldUseHonestRag(equipment.id)) {
    const extractDebug = {};
    const extracted = tryHonestContextualNumericFact({
      equipmentId: equipment.id,
      message,
      intent: retrieval.intent,
      promptChunks,
      retrievalContext,
      parameterFactLlm,
      priorAnswer: finalAnswer,
      traceOut: captureTrace ? extractDebug : null,
    });
    if (extracted) {
      finalAnswer = extracted;
      if (extractDebug.kind) {
        sources = appendRetrievalCardSource(sources, extractDebug.kind);
      }
      trace.setLlm({
        ...(trace.llm || {}),
        mode: "CONTEXTUAL_FACT_FALLBACK",
        deterministicParseFallback: true,
        honestContextExtract: true,
        ...(captureTrace ? { contextualExtract: extractDebug } : {}),
      });
    } else if (captureTrace && Object.keys(extractDebug).length > 0 && !trace.llm?.contextualExtract?.applied) {
      trace.setLlm({
        ...(trace.llm || {}),
        contextualExtract: extractDebug,
      });
    }
  }

  const answerBeforeGuardrails = finalAnswer;
  const scores = retrieval.scores || {};
  const semanticHint = Math.max(
    Number(scores.topScore) || 0,
    Number(scores.fusionScore) || 0,
    Number(scores.lexicalScore) || 0,
    Number(scores.vectorTopSimilarity) || 0,
  );
  const deliveryMethod = resolveAnswerDeliveryMethod(trace.llm);

  ragInfo("pipeline.before_guardrails", {
    deliveryMethod,
    candidateLen: String(answerBeforeGuardrails || "").length,
    semanticHint,
    semanticRescueThreshold: ragConfig.semanticRescueThreshold,
    deferredPostGate: shouldDeferGuardrailsToPostGate(equipmentProfile, equipment.id),
  });

  const pipelineIntent = pipelineIntentForValidation(routerDecision, retrieval);

  if (shouldDeferGuardrailsToPostGate(equipmentProfile, equipment.id)) {
    let outboundAnswer = String(finalAnswer || "").trim() || STRICT_ABSTAIN;
    if (shouldUseHonestRag(equipment.id)) {
      const extractDebug = {};
      const extracted = tryHonestContextualNumericFact({
        equipmentId: equipment.id,
        message,
        intent: retrieval.intent,
        promptChunks,
        retrievalContext,
        parameterFactLlm,
        priorAnswer: outboundAnswer,
        traceOut: captureTrace ? extractDebug : null,
      });
      if (extracted) {
        outboundAnswer = extracted;
        if (extractDebug.kind) {
          sources = appendRetrievalCardSource(sources, extractDebug.kind);
        }
        trace.setLlm({
          ...(trace.llm || {}),
          mode: "CONTEXTUAL_FACT_FALLBACK",
          deterministicParseFallback: true,
          honestContextExtract: true,
          ...(captureTrace ? { contextualExtract: extractDebug } : {}),
        });
      } else if (captureTrace && Object.keys(extractDebug).length > 0 && !trace.llm?.contextualExtract?.applied) {
        trace.setLlm({
          ...(trace.llm || {}),
          contextualExtract: extractDebug,
        });
      }
    }
    trace.setGuardrails({ skipped: true, reason: "deferred_to_server_post_gate" });
    trace.setAnswerDelivery({
      method: deliveryMethod,
      deferredPostGate: true,
      outboundLen: outboundAnswer.length,
    });
    return {
      answer: outboundAnswer,
      sources,
      retrievalContext,
      retrieval: {
        route: routerDecision.route,
        retrievalStrategy: retrieval.bestMode,
        topScore: retrieval.scores.topScore,
        chunks: fusedChunks.length,
        lexicalScore: retrieval.scores.lexicalScore,
        fusionScore: retrieval.scores.fusionScore,
        fallback: decision.action === ACTIONS.ABSTAIN,
        llmUsed,
        deterministicUsed: Boolean(trace.llm?.deterministic),
        abstained: decision.action === ACTIONS.ABSTAIN,
        intent: retrieval.intent,
      },
      ragTrace: trace.build(),
    };
  }

  const guardrails = runGuardrails({
    answer: finalAnswer,
    retrievalContext,
    intent: {
      ...pipelineIntent,
      contextHasSpecOrTableChunks: promptChunks.some((ch) => {
        const k = ch?.metadata?.chunkKind;
        return k === "spec" || k === "table";
      }),
    },
    hints: {
      deliveryMethod,
      semanticSimilarity: semanticHint,
      semanticRescueThreshold: ragConfig.semanticRescueThreshold,
    },
  });
  trace.setGuardrails(guardrails);

  let outboundAnswer = STRICT_ABSTAIN;
  if (guardrails.action === "ALLOW" && guardrails.passed) {
    const ot = guardrails.outputText;
    if (ot != null && String(ot).trim() !== "") {
      outboundAnswer = String(ot);
    } else {
      outboundAnswer = String(finalAnswer || "").trim() || STRICT_ABSTAIN;
    }
  } else if (guardrails.action === "ABSTAIN") {
    ragWarn("pipeline.guardrails_abstain", {
      deliveryMethod,
      reason: guardrails.reason,
      candidateLen: String(answerBeforeGuardrails || "").length,
    });
    outboundAnswer = STRICT_ABSTAIN;
  } else {
    ragWarn("pipeline.guardrails_unexpected_shape", {
      deliveryMethod,
      action: guardrails.action,
      passed: guardrails.passed,
    });
    outboundAnswer = STRICT_ABSTAIN;
  }

  const traceDeliveryMethod =
    guardrails.semanticRescue === true ? "semantic_rescue" : deliveryMethod;
  trace.setAnswerDelivery({
    method: traceDeliveryMethod,
    guardrailReason: guardrails.reason,
    guardrailAction: guardrails.action,
    semanticHint,
    semanticRescue: Boolean(guardrails.semanticRescue),
    outboundLen: String(outboundAnswer).length,
  });

  ragInfo("pipeline.outbound", {
    method: traceDeliveryMethod,
    guardrailAction: guardrails.action,
    guardrailReason: guardrails.reason,
    outLen: String(outboundAnswer).length,
  });

  return {
    answer: outboundAnswer,
    sources,
    retrievalContext,
    retrieval: {
      route: routerDecision.route,
      retrievalStrategy: retrieval.bestMode,
      topScore: retrieval.scores.topScore,
      chunks: fusedChunks.length,
      lexicalScore: retrieval.scores.lexicalScore,
      fusionScore: retrieval.scores.fusionScore,
      fallback: decision.action === ACTIONS.ABSTAIN,
      llmUsed,
      deterministicUsed: false,
      groundingPassed: guardrails.passed,
      abstained:
        (guardrails.action === "ABSTAIN" && outboundAnswer === STRICT_ABSTAIN) ||
        decision.action === ACTIONS.ABSTAIN,
      intent: retrieval.intent,
    },
    ragTrace: trace.build(),
  };
}

module.exports = {
  runPipeline,
  sourcesFromPromptChunks,
};
