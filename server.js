const express = require("express");
const path = require("path");
const equipmentCatalog = require("./data/equipment.json");
const { getRagConfig } = require("./src/rag/config");
const { getPool, ensureRagSchema } = require("./src/rag/pg-client");
const {
  retrieveEquipmentContext,
  formatContextForPrompt,
  extractSources,
} = require("./src/rag/retrieval");

const app = express();

function resolveListenPort() {
  const n = Number(process.env.PORT);
  if (Number.isFinite(n) && n > 0 && n <= 65535) {
    return Math.floor(n);
  }
  return 3000;
}

function resolveListenHost() {
  if (process.env.HOST === undefined || process.env.HOST === "") {
    return "0.0.0.0";
  }
  return process.env.HOST;
}

const HOST = resolveListenHost();
const PORT = resolveListenPort();
const publicDir = path.join(__dirname, "public");
const OLLAMA_URL = "http://127.0.0.1:11434/api/chat";
const OLLAMA_MODEL = "qwen2.5:7b-instruct";
const ragConfig = getRagConfig();
const SAFETY_QUESTION_PATTERN =
  /\b(что проверить|чек-?лист|безопасн|риск|проверк[аи]|инспекц|охрана труда|авар|чп|дым|огонь|пожар|искрен|гар[ьи]|коротк(ое|ого)?\s+замыкан|замыкани|угроз[аы]\s+жизни|эваку)\b/i;
const EMERGENCY_PATTERN =
  /\b(дым|огонь|пожар|искрен|гар[ьи]|коротк(ое|ого)?\s+замыкан|замыкани|угроз[аы]\s+жизни|эваку|горит|возгора)\b/i;
const SYNTHESIS_PATTERN =
  /\b(подготовк[аи]|порядок|алгоритм|последовательност|этап|перед\s+работой|процесс\s+подготовки|что\s+сначала|что\s+потом)\b/i;
const UNSAFE_ADVICE_PATTERN =
  /\b(ремонт|чинить|почин(ить|ка)|разобрать|продолж(ать|айте)\s+работ|перезапуст(ить|ите)|включ(ить|ите)\s+обратно)\b/i;

function getTimestamp() {
  return new Date().toISOString();
}

function logInfo(message, details) {
  if (details) {
    console.log(`[${getTimestamp()}] INFO ${message}`, details);
    return;
  }

  console.log(`[${getTimestamp()}] INFO ${message}`);
}

function logError(message, details) {
  if (details) {
    console.error(`[${getTimestamp()}] ERROR ${message}`, details);
    return;
  }

  console.error(`[${getTimestamp()}] ERROR ${message}`);
}

function getEquipment(equipmentId) {
  return equipmentCatalog[equipmentId] || null;
}

function getEquipmentList() {
  return Object.values(equipmentCatalog);
}

function toEquipmentSummary(equipment) {
  return {
    id: equipment.id,
    name: equipment.name,
    type: equipment.type,
    description: equipment.description,
    image: equipment.image,
    imageAlt: equipment.imageAlt,
    manualUrl: equipment.manualUrl,
    summary: equipment.summary,
  };
}

function isSafetyChecklistQuestion(message) {
  return SAFETY_QUESTION_PATTERN.test(message);
}

function isEmergencyQuestion(message) {
  return EMERGENCY_PATTERN.test(message);
}

function isSynthesisQuestion(message) {
  return SYNTHESIS_PATTERN.test(message);
}

function tryParseJson(jsonText) {
  if (typeof jsonText !== "string" || !jsonText.trim()) {
    return null;
  }

  try {
    return JSON.parse(jsonText);
  } catch (error) {
    const fenced = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced && fenced[1]) {
      try {
        return JSON.parse(fenced[1]);
      } catch (nestedError) {
        return null;
      }
    }

    return null;
  }
}

function buildChecklistAnswer(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return "Недостаточно подтвержденных данных в документации для формирования чек-листа.";
  }

  return items
    .map((item, index) => {
      const evidenceLines = Array.isArray(item.evidence) ? item.evidence : [];
      const evidenceText =
        evidenceLines.length > 0
          ? evidenceLines
              .map((entry, evidenceIndex) => {
                const quote = entry?.quote ? entry.quote : "Цитата не указана.";
                const source = entry?.source ? entry.source : "Источник не указан.";
                return `   Подтверждение ${evidenceIndex + 1}: ${quote}\n   Источник ${evidenceIndex + 1}: ${source}`;
              })
              .join("\n")
          : `   Подтверждение: ${item.evidenceQuote}\n   Источник: ${item.evidenceSource}`;
      const typePrefix =
        item.type === "interpretation" ? "[Интерпретация] " : "";
      return [
        `${index + 1}. Проверка: ${typePrefix}${item.check}`,
        `   Почему критично: ${item.criticalReason}`,
        `   Уверенность: ${item.confidence}`,
        evidenceText,
        `   Синтез: ${item.composed ? "да" : "нет"}`,
      ].join("\n");
    })
    .join("\n\n");
}

function normalizeChecklistItems(rawItems) {
  if (!Array.isArray(rawItems)) {
    return [];
  }

  return rawItems
    .map((item) => ({
      check: typeof item?.check === "string" ? item.check.trim() : "",
      criticalReason:
        typeof item?.criticalReason === "string" ? item.criticalReason.trim() : "",
      evidenceQuote:
        typeof item?.evidenceQuote === "string" ? item.evidenceQuote.trim() : "",
      evidenceSource:
        typeof item?.evidenceSource === "string" ? item.evidenceSource.trim() : "",
      composed: Boolean(item?.composed),
      type:
        item?.type === "interpretation" || item?.type === "fact"
          ? item.type
          : "fact",
      confidence:
        item?.confidence === "high" ||
        item?.confidence === "medium" ||
        item?.confidence === "low"
          ? item.confidence
          : "medium",
      evidence: Array.isArray(item?.evidence)
        ? item.evidence
            .map((entry) => ({
              quote: typeof entry?.quote === "string" ? entry.quote.trim() : "",
              source: typeof entry?.source === "string" ? entry.source.trim() : "",
            }))
            .filter((entry) => entry.quote && entry.source)
        : [],
    }))
    .filter(
      (item) =>
        item.check &&
        item.criticalReason &&
        (item.evidence.length > 0 || (item.evidenceQuote && item.evidenceSource))
    );
}

function enforceSynthesisEvidence(items, synthesisMode) {
  if (!synthesisMode) {
    return { validItems: items, weakItems: [] };
  }

  const validItems = [];
  const weakItems = [];
  for (const item of items) {
    if (!item.composed) {
      validItems.push(item);
      continue;
    }

    const evidenceEntries = item.evidence;
    const uniqueSources = new Set((evidenceEntries || []).map((entry) => entry.source));
    if (Array.isArray(evidenceEntries) && evidenceEntries.length >= 2 && uniqueSources.size >= 2) {
      validItems.push(item);
    } else {
      weakItems.push({
        check: item.check,
        reason: "[Недостаточно данных в тексте]",
      });
    }
  }

  return { validItems, weakItems };
}

function removeUnsafeChecklistItems(items) {
  const blocked = [];
  const allowed = [];

  for (const item of items) {
    const text = [item.check, item.criticalReason, item.evidenceQuote, item.evidenceSource]
      .join(" ")
      .toLowerCase();
    if (UNSAFE_ADVICE_PATTERN.test(text)) {
      blocked.push(item);
      continue;
    }
    allowed.push(item);
  }

  return {
    allowedItems: allowed,
    blockedItems: blocked,
  };
}

function buildSystemPrompt(equipment, retrievalContext, options = {}) {
  const safetyMode = Boolean(options.safetyMode);
  const emergencyMode = Boolean(options.emergencyMode);
  const synthesisMode = Boolean(options.synthesisMode);

  if (!equipment) {
    return [
      "Ты ассистент по промышленному оборудованию.",
      "Если оборудование не указано, вежливо попроси пользователя открыть чат из карточки конкретного оборудования.",
      "Не придумывай характеристики, которых нет в контексте.",
      "Отвечай кратко и по-русски.",
    ].join("\n");
  }

  return [
    safetyMode
      ? "Ты инженер по технике безопасности компании Совтест АТЕ."
      : "Ты ассистент технической поддержки промышленного оборудования.",
    `Текущий контекст оборудования: ${equipment.name} (${equipment.id}).`,
    `Описание: ${equipment.description}.`,
    `Известные факты: ${equipment.summary}`,
    ...equipment.details.map((detail) => `- ${detail}`),
    "Контекст из инструкций и документов:",
    retrievalContext,
    "Отвечай только в рамках этого оборудования.",
    "Опирайся на контекст из документов как на главный источник фактов.",
    "ИСПОЛЬЗУЙ ТОЛЬКО пункты из предоставленного контекста документов.",
    "ЗАПРЕЩЕНО добавлять или додумывать пункты, отсутствующие в контексте.",
    "Если данных для детали недостаточно, явно укажи: [Недостаточно данных в тексте].",
    emergencyMode
      ? "АВАРИЙНОЕ ПРАВИЛО: при огне, дыме, коротком замыкании или угрозе жизни разрешены только: отключение питания, безопасная дистанция/эвакуация, вызов экстренных служб, уведомление ответственных."
      : "Если нет аварийной ситуации, придерживайся обычных правил безопасной эксплуатации.",
    emergencyMode
      ? "ЗАПРЕЩЕНО предлагать самостоятельный ремонт, диагностику или продолжение работы в момент аварии."
      : "Не предлагай действий, которые не подтверждаются контекстом.",
    synthesisMode
      ? "РАЗРЕШЕНО собирать алгоритм из нескольких подтвержденных фрагментов. Новая структура шагов допустима, новые факты — запрещены."
      : "Если вопрос не требует алгоритма, отвечай без искусственной детализации.",
    synthesisMode
      ? "Считай галлюцинацией только новый факт, но не нумерацию, порядок или объединение подтвержденных действий."
      : "Не выходи за пределы подтвержденных фактов контекста.",
    "Явно разделяй: fact (прямой факт из текста) и interpretation (вывод из фактов).",
    safetyMode
      ? "Твоя цель: выделять только критические риски и необходимые проверки по ТБ."
      : "Отвечай по сути вопроса, опираясь на документальный контекст.",
    "Если вопрос не относится к этой модели, прямо скажи об этом.",
    "Если в контексте не хватает данных, честно укажи это и предложи уточнить вопрос.",
    "Не используй LaTeX-запись и команды вроде \\downarrow, \\uparrow, \\to, \\Rightarrow, \\Leftarrow, \\text{>}, \\text{<}, \\approx, \\infty.",
    "Используй обычный текст и Unicode-символы: ↓ ↑ → ⇒ ⇐ > < ≈ ∞.",
    "Отвечай по-русски, структурно и без выдуманных технических параметров.",
  ].join("\n");
}

async function callOllamaChat({ model, messages, format }) {
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      stream: false,
      format: format || undefined,
      messages,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Ollama request failed (${response.status} ${response.statusText}): ${details}`
    );
  }

  const payload = await response.json();
  const content = payload?.message?.content?.trim() || "";
  if (!content) {
    throw new Error("Ollama returned empty content.");
  }

  return content;
}

async function detectSafetyModeWithClassifier(message, model, fallbackModel) {
  const classifierPrompt = [
    "Определи, связан ли запрос с безопасностью или аварией.",
    "Верни строго JSON:",
    '{"safetyMode":true,"emergencyMode":false,"synthesisMode":false,"triggerTerms":["..."],"reason":"..."}',
    "safetyMode=true если запрос о проверках/рисках/ТБ/безопасности/аварии.",
    "emergencyMode=true если есть дым, огонь, искрение, гарь, КЗ, угроза жизни или эвакуация.",
    "synthesisMode=true если нужно собрать алгоритм или порядок действий из подтвержденных фактов.",
  ].join("\n");

  const user = `Запрос пользователя: ${message}`;

  let content = "";
  try {
    content = await callOllamaChat({
      model,
      format: "json",
      messages: [
        { role: "system", content: classifierPrompt },
        { role: "user", content: user },
      ],
    });
  } catch (error) {
    content = await callOllamaChat({
      model: fallbackModel,
      format: "json",
      messages: [
        { role: "system", content: classifierPrompt },
        { role: "user", content: user },
      ],
    });
  }

  const parsed = tryParseJson(content);
  return {
    safetyMode: Boolean(parsed?.safetyMode),
    emergencyMode: Boolean(parsed?.emergencyMode),
    synthesisMode: Boolean(parsed?.synthesisMode),
    triggerTerms: Array.isArray(parsed?.triggerTerms) ? parsed.triggerTerms : [],
    reason: typeof parsed?.reason === "string" ? parsed.reason : "",
  };
}

function buildSafeEmergencyFallback() {
  return [
    "1. Немедленно отключите питание оборудования (если это можно сделать безопасно).",
    "2. Не выполняйте ремонт и не продолжайте работу до устранения аварии.",
    "3. Удалитесь на безопасную дистанцию и организуйте эвакуацию при необходимости.",
    "4. Вызовите экстренные службы и уведомите ответственного за безопасность.",
  ].join("\n");
}

async function verifyChecklistItems({
  checklistItems,
  retrievalContext,
  model,
  fallbackModel,
  emergencyMode,
  synthesisMode,
}) {
  const verifierPrompt = [
    "Ты проверяешь антигаллюцинации в safety-чеклисте.",
    "Проверь каждый пункт списка: подтверждается ли он контекстом.",
    "Разрешай пункт ТОЛЬКО если есть явная опора в цитате и источнике.",
    emergencyMode
      ? "Блокируй пункт, если он предлагает ремонт, диагностику или продолжение работы при аварии."
      : "Блокируй только неподтвержденные и опасные пункты.",
    synthesisMode
      ? "Разрешено объединять подтвержденные факты в новую структуру шагов. Это НЕ ошибка."
      : "Требуй прямое подтверждение каждого пункта.",
    "Верни строго JSON формата:",
    '{"items":[{"index":0,"supported":true,"reason":"..."}]}',
  ].join("\n");

  const verifyUser = [
    "Контекст:",
    retrievalContext,
    "",
    "Кандидатный список:",
    JSON.stringify({ items: checklistItems }),
  ].join("\n");

  let verifierContent = "";
  try {
    verifierContent = await callOllamaChat({
      model,
      format: "json",
      messages: [
        { role: "system", content: verifierPrompt },
        { role: "user", content: verifyUser },
      ],
    });
  } catch (error) {
    verifierContent = await callOllamaChat({
      model: fallbackModel,
      format: "json",
      messages: [
        { role: "system", content: verifierPrompt },
        { role: "user", content: verifyUser },
      ],
    });
  }

  const parsed = tryParseJson(verifierContent);
  const decisions = Array.isArray(parsed?.items) ? parsed.items : [];
  const allowedIndexes = new Set(
    decisions.filter((item) => item?.supported === true).map((item) => item.index)
  );

  const verifiedItems = checklistItems.filter((item, index) => allowedIndexes.has(index));
  const unverifiedItems = checklistItems.filter((item, index) => !allowedIndexes.has(index));
  const postFilter = removeUnsafeChecklistItems(verifiedItems);

  return {
    verifiedItems: postFilter.allowedItems,
    droppedItems: Math.max(0, checklistItems.length - postFilter.allowedItems.length),
    blockedUnsafeItems: postFilter.blockedItems.length,
    unverifiedItems: unverifiedItems.map((item) => ({
      check: item.check,
      reason: "[Недостаточно данных в тексте]",
    })),
  };
}

// Serve the static frontend assets from the public directory.
app.use((req, res, next) => {
  const startedAt = Date.now();

  res.on("finish", () => {
    logInfo(`${req.method} ${req.originalUrl} -> ${res.statusCode}`, {
      durationMs: Date.now() - startedAt,
      ip: req.ip,
    });
  });

  next();
});

app.use(express.static(publicDir));
app.use(express.json());

app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/chat", (req, res) => {
  res.sendFile(path.join(publicDir, "chat.html"));
});

app.get("/api/equipment", (req, res) => {
  return res.json({
    items: getEquipmentList().map(toEquipmentSummary),
  });
});

app.get("/api/equipment/:equipmentId", (req, res) => {
  const equipment = getEquipment(req.params.equipmentId);

  if (!equipment) {
    logError("Equipment not found.", {
      equipmentId: req.params.equipmentId,
    });
    return res.status(404).json({
      error: "Equipment not found.",
    });
  }

  return res.json(equipment);
});

app.get("/equipment/:equipmentId", (req, res) => {
  const equipment = getEquipment(req.params.equipmentId);

  if (!equipment) {
    logError("Equipment page requested for unknown id.", {
      equipmentId: req.params.equipmentId,
    });
    return res.status(404).sendFile(path.join(publicDir, "index.html"));
  }

  return res.sendFile(path.join(publicDir, "index.html"));
});

app.post("/api/chat", async (req, res) => {
  const { equipmentId, message, history } = req.body || {};
  const trimmedMessage = typeof message === "string" ? message.trim() : "";

  if (!trimmedMessage) {
    logError("Chat request rejected: empty message.", { equipmentId });
    return res.status(400).json({ error: "Message is required." });
  }

  const equipment = getEquipment(equipmentId);

  if (!equipment) {
    logError("Chat request rejected: unknown equipment.", { equipmentId });
    return res.status(404).json({
      error: "Equipment not found.",
    });
  }

  const normalizedHistory = Array.isArray(history)
    ? history
        .filter(
          (entry) =>
            entry &&
            (entry.role === "user" || entry.role === "assistant") &&
            typeof entry.content === "string" &&
            entry.content.trim()
        )
        .slice(-10)
        .map((entry) => ({
          role: entry.role,
          content: entry.content.trim(),
        }))
    : [];

  logInfo("Chat request received.", {
    equipmentId: equipment?.id || equipmentId || null,
    equipmentName: equipment?.name || null,
    historyItems: normalizedHistory.length,
    questionPreview: trimmedMessage.slice(0, 120),
  });

  try {
    const keywordSafety = isSafetyChecklistQuestion(trimmedMessage);
    const keywordEmergency = isEmergencyQuestion(trimmedMessage);
    const keywordSynthesis = isSynthesisQuestion(trimmedMessage);
    const classifierDecision = await detectSafetyModeWithClassifier(
      trimmedMessage,
      ragConfig.safetyClassifierModel,
      OLLAMA_MODEL
    );
    const safetyMode = keywordSafety || keywordEmergency || classifierDecision.safetyMode;
    const emergencyMode = keywordEmergency || classifierDecision.emergencyMode;
    const synthesisMode =
      !emergencyMode && (keywordSynthesis || classifierDecision.synthesisMode);
    const safetySubmode = emergencyMode
      ? "safety_extract"
      : safetyMode
        ? "safety_synthesize"
        : "normal";
    const triggerTerms = [
      ...(keywordSafety ? ["keyword:safety"] : []),
      ...(keywordEmergency ? ["keyword:emergency"] : []),
      ...(keywordSynthesis ? ["keyword:synthesis"] : []),
      ...classifierDecision.triggerTerms.map((term) => `classifier:${term}`),
    ];
    const requestedTopK = safetyMode
      ? emergencyMode
        ? ragConfig.emergencyRetrievalTopK
        : synthesisMode
          ? ragConfig.synthesisRetrievalTopK
          : ragConfig.safetyRetrievalTopK
      : ragConfig.retrievalTopK;
    const retrieval = await retrieveEquipmentContext({
      equipmentId: equipment.id,
      query: trimmedMessage,
      topK: requestedTopK,
    });
    const sources = extractSources(retrieval.chunks);
    const retrievalContext = formatContextForPrompt(retrieval.chunks);

    logInfo("Retrieval completed.", {
      equipmentId: equipment.id,
      mode: safetyMode ? "safety" : "normal",
      safetyMode,
      emergencyMode,
      synthesisMode,
      safetySubmode,
      triggerTerms,
      triggerType:
        keywordSafety || keywordEmergency
          ? "keyword"
          : classifierDecision.safetyMode || classifierDecision.emergencyMode
            ? "classifier"
            : "none",
      classifierReason: classifierDecision.reason,
      selectedTopK: retrieval.selectedTopK,
      chunks: retrieval.chunks.length,
      topScore: retrieval.topScore,
      retrievalLatencyMs: retrieval.retrievalLatencyMs,
      topSources: retrieval.chunks.slice(0, 3).map((chunk) => ({
        sourceDoc: chunk.sourceDoc,
        section: chunk.section,
        score: chunk.score,
      })),
    });

    const ragEnabled = Boolean(ragConfig.postgresUrl);
    if (
      ragEnabled &&
      (retrieval.chunks.length === 0 || retrieval.topScore < ragConfig.minSimilarityScore)
    ) {
      const fallbackAnswer =
        "Недостаточно данных в документации по этой модели, чтобы ответить уверенно. Уточните вопрос или проверьте инструкцию.";

      logInfo("Low-relevance retrieval fallback used.", {
        equipmentId: equipment.id,
        topScore: retrieval.topScore,
        minRequiredScore: ragConfig.minSimilarityScore,
        chunks: retrieval.chunks.length,
        retrievalLatencyMs: retrieval.retrievalLatencyMs,
      });

      return res.json({
        equipmentId: equipment.id,
        equipmentName: equipment.name,
        answer: fallbackAnswer,
        sources,
        retrieval: {
          topScore: retrieval.topScore,
          chunks: retrieval.chunks.length,
          retrievalLatencyMs: retrieval.retrievalLatencyMs,
          fallback: true,
        },
      });
    }

    const ollamaStartedAt = Date.now();
    let answer = "";
    let responseItems = [];
    let verification = {
      enabled: safetyMode,
      emergencyMode,
      synthesisMode,
      safetySubmode,
      candidateItems: 0,
      acceptedItems: 0,
      droppedItems: 0,
      blockedUnsafeItems: 0,
      jsonRetryUsed: false,
    };

    if (safetyMode) {
      const checklistPrompt = [
        trimmedMessage,
        "",
        "Верни строго JSON формата:",
        '{"items":[{"check":"...","criticalReason":"...","type":"fact","confidence":"high","composed":true,"evidence":[{"quote":"...","source":"..."}]}]}',
        "Требования:",
        "- Только критические проверки.",
        "- Каждый пункт обязан содержать подтверждение из контекста.",
        "- type: fact или interpretation. interpretation обязательно помечай как вывод.",
        "- confidence: high/medium/low.",
        synthesisMode
          ? "- Разрешено строить новую последовательность шагов из подтвержденных фактов."
          : "- Новая структура не обязательна; используй прямые пункты контекста.",
        synthesisMode
          ? "- Для composed=true указывай минимум два подтверждения evidence[] из разных источников."
          : "- Можно указывать одно подтверждение evidence[].",
        emergencyMode
          ? "- Аварийный сценарий: не предлагай ремонт/диагностику/продолжение работы."
          : "- Избегай небезопасных действий и недоказанных рекомендаций.",
        "- Если подтвержденных пунктов нет, верни {\"items\":[]}.",
      ].join("\n");

      const checklistMessages = [
        {
          role: "system",
          content: buildSystemPrompt(equipment, retrievalContext, {
            safetyMode,
            emergencyMode,
            synthesisMode,
          }),
        },
        ...normalizedHistory,
        {
          role: "user",
          content: checklistPrompt,
        },
      ];

      let generatedContent = await callOllamaChat({
        model: OLLAMA_MODEL,
        format: "json",
        messages: checklistMessages,
      });

      let parsed = tryParseJson(generatedContent);
      let candidateItems = normalizeChecklistItems(parsed?.items);
      let synthesisEvidenceCheck = enforceSynthesisEvidence(candidateItems, synthesisMode);
      candidateItems = synthesisEvidenceCheck.validItems;
      if (!candidateItems.length) {
        verification.jsonRetryUsed = true;
        const retryPrompt = [
          checklistPrompt,
          "",
          "Повтори ответ СТРОГО JSON без markdown.",
          '{"items":[{"check":"...","criticalReason":"...","type":"fact","confidence":"high","composed":true,"evidence":[{"quote":"...","source":"..."}]}]}',
          "Если нет подтверждений, верни {\"items\":[]}.",
        ].join("\n");
        generatedContent = await callOllamaChat({
          model: OLLAMA_MODEL,
          format: "json",
          messages: [
            ...checklistMessages.slice(0, -1),
            { role: "user", content: retryPrompt },
          ],
        });
        parsed = tryParseJson(generatedContent);
        candidateItems = normalizeChecklistItems(parsed?.items);
        synthesisEvidenceCheck = enforceSynthesisEvidence(candidateItems, synthesisMode);
        candidateItems = synthesisEvidenceCheck.validItems;
      }

      verification.candidateItems = candidateItems.length;

      const verified = await verifyChecklistItems({
        checklistItems: candidateItems,
        retrievalContext,
        model: ragConfig.verifierModel,
        fallbackModel: OLLAMA_MODEL,
        emergencyMode,
        synthesisMode,
      });
      verification.acceptedItems = verified.verifiedItems.length;
      verification.droppedItems = verified.droppedItems;
      verification.blockedUnsafeItems = verified.blockedUnsafeItems;
      const notConfirmed = [
        ...verified.unverifiedItems,
        ...synthesisEvidenceCheck.weakItems,
      ];

      if (!verified.verifiedItems.length) {
        if (emergencyMode) {
          answer = buildSafeEmergencyFallback();
        } else {
          answer = [
            "Недостаточно подтвержденных фактов для полного ответа.",
            "[Недостаточно данных в тексте]",
          ].join("\n");
        }
      } else {
        responseItems = verified.verifiedItems;
        answer = buildChecklistAnswer(verified.verifiedItems);
        if (!emergencyMode && notConfirmed.length > 0) {
          const unresolvedBlock = [
            "Что не удалось подтвердить:",
            ...notConfirmed.map((item, index) => {
              const checkText = item?.check || "Неуточненный пункт";
              return `${index + 1}. ${checkText} — [Недостаточно данных в тексте]`;
            }),
          ].join("\n");
          answer = [
            answer,
            "",
            unresolvedBlock,
          ].join("\n");
        }
      }
    } else {
      answer = await callOllamaChat({
        model: OLLAMA_MODEL,
        messages: [
          {
            role: "system",
            content: buildSystemPrompt(equipment, retrievalContext, {
              safetyMode,
              emergencyMode,
              synthesisMode,
            }),
          },
          ...normalizedHistory,
          {
            role: "user",
            content: trimmedMessage,
          },
        ],
      });
    }

    if (!answer) {
      logError("Ollama returned empty answer.", {
        equipmentId: equipment?.id || equipmentId || null,
      });
      return res.status(502).json({
        error: "Ollama returned an empty response.",
      });
    }

    logInfo("Ollama answer generated.", {
      equipmentId: equipment?.id || equipmentId || null,
      mode: safetyMode ? "safety" : "normal",
      safetyMode,
      emergencyMode,
      synthesisMode,
      safetySubmode,
      triggerTerms,
      durationMs: Date.now() - ollamaStartedAt,
      verification,
      answerPreview: answer.slice(0, 160),
    });

    return res.json({
      equipmentId: equipment.id,
      equipmentName: equipment.name,
      answer,
      items: responseItems,
      sources,
      retrieval: {
        topScore: retrieval.topScore,
        chunks: retrieval.chunks.length,
        retrievalLatencyMs: retrieval.retrievalLatencyMs,
        fallback: false,
      },
      safety: {
        safetyMode,
        emergencyMode,
        synthesisMode,
        submode: safetySubmode,
        triggerTerms,
      },
      verification,
    });
  } catch (error) {
    logError("Failed to reach Ollama.", {
      equipmentId: equipment.id,
      details: error instanceof Error ? error.message : "Unknown error",
    });
    return res.status(502).json({
      error: "Failed to reach Ollama.",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

const server = app.listen(PORT, HOST, () => {
  logInfo(`Equipment support server is listening on ${HOST}:${PORT}`);
  if (HOST === "0.0.0.0") {
    logInfo(`Locally open http://127.0.0.1:${PORT} or http://localhost:${PORT}`);
  } else {
    logInfo(`Open http://${HOST}:${PORT}`);
  }
  logInfo("Available equipment loaded.", {
    equipmentIds: Object.keys(equipmentCatalog),
    ollamaModel: OLLAMA_MODEL,
    embeddingModel: ragConfig.embeddingModel,
  });
});

const ragPool = getPool(ragConfig.postgresUrl);
if (ragPool) {
  ensureRagSchema(ragPool)
    .then(() => {
      logInfo("RAG schema is ready.", {
        retrievalTopK: ragConfig.retrievalTopK,
        minSimilarityScore: ragConfig.minSimilarityScore,
      });
    })
    .catch((error) => {
      logError("Failed to initialize RAG schema.", {
        details: error instanceof Error ? error.message : "Unknown error",
      });
    });
} else {
  logInfo("RAG is disabled because POSTGRES_URL is not set.");
}
