require("./scripts/load-env-file").loadEnvFile();

const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const EQUIPMENT_CATALOG_PATH = path.join(__dirname, "data", "equipment.json");
const { resolveEquipmentProfile, resolveEquipmentId } = require("./src/equipment/equipment-runtime");
const {
  isChatFileLogEnabled,
  normalizeTestMeta,
  summarizeRagTrace,
  recordChatExchange,
  recordChatError,
  getChatSessionLogPath,
  closeChatSessionLog,
  initChatSessionLog,
} = require("./src/chat-session-log");
const { getRagConfig, getMaxRetrievalTopK } = require("./src/rag/config");
const { getPool, ensureRagSchema } = require("./src/rag/pg-client");
const {
  retrieveEquipmentContext,
  formatContextForPrompt,
  extractSources,
} = require("./src/rag/retrieval");
const {
  classifyQueryIntent,
  llmGenerationOptionsForIntent,
  isTechnicalNumericQuery,
} = require("./src/rag/query-intent");
const { loadAllKnowledgeText } = require("./scripts/knowledge-content-loader");
const {
  buildSdb1106nmDirectPreamble,
  directContextHintsForMessage,
  tryDeterministicSdb1106nmAnswer,
  buildSdb1106nmDirectSystemContent,
  extractSafetyDocExcerpt,
} = require("./src/rag/sdb1106nm-direct-facts");
const { validateAnswerAgainstContext } = require("./src/rag/answer-validation");
const {
  createRagTrace,
  finalizeRagTrace,
} = require("./src/rag/telemetry/rag-trace");
const { fetchOllama } = require("./src/rag/ollama-fetch");
const { analyzeQuery, QUERY_TYPES } = require("./src/rag/query-analysis");
const { applySpecializedRetrievalStrategy } = require("./src/rag/retrieval-strategies");
const { buildProceduralMessages } = require("./src/rag/synthesis/procedural-synthesis");
const {
  buildTroubleshootingMessages,
  buildDiagnosticClarification,
} = require("./src/rag/synthesis/troubleshooting-synthesis");
const { buildReasoningMessages } = require("./src/rag/synthesis/reasoning-synthesis");
const { validateGrounding } = require("./src/rag/synthesis/grounding-validation");
const { routeQuery } = require("./src/rag/router/query-router");
const { runPipeline } = require("./src/rag/pipeline/run-pipeline");
const {
  shouldUseHonestRag,
  shouldAutoDirectWhenNoPostgres,
} = require("./src/rag/honest-rag-mode");
const { applyHonestRagPostGate } = require("./src/rag/honest-rag-post-gate");
const { classifySdb1106nmMessage, buildSafetyDeterministicOrPrompt } = require("./src/rag/sdb1106nm-chat-gate");
const {
  applySdb1106nmPostGate,
  resolveDeliveryMethodFromLlmTrace,
} = require("./src/rag/sdb1106nm-post-gate");
const { STRICT_ABSTAIN, buildSdb1106nmDirectSystemPrompt, buildSdb702nmDirectSystemPrompt, buildSdb302nmDirectSystemPrompt, buildSdb151nmDirectSystemPrompt, buildSdb1560mDirectSystemPrompt, buildSafetyGroundedSystemPrompt } = require("./src/rag/prompts");
const {
  getAuthConfig,
  isProductionRuntime,
  isKnownWeakSessionSecret,
  isKnownDefaultPostgresUrl,
} = require("./src/auth/auth-config");
const { ensurePortalSchema } = require("./src/auth/portal-schema");
const { createSessionMiddleware } = require("./src/auth/session");
const { mountAuthRoutes } = require("./src/auth/auth-routes");
const {
  requireAuth,
  filterEquipmentListForUser,
  equipmentAllowedForRequest,
} = require("./src/auth/require-auth");
const {
  normalizeSupportBody,
  validateSupportRequest,
  buildSupportEmailContent,
} = require("./src/support/validate-support-request");
const { validateSupportAttachments } = require("./src/support/validate-support-attachments");
const { supportUploadMiddleware } = require("./src/support/support-upload");
const { sendSupportEmail } = require("./src/support/send-support-email");

const app = express();
const helmet = require("helmet");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const supportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 8,
  keyGenerator: (req) => {
    const userIp = ipKeyGenerator(req.ip || "unknown");
    const userId = req.session?.user?.id ?? "anon";
    return `${userIp}_${userId}`;
  },
  message: { error: "Слишком много запросов в техподдержку. Попробуйте позже." },
  standardHeaders: true,
  legacyHeaders: false,
});
const authConfig = getAuthConfig();
const IS_PRODUCTION = isProductionRuntime();

if (authConfig.trustProxy) {
  app.set("trust proxy", 1);
} else {
  // Клиенты/расширения иногда шлют X-Forwarded-For напрямую на :3000 — без trust proxy
  // express-rate-limit считает это misconfiguration и ругается в консоль.
  app.use((req, _res, next) => {
    delete req.headers["x-forwarded-for"];
    delete req.headers["x-forwarded-proto"];
    delete req.headers["x-forwarded-host"];
    next();
  });
}

// Global Security Headers
app.use(helmet({
  hsts: false, // Отключаем HSTS (Strict-Transport-Security), так как для локальной сети/HTTP он может всё сломать. В продакшене HSTS обычно ставится на уровне Nginx
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      upgradeInsecureRequests: null // Отключаем автоматический редирект на HTTPS для локальной сети
    }
  }
}));

// Global Rate Limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: "Слишком много запросов с вашего IP, пожалуйста, попробуйте позже.",
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

// Specific Rate Limiting for Chat API to protect LLM from abuse
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Слишком много запросов к чату с вашего IP, пожалуйста, попробуйте позже.",
  standardHeaders: true,
  legacyHeaders: false,
});

function resolveListenPort() {
  const n = Number(process.env.PORT);
  if (Number.isFinite(n) && n > 0 && n <= 65535) {
    return Math.floor(n);
  }
  return 3000;
}

function resolveListenHost() {
  if (process.env.HOST === undefined || process.env.HOST === "") {
    if (IS_PRODUCTION) {
      return "127.0.0.1";
    }
    return "0.0.0.0";
  }
  return process.env.HOST;
}

function listLanIPv4Addresses() {
  const nets = os.networkInterfaces();
  const out = [];
  for (const entries of Object.values(nets)) {
    if (!entries) {
      continue;
    }
    for (const net of entries) {
      const fam = net.family;
      if ((fam === "IPv4" || fam === 4) && !net.internal) {
        out.push(net.address);
      }
    }
  }
  return [...new Set(out)];
}

const HOST = resolveListenHost();
const PORT = resolveListenPort();

/**
 * HTTP server socket limits for long RAG + Ollama (often 8–120s+ per request).
 * - HTTP_SERVER_TIMEOUT_MS: incoming connection idle/socket timeout (ms). Default 360000 (6 min), minimum 60000.
 *   Set to "0" to disable server.timeout (Node: no socket idle cap).
 * - CHAT_REQUEST_SOCKET_MS: per-request req/res/socket timeout for POST /api/chat only. Same default; "0" = clear.
 */
function resolveHttpServerTimeouts() {
  const raw = process.env.HTTP_SERVER_TIMEOUT_MS;
  if (raw === "0") {
    return { socketMs: 0, keepAliveMs: 125_000, headersMs: 130_000 };
  }
  const socketMs = Math.max(60_000, Number(raw || 360_000));
  return {
    socketMs,
    keepAliveMs: socketMs + 5_000,
    headersMs: socketMs + 10_000,
  };
}

function resolveChatRequestSocketMs() {
  const raw = process.env.CHAT_REQUEST_SOCKET_MS;
  if (raw === "0") {
    return 0;
  }
  return Math.max(60_000, Number(raw || 360_000));
}

function shouldExposeDebugChatFields() {
  if (IS_PRODUCTION) {
    return false;
  }
  const raw = String(process.env.DEBUG_CHAT_RESPONSE ?? "1").trim().toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "no" || raw === "off");
}

function sanitizeSourcesForClient(sources) {
  if (!Array.isArray(sources)) {
    return [];
  }
  return sources.map((source) => ({
    sourceDoc: source?.sourceDoc ?? null,
    page: source?.page ?? null,
    score: source?.score ?? null,
  }));
}

function buildChatResponsePayload({
  equipment,
  answer,
  items = [],
  sources = [],
  retrieval = null,
  ragTrace = null,
  chatMode = null,
  chatCapabilities = null,
}) {
  const payload = {
    equipmentId: equipment.id,
    equipmentName: equipment.name,
    answer,
    items,
    sources: IS_PRODUCTION ? sanitizeSourcesForClient(sources) : sources,
    chatMode,
  };

  if (shouldExposeDebugChatFields()) {
    payload.retrieval = retrieval;
    payload.ragTrace = ragTrace;
    payload.chatCapabilities = chatCapabilities;
  }

  return payload;
}

function normalizeChatHistoryEntries(history) {
  if (!Array.isArray(history)) {
    return [];
  }
  return history
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
      content: entry.content.trim().slice(0, 4000),
    }));
}

function getServerChatHistory(req, equipmentId) {
  const historyByEquipment = req.session?.chatHistory;
  if (!historyByEquipment || typeof historyByEquipment !== "object") {
    return [];
  }
  return normalizeChatHistoryEntries(historyByEquipment[equipmentId]);
}

function appendServerChatExchange(req, equipmentId, question, answer) {
  if (!req.session) {
    return;
  }
  const historyByEquipment =
    req.session.chatHistory && typeof req.session.chatHistory === "object"
      ? req.session.chatHistory
      : {};
  const current = normalizeChatHistoryEntries(historyByEquipment[equipmentId]);
  historyByEquipment[equipmentId] = normalizeChatHistoryEntries([
    ...current,
    { role: "user", content: question },
    { role: "assistant", content: answer },
  ]);
  req.session.chatHistory = historyByEquipment;
}

const publicDir = path.join(__dirname, "public");
/** Локальная раздача Markdown-санитайзера без CDN (телефон в LAN без интернета / блокировка CDN). */
const vendorMarkedPath = path.join(__dirname, "node_modules", "marked", "marked.min.js");
const vendorPurifyPath = path.join(
  __dirname,
  "node_modules",
  "dompurify",
  "dist",
  "purify.min.js"
);
const OLLAMA_URL = "http://127.0.0.1:11434/api/chat";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:32b-instruct";
const ragConfig = getRagConfig();

/** PDF руководства SDB1106 NM: env SDB1106_MANUAL_PDF или файл в public/manuals/SDB1106NM.pdf */
function resolveSdb1106ManualFilePath() {
  const fromEnv = process.env.SDB1106_MANUAL_PDF;
  if (typeof fromEnv === "string" && fromEnv.trim()) {
    const resolved = path.resolve(fromEnv.trim());
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }
  const inPublic = path.join(publicDir, "manuals", "SDB1106NM.pdf");
  if (fs.existsSync(inPublic)) {
    return inPublic;
  }
  return null;
}

/** Лимит контекста для /api/chat (см. WARN Ollama: num_ctx не больше обученного у модели). Переопределение: OLLAMA_NUM_CTX */
function resolveOllamaChatNumCtx() {
  const trainedCap = 131072;
  const fallback = 16384; // Reduced from 32768 to prevent GPU/CPU thrashing and high RAM (70GB+) swap freezes on local devices
  const n = Number(process.env.OLLAMA_NUM_CTX);
  let v = Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  v = Math.min(v, trainedCap);
  return Math.max(2048, v);
}

function getOllamaChatOptions({ directContext = false } = {}) {
  let numCtx = resolveOllamaChatNumCtx();
  if (directContext) {
    const directCtx = Number(process.env.OLLAMA_DIRECT_NUM_CTX);
    if (Number.isFinite(directCtx) && directCtx > 0) {
      numCtx = Math.min(Math.floor(directCtx), 131072);
    } else {
      numCtx = Math.max(numCtx, 32768);
    }
  }
  return { num_ctx: numCtx };
}

const WB = String.raw`(?<![\p{L}\p{N}])(?:`;
const WA = String.raw`)(?![\p{L}\p{N}])`;

const SAFETY_QUESTION_PATTERN = new RegExp(
  `${WB}что проверить|чек-?лист|безопасн|риск|инспекц|охрана труда|авар|чп|дым|огонь|пожар|искрен|гар[ьи]|коротк(ое|ого)?\\s+замыкан|замыкани|угроз[аы]\\s+жизни|эваку|проверк[аи]\\s+(?:по\\s+)?(?:тб|охране\\s+труда|безопасност)|какие\\s+проверк(?:и|а)${WA}`,
  "iu"
);
const EMERGENCY_PATTERN = new RegExp(
  `${WB}дым|огонь|пожар|искрен|гар[ьи]|коротк(ое|ого)?\\s+замыкан|замыкани|угроз[аы]\\s+жизни|эваку|горит|возгора${WA}`,
  "iu"
);
const SYNTHESIS_PATTERN = new RegExp(
  `${WB}подготовк[аи]|порядок|алгоритм|последовательност|этап|перед\\s+работой|процесс\\s+подготовки|полный\\s+процесс|что\\s+сначала|что\\s+потом${WA}`,
  "iu"
);
const PROCEDURE_PATTERN = new RegExp(
  `${WB}инструкц\\p{L}*|подготовк\\p{L}*|порядок\\p{L}*|алгоритм\\p{L}*|последовательност\\p{L}*|этап\\p{L}*${WA}`,
  "iu"
);
const PREPARATION_SECTION_PATTERN = new RegExp(
  `${WB}подготовк\\p{L}*${WA}`,
  "iu"
);
const UNSAFE_ADVICE_PATTERN = new RegExp(
  `${WB}ремонт|чинить|почин(ить|ка)|разобрать|продолж(ать|айте)\\s+работ|перезапуст(ить|ите)|включ(ить|ите)\\s+обратно${WA}`,
  "iu"
);

/**
 * Единые правила опоры на документ (полки, антигаллюцинации, источники).
 * Используются в buildSystemPrompt, JSON-чеклисте, верификаторе и самопроверке.
 */
const SHARED_DOCUMENTATION_RULES = [
  "RULES (строго): отвечай только на основе предоставленных фрагментов контекста; не объединяй несвязанные разделы документа в одну выводную логику.",
  "Не смешивай в одном ответе режимы Осушение / Хранение / Регенерация, если пользователь явно спросил только об одном режиме; не подставляй соседние режимы «для полноты».",
  "Если во фрагментах есть конфликт формулировок — опирайся на фрагмент, наиболее близкий по смыслу к вопросу, и не объединяй противоречивые требования.",
  "Не придумывай числовые пороги, допуски и проценты (включая вида 0.1%, −1%), если их нет в контексте; не интерполируй поведение системы между режимами.",
  "Сохраняй обозначения из документа дословно (в том числе RH%t, RH%p и аналогичные индексы); не заменяй их похожими символами и не «чините» формулы.",
  "Если недостаточно данных для ответа, напиши: Информация отсутствует в документации.",
  "Для фактов из паспорта используй ближайший релевантный фрагмент (тип spec, table или общий текст general), даже если название модели не указано в каждой строке фрагмента.",
  "Числовые лимиты из фрагментов, где в том же предложении или строке таблицы указана другая модель изделия, не переноси как действующие для текущего шкафа.",
  "Если спрашивают о допустимой нагрузке на полки или максимальном весе (в том числе без уточнения типа полки): найди в контексте все явные лимиты для текущей модели изделия и перечисли каждый с указанием типа полки. Если для этой модели в тексте есть несколько типов (стандартная, выдвижная, укороченная с вырезом под подогрев/воздуховод, усиленная и т.д.) — ответ должен включать все такие пары «тип → лимит», которые есть в контексте; недопустимо по умолчанию давать только один лимит (например только «стандартная 50 кг»), если отдельно в том же документе для этой модели указан лимит для укороченной полки с вырезом или другого типа.",
  "Строго различай типы полок и не смешивай лимиты: стандартная, выдвижная, укороченная с вырезом, усиленная — у каждого свой пункт в документе; число вроде 20 кг для укороченной с вырезом не относится к выдвижной полке, если для выдвижной указано иное.",
  "Опирайся на контекст из документов как на главный источник фактов.",
  "Не добавляй факты, которых нет в контексте; допускается связная формулировка и упорядочивание уже описанных шагов без добавления новых этапов.",
  "Жёстко: запрещено обобщать правила без явной поддержки в тексте документа — не распространяй лимит, режим или требование с одной детали, комплектации или варианта на все детали или все варианты.",
  "Жёстко: запрещено добавлять этапы, шаги процедуры, действия или технические условия, которых нет в контексте документов.",
  "Если шаг не найден в тексте — не включай его в ответ.",
  "Если данных для детали недостаточно, явно укажи: [Недостаточно данных в тексте].",
  "Не дублируй список источников в конце ответа (названия файлов и разделов не перечисляй отдельным блоком).",
  "Если пользователь явно не просил указать источник, цитату или расположение в документе — не добавляй номера пунктов или подразделов (например «раздел 2.2…»), имена файлов (.md), формулировки «во фрагменте из документации …», «как указано в … файле»; ответ давай обычным текстом по сути вопроса.",
  "Если пользователь спрашивает один технический параметр (напряжение, частота, IP и т.п.) — верни только его; не добавляй соседние характеристики из той же строки таблицы «для полноты».",
  "Если достаточно краткого факта — ограничься одним–двумя предложениями; не пересказывай смежные разделы документа.",
];

function sharedDocumentationRulesAsBullets() {
  return SHARED_DOCUMENTATION_RULES.map((line) => `- ${line}`).join("\n");
}

/** Если среди выбранных чанков есть spec/table — можно требовать факты в ответе, а не отсылки к таблице. */
function retrievalHasSpecOrTableChunks(chunks) {
  return (
    Array.isArray(chunks) &&
    chunks.some((ch) => {
      const k = ch?.metadata?.chunkKind;
      return k === "spec" || k === "table";
    })
  );
}

/** Анти-паттерн «ответ-ссылка» при наличии структурированных фрагментов в контексте. */
function buildAntiMetaReferenceInstructions(queryIntent, retrievalHasSpecOrTable) {
  const it = queryIntent?.intentType;
  if (
    !retrievalHasSpecOrTable ||
    !["FACT_QUERY", "CONFIGURATION_QUERY", "QUICK_FACT_QUERY"].includes(it || "")
  ) {
    return [];
  }
  return [
    "В контексте уже есть фрагменты типа spec или table с параметрами: перечисли конкретные значения (диапазоны, напряжение, температура и т.д.) прямо в ответе. Запрещены ответы-отсылки без фактов: «указано в таблице», «содержится в документации», «см. руководство», «смотрите руководство» и аналоги — если данные есть во фрагментах выше.",
  ];
}

/** Жёсткое сужение объёма ответа под классифицированный intent (generation layer). */
function buildIntentPrecisionInstructions(queryIntent) {
  if (!queryIntent?.intentType) {
    return [];
  }
  const it = queryIntent.intentType;
  const lines = [];
  const fp = queryIntent.focusParameter;

  const strictSingleFragment =
    it === "SINGLE_FIELD_QUERY" ||
    it === "QUICK_FACT_QUERY" ||
    (it === "FACT_QUERY" && queryIntent.queryScope === "narrow");

  if (strictSingleFragment) {
    lines.push(
      "ANTI-HALLUCINATION: в промпт передан один целевой фрагмент ([Фрагмент 1]) — используй только его как источник; не смешивай напряжение, частоту, IP, влажность и другие подсистемы, если вопрос про один параметр; не добавляй режимы осушения/хранения/регенерации без запроса."
    );
    lines.push(
      "Пользовательский ответ без служебных пояснений: не упоминай retrieval, фрагменты, chunk-индексы, источники контекста и формулировки «в документации указано/контекст содержит»."
    );
  } else if (it === "FACT_QUERY") {
    lines.push(
      "ANTI-HALLUCINATION: опирайся только на переданные фрагменты; не объединяй несвязанные разделы в выводы, которых нет в тексте; не смешивай напряжение, частоту, IP и другие подсистемы без прямой связи с вопросом."
    );
    lines.push(
      "Пользовательский ответ без служебных пояснений: не упоминай retrieval, фрагменты, chunk-индексы, источники контекста и формулировки «в документации указано/контекст содержит»."
    );
  }

  if (it === "FACT_QUERY") {
    if (queryIntent.queryScope === "narrow") {
      lines.push(
        "Фактологический режим без расширения: не дополняй ответ «логичными» ТТХ и обобщениями; только явные факты из фрагмента."
      );
    } else {
      lines.push(
        "Фактологический режим: не дополняй ответ фактами и цифрами, которых нет во фрагментах; только явные сведения из переданного контекста."
      );
    }
    lines.push("Ограничь ответ 3–5 короткими предложениями.");
  }

  if (it === "SINGLE_FIELD_QUERY") {
    lines.push(
      "Запрос на ОДИН параметр: один короткий ответ (не более двух предложений). Запрещено добавлять соседние характеристики из той же строки таблицы или паспорта «для полноты»."
    );
    if (queryIntent.focusParameterLabel) {
      lines.push(`Единственный фокус ответа: ${queryIntent.focusParameterLabel}.`);
    }
    if (fp === "voltage") {
      lines.push(
        "Для фокуса «напряжение/питание»: укажи только напряжение питания (В); частоту сети (Гц) не включать."
      );
    }
    if (fp === "frequency") {
      lines.push("Для фокуса «частота»: укажи только частоту (Гц); напряжение (В) не включать.");
    }
    if (fp === "protection") {
      lines.push(
        "Для фокуса «защита/IP»: укажи только степень защиты / код IP; другие параметры из той же строки не добавлять."
      );
    }
    if (fp === "grounding_resistance") {
      lines.push(
        "Для фокуса «сопротивление заземляющего контура»: отвечай только допустимым сопротивлением контура заземления; не смешивай с антистатическим резистором / 1 МОм и функциональным заземлением оператора, если это другой раздел документа."
      );
    }
  }

  if (it === "QUICK_FACT_QUERY") {
    lines.push(
      "Краткий факт: не более 1–2 предложений; без обзора смежных разделов, если пользователь не просил подробностей или объяснений."
    );
    if (queryIntent.focusParameterLabel) {
      lines.push(`При необходимости сузь ответ к: ${queryIntent.focusParameterLabel}.`);
    }
  }

  if (it === "GETTING_STARTED_QUERY") {
    lines.push(
      "Запуск и первые шаги: оформи ответ нумерованным списком (1. … 2. …) в порядке действий из контекста — конкретные процедурные шаги, ориентир 3–7 пунктов. Не включай неисправности, аварии, ремонт, ТО, азот, подогрев и диагностику, если пользователь явно не спрашивал об этом."
    );
  }

  if (it === "TROUBLESHOOTING_QUERY") {
    lines.push(
      "Диагностика: ответ кратким списком возможных причин и проверок из контекста (маркированный или нумерованный список). НЕ выводи: уверенность (confidence), метки источников («Источник 1»), «Синтез», chain-of-thought, внутренние оценки модели."
    );
    lines.push(
      "Заголовки вида «Возможные причины:» допустимы; заголовки «Проверка:», «Уверенность:», «Источник:» без содержательного текста запрещены."
    );
  }

  return lines;
}

function getTimestamp() {
  return new Date().toISOString();
}

function isConsoleLogEnabled() {
  return process.env.SOVA_CONSOLE_LOG !== "0";
}

function shouldLogHttpRequest(url) {
  if (process.env.LOG_HTTP_ALL === "1") {
    return true;
  }
  return String(url || "").startsWith("/api");
}

function logInfo(message, details) {
  if (!isConsoleLogEnabled()) {
    return;
  }
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

function logChatOutcome(details) {
  if (!isConsoleLogEnabled()) {
    return;
  }
  console.log(`[${getTimestamp()}] CHAT ${JSON.stringify(details)}`);
}

function emitChatSessionRecord({
  equipment,
  question,
  answer,
  chatStartedAt,
  testMeta,
  directContextRequested,
  chatMode,
  chatCapabilities,
  ragTrace,
  retrieval,
  gateAction,
  httpStatus = 200,
  error = null,
}) {
  const durationMs = Date.now() - chatStartedAt;
  const mode = chatMode?.mode || ragTrace?.mode || null;

  logChatOutcome({
    equipmentId: equipment?.id ?? null,
    mode,
    gateAction: gateAction ?? null,
    durationMs,
    answerPreview: String(answer || error || "").slice(0, 240),
    ...(testMeta ? { testMeta } : {}),
  });

  if (!isChatFileLogEnabled()) {
    return;
  }

  const record = {
    equipmentId: equipment?.id ?? null,
    equipmentName: equipment?.name ?? null,
    question,
    answer: answer ?? null,
    httpStatus,
    durationMs,
    directContextRequested: Boolean(directContextRequested),
    testMeta,
    chatMode: chatMode ?? null,
    chatCapabilities: chatCapabilities ?? null,
    ragTrace: summarizeRagTrace(ragTrace),
    retrieval: retrieval ?? null,
    gateAction: gateAction ?? null,
  };

  if (error) {
    recordChatError({ ...record, error });
    return;
  }
  recordChatExchange(record);
}

function readEquipmentCatalog() {
  return JSON.parse(fs.readFileSync(EQUIPMENT_CATALOG_PATH, "utf8"));
}

function getEquipment(equipmentId) {
  const catalog = readEquipmentCatalog();
  const canonical = resolveEquipmentId(equipmentId);
  return catalog[canonical] || catalog[equipmentId] || null;
}

function getEquipmentList() {
  return Object.values(readEquipmentCatalog());
}

function sanitizeCatalogUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  try {
    const parsed = new URL(raw, "http://portal.local");
    if (raw.startsWith("/") && parsed.origin === "http://portal.local") {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.href;
    }
  } catch {
    return "";
  }
  return "";
}

function toEquipmentSummary(equipment) {
  return {
    id: equipment.id,
    publicId: equipment.publicId || equipment.id,
    name: equipment.name,
    type: equipment.type,
    description: equipment.description,
    image: sanitizeCatalogUrl(equipment.image),
    imageAlt: equipment.imageAlt,
    manualUrl: sanitizeCatalogUrl(equipment.manualUrl),
    guideUrl: sanitizeCatalogUrl(equipment.guideUrl),
    summary: equipment.summary,
  };
}

function getChatCapabilities(equipment) {
  const ragAvailable = Boolean(ragConfig.postgresUrl);
  const profile = resolveEquipmentProfile(equipment?.id);
  const autoDirectForEquipment =
    shouldAutoDirectWhenNoPostgres(profile, equipment?.id) && !ragAvailable;
  let defaultPath = "direct";
  if (ragAvailable && !autoDirectForEquipment) {
    defaultPath = "rag";
  }
  return {
    ragAvailable,
    postgresConfigured: ragAvailable,
    autoDirectForEquipment,
    defaultPath,
  };
}

const CHAT_MODE_LABELS = Object.freeze({
  DIRECT_CONTEXT: "Direct Context (полный PDF)",
  DIRECT_CONTEXT_DETERMINISTIC: "Direct · deterministic",
  DIRECT_CONTEXT_RETRY: "Direct Context (повтор)",
  RAG: "RAG (поиск по чанкам)",
  RAG_DETERMINISTIC: "RAG · deterministic",
  RAG_DETERMINISTIC_RECOVERY: "RAG · recovery",
  SAFETY_DETERMINISTIC: "Safety · deterministic",
  SCOPE_GATE: "Scope gate",
});

function buildChatModeInfo({ useDirectContext, ragTrace, capabilities }) {
  const mode = ragTrace?.mode || (useDirectContext ? "DIRECT_CONTEXT" : "RAG");
  const path = useDirectContext ? "direct" : "rag";
  return {
    path,
    mode,
    label: CHAT_MODE_LABELS[mode] || mode,
    ragAvailable: Boolean(capabilities?.ragAvailable),
    requestedDirect: Boolean(useDirectContext),
    autoDirect: Boolean(capabilities?.autoDirectForEquipment),
  };
}

function buildPostgresAutoDirectWarning(capabilities) {
  if (!capabilities?.autoDirectForEquipment) {
    return null;
  }
  return "POSTGRES_URL не задан — RAG недоступен, для SDB1106NM автоматически используется Direct Context.";
}

function attachRagTraceWarnings(ragTrace, capabilities) {
  const warning = buildPostgresAutoDirectWarning(capabilities);
  if (!warning) {
    return ragTrace;
  }
  return {
    ...ragTrace,
    warnings: [...(Array.isArray(ragTrace?.warnings) ? ragTrace.warnings : []), warning],
    postgresConfigured: false,
    autoDirectFallback: true,
  };
}

function enrichEquipmentForChat(equipment) {
  if (!equipment) {
    return equipment;
  }
  return {
    ...equipment,
    image: sanitizeCatalogUrl(equipment.image),
    manualUrl: sanitizeCatalogUrl(equipment.manualUrl),
    guideUrl: sanitizeCatalogUrl(equipment.guideUrl),
    chatCapabilities: getChatCapabilities(equipment),
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

function sanitizeAssistantProseAnswer(text) {
  if (typeof text !== "string") {
    return "";
  }

  let t = text.replace(/\r\n/g, "\n").trim();
  if (!t) {
    return "";
  }

  const linesEvalStrip = [];
  for (const rawLine of t.split("\n")) {
    const L = rawLine.trim();
    if (/^(?:Уверенность|Confidence)\s*:/i.test(L)) {
      continue;
    }
    if (/^Источник\s*\d*\s*:/i.test(L)) {
      continue;
    }
    if (/^Подтверждение\s*\d*\s*:/i.test(L)) {
      continue;
    }
    if (/^Почему\s+критично\s*:/i.test(L)) {
      continue;
    }
    if (/^(?:Синтез|Synthesis)\s*:/i.test(L)) {
      continue;
    }
    if (/^chain[- ]of[- ]thought\s*:/i.test(L) || /^(?:reasoning|analysis)\s*:/i.test(L)) {
      continue;
    }
    linesEvalStrip.push(rawLine);
  }
  t = linesEvalStrip.join("\n").trim();

  t = t.replace(
    /^\s*\*{0,2}\s*(fact|interpretation|факт|интерпретация)\s*(?:\([^)]*\))?\s*\*{0,2}\s*:\s*/gim,
    ""
  );

  const sourcesIdx = t.search(/\n\s*(?:Источники|Sources)\s*:/i);
  if (sourcesIdx !== -1) {
    t = t.slice(0, sourcesIdx).trimEnd();
  }

  const paragraphs = t.split(/\n\s*\n+/);
  const out = [];
  let prevNorm = null;

  for (const block of paragraphs) {
    const trimmed = block.trim();
    if (!trimmed) {
      continue;
    }

    const norm = trimmed.replace(/\s+/g, " ").toLowerCase();
    if (norm.length >= 48 && norm === prevNorm) {
      continue;
    }

    prevNorm = norm;
    out.push(trimmed);
  }

  return out.join("\n\n").trim();
}

function polishAssistantAnswer(text) {
  if (typeof text !== "string") {
    return text;
  }
  return sanitizeAssistantProseAnswer(text);
}

function hardSanitizeUserFacingAnswer(text, queryIntent) {
  let out = String(text || "").replace(/\r\n/g, "\n");
  if (!out.trim()) {
    return "";
  }

  const bannedLinePrefixes = [
    /^.*(?:Почему\s+критично|Уверенность|Источник|Подтверждение|Синтез)\s*:.*/gim,
    /^.*chain[- ]of[- ]thought.*$/gim,
    /^.*(?:reasoning|analysis)\s*:.*$/gim,
  ];
  for (const re of bannedLinePrefixes) {
    out = out.replace(re, "");
  }

  const noMetaIntents = new Set(["SINGLE_FIELD_QUERY", "QUICK_FACT_QUERY", "FACT_QUERY"]);
  if (noMetaIntents.has(queryIntent?.intentType)) {
    const bannedSentence =
      /в\s+документации\s+указано|контекст\s+содержит|согласно\s+фрагменту|в\s+фрагменте|в\s+источнике|\[?\s*фрагмент\s*\d+\s*\]?|chunk\s*\d+/i;
    const parts = out.split(/(?<=[.!?])\s+/u).filter(Boolean);
    out = parts.filter((p) => !bannedSentence.test(p)).join(" ");
  }

  if (queryIntent?.intentType === "TROUBLESHOOTING_QUERY") {
    const actionLine = /провер|замен|осуш|уплотнит|кабель|предохран|напряжен|контакт|неисправ|ресурс/i;
    let cleaned = out
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !/^(?:Проверка|Почему\s+критично|Уверенность|Источник|Подтверждение|Синтез)\s*:/i.test(line))
      .map((line) => line.replace(/^\d+\.\s*Проверка:\s*/i, ""))
      .map((line) => line.replace(/^[*-]\s*/, ""))
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => actionLine.test(line));
    if (cleaned.length < 2) {
      cleaned = out
        .split(/(?<=[.!?])\s+/u)
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => actionLine.test(line))
        .slice(0, 6);
    }
    out = cleaned.map((line) => `- ${line}`).join("\n");
  }

  return out
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const HALLUCINATION_STOPWORDS = new Set([
  "этот",
  "этого",
  "этой",
  "эти",
  "этих",
  "также",
  "если",
  "когда",
  "где",
  "какой",
  "какая",
  "какие",
  "который",
  "которая",
  "которые",
  "будет",
  "быть",
  "было",
  "были",
  "есть",
  "или",
  "для",
  "при",
  "про",
  "над",
  "под",
  "что",
  "чтобы",
  "очень",
  "все",
  "всё",
  "всего",
  "только",
  "ещё",
  "еще",
  "так",
  "как",
  "она",
  "они",
  "его",
  "них",
  "проверка",
  "проверки",
  "шаг",
  "шага",
  "шаги",
  "этап",
  "этапы",
  "ответ",
  "тексте",
  "данных",
  "контекст",
]);

function detectHallucinations(answer, context) {
  if (typeof answer !== "string" || typeof context !== "string") {
    return { flagged: false, suspiciousTokens: [], ratio: 0 };
  }

  const normalizedContext = context.toLowerCase().normalize("NFKC");
  const answerNorm = answer.toLowerCase().normalize("NFKC");
  const tokens = answerNorm.match(/[\p{L}\p{N}]{5,}/gu) || [];
  const suspicious = [];

  for (const t of tokens) {
    if (HALLUCINATION_STOPWORDS.has(t)) {
      continue;
    }

    if (!normalizedContext.includes(t)) {
      suspicious.push(t);
    }
  }

  const uniqueSuspicious = [...new Set(suspicious)];
  const ratio = tokens.length ? uniqueSuspicious.length / tokens.length : 0;
  const flagged = uniqueSuspicious.length >= 4 && ratio > 0.12;

  return {
    flagged,
    suspiciousTokens: uniqueSuspicious.slice(0, 25),
    ratio: Number(ratio.toFixed(3)),
  };
}

function buildChecklistAnswer(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return "Недостаточно подтвержденных данных в документации для формирования чек-листа.";
  }

  return items
    .map((item, index) => {
      const check = typeof item.check === "string" ? item.check.trim() : "";
      if (!check) {
        return "";
      }
      return `${index + 1}. ${check}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

/** Ответ для пользователя в режиме синтеза (инструкция / порядок действий), без полей верификации. */
function buildUserFacingProcedureAnswer(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return "Недостаточно подтверждённых в документе шагов, чтобы составить пошаговую инструкцию.";
  }

  const steps = items.map((item, index) => {
    const title = typeof item.check === "string" ? item.check.trim() : "";
    const interp =
      item.type === "interpretation"
        ? " *(вывод по тексту документа)*"
        : "";
    return `${index + 1}. ${title}${interp}`;
  });

  return steps.join("\n\n");
}

function enforceSingleFieldFocusAnswer(text, queryIntent) {
  if (queryIntent?.intentType !== "SINGLE_FIELD_QUERY" || !queryIntent.focusParameter) {
    return String(text || "");
  }
  const fp = queryIntent.focusParameter;
  const sentences = String(text || "")
    .split(/(?<=[.!?])\s+/u)
    .map((s) => s.trim())
    .filter(Boolean);

  const rules = {
    frequency: {
      include: /гц|hz|частот/i,
      exclude: /(?:\d+\s*(?:в|вольт)|мощност|вт|квт|ампер|ток)/iu,
    },
    voltage: {
      include: /(?:\d+\s*(?:в|вольт)|напряжен|питани)/iu,
      exclude: /(?:мощност|вт\b|квт|ампер|ток|гц|частот)/iu,
    },
    protection: {
      include: /\bip\s?\d{2}\b|класс\s+защиты|степень\s+защиты/i,
      exclude: /(?:\d+\s*(?:в|вольт)|гц|частот|мощност|вт\b)/iu,
    },
    grounding_resistance: {
      include: /(?:\d+\s*ом|сопротивлен.*заземл|заземляющ.*контур)/iu,
      exclude: /(?:мегом|м\s*ом\b|антистат|браслет|functional\s+grounding\s+resistor)/iu,
    },
  };
  const rule = rules[fp];
  if (!rule) {
    return String(text || "");
  }

  const kept = sentences.filter((s) => rule.include.test(s) && !rule.exclude.test(s)).slice(0, 2);
  if (kept.length > 0) {
    return kept.join(" ");
  }
  return String(text || "");
}

function extractGettingStartedStepsFromChunks(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return "";
  }
  const candidateLines = [];
  for (const chunk of chunks.slice(0, 4)) {
    const lines = String(chunk.content || "")
      .split("\n")
      .map((line) => line.replace(/^[\-\d\.\)\s]+/, "").trim())
      .filter(Boolean);
    for (const line of lines) {
      const clean = line.replace(/\s+/g, " ").trim();
      if (clean.length < 20 || clean.length > 180) {
        continue;
      }
      if (!/[а-яёa-z]/i.test(clean)) {
        continue;
      }
      if (
        /подключ|встав|включ|перевед|нажм|установ|подготов|провер|убед|тумблер|индикатор|кабель|ethernet/i.test(
          clean
        )
      ) {
        candidateLines.push(clean);
      }
    }
  }
  const uniq = [...new Set(candidateLines)]
    .filter((line) => !/[{}\\]|rh%|кпа|мм\s*рт/i.test(line))
    .slice(0, 7);
  if (uniq.length < 3) {
    return "";
  }
  return uniq.map((line, idx) => `${idx + 1}. ${line.replace(/[.;:]+$/, "")}.`).join("\n");
}

function normalizeProcedureStep(line) {
  return String(line || "")
    .replace(/<!--\s*image\s*-->/gi, " ")
    .replace(/^\s*[-*]?\s*/, "")
    .replace(/^\s*[-*]?\s*(?:[а-яё]\)|\d+(?:\.\d+)*\.?)\s*/iu, "")
    .replace(/^\s*[-*]\s*/, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();
}

function collectProcedureCorpus(chunks) {
  const uniq = new Map();
  for (const chunk of Array.isArray(chunks) ? chunks : []) {
    if (!chunk || uniq.has(chunk.chunkIndex)) {
      continue;
    }
    uniq.set(chunk.chunkIndex, chunk);
  }
  return [...uniq.values()]
    .sort((a, b) => (Number(a.chunkIndex) || 0) - (Number(b.chunkIndex) || 0))
    .map((chunk) => String(chunk.content || ""))
    .join("\n\n");
}

function sliceProcedureSection(corpus, startRe, endRe) {
  const text = String(corpus || "");
  const startMatch = startRe.exec(text);
  if (!startMatch) {
    return "";
  }
  const start = startMatch.index;
  const rest = text.slice(start + startMatch[0].length);
  const endMatch = endRe.exec(rest);
  const end = endMatch ? start + startMatch[0].length + endMatch.index : text.length;
  return text.slice(start, end).trim();
}

function extractBulletStepsFromSection(sectionText) {
  const lines = String(sectionText || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map(normalizeProcedureStep)
    .filter(Boolean);

  const steps = [];
  for (const line of lines) {
    if (line.length < 8 || line.length > 220) {
      continue;
    }
    if (/^(?:##|рисунок|примечание|для\s+.+следует|подготовка\s+к|включение\s+шкафа|использование\s+изделия)/iu.test(line)) {
      continue;
    }
    if (/^(?:а|б|в|г|д|е|ж|з)$/iu.test(line)) {
      continue;
    }
    if (!/провер|убед|подключ|встав|установ|загор|произвест|открыть|разместить/i.test(line)) {
      continue;
    }
    steps.push(line.replace(/[.;:]+$/, ""));
  }

  return [...new Set(steps)];
}

function numberedProcedureSteps(steps) {
  const uniq = [...new Set(steps.filter(Boolean))].slice(0, 7);
  if (!uniq.length) {
    return "";
  }
  return uniq
    .map((line, idx) => {
      const cleaned = String(line || "")
        .replace(/\s+согласно\s+п\..*$/iu, "")
        .replace(/\s+согласно\s+перечислению.*$/iu, "")
        .replace(/[.;:]+$/, "")
        .trim();
      const capitalized = cleaned ? cleaned[0].toUpperCase() + cleaned.slice(1) : cleaned;
      return `${idx + 1}. ${capitalized}.`;
    })
    .join("\n");
}

function buildDeterministicGettingStartedAnswer(query, chunks) {
  const corpus = collectProcedureCorpus(chunks);
  if (!corpus) {
    return "";
  }

  const q = String(query || "").toLowerCase();
  const wantsPowerOn = /как\s+(?:включить|запустить)|включени[ея]\s+шкафа|запуск\s+шкафа/i.test(q);
  const wantsPreparation = /подготовить|подготовк[аи]\s+к\s+(?:работе|включению)|к\s+работе/i.test(q);
  const wantsStartWork =
    /как\s+начать|начать\s+работу|как\s+пользоваться|как\s+работать|как\s+использовать|как\s+эксплуатировать|порядок\s+работы|перв(?:ый|ого)\s+запуск|с\s+чего\s+начать/i.test(q) &&
    !wantsPowerOn &&
    !wantsPreparation;

  const preparationSection = sliceProcedureSection(
    corpus,
    /(?:^|\n)##\s*2\.2\.4\s+ПОДГОТОВКА\s+К\s+ВКЛЮЧЕНИЮ|(?:^|\n)\s*2\.2\.4\s+ПОДГОТОВКА\s+К\s+ВКЛЮЧЕНИЮ/iu,
    /(?:^|\n)##\s*2\.2\.5\s+ВКЛЮЧЕНИЕ\s+ШКАФА|(?:^|\n)\s*2\.2\.5\s+ВКЛЮЧЕНИЕ\s+ШКАФА/iu
  );
  const powerOnSection = sliceProcedureSection(
    corpus,
    /(?:^|\n)##\s*2\.2\.5\s+ВКЛЮЧЕНИЕ\s+ШКАФА|(?:^|\n)\s*2\.2\.5\s+ВКЛЮЧЕНИЕ\s+ШКАФА/iu,
    /(?:^|\n)##\s*2\.3\s+ИСПОЛЬЗОВАНИЕ\s+ИЗДЕЛИЯ|(?:^|\n)\s*2\.3\s+ИСПОЛЬЗОВАНИЕ\s+ИЗДЕЛИЯ/iu
  );
  const usageSection = sliceProcedureSection(
    corpus,
    /(?:^|\n)##\s*2\.3\s+ИСПОЛЬЗОВАНИЕ\s+ИЗДЕЛИЯ|(?:^|\n)\s*2\.3\s+ИСПОЛЬЗОВАНИЕ\s+ИЗДЕЛИЯ/iu,
    /(?:^|\n)##\s*2\.4|(?:^|\n)\s*2\.4/iu
  );

  if (wantsPowerOn) {
    return numberedProcedureSteps(extractBulletStepsFromSection(powerOnSection));
  }
  if (wantsPreparation) {
    return numberedProcedureSteps(extractBulletStepsFromSection(preparationSection));
  }
  if (wantsStartWork) {
    return numberedProcedureSteps([
      ...extractBulletStepsFromSection(preparationSection),
      ...extractBulletStepsFromSection(powerOnSection),
      ...extractBulletStepsFromSection(usageSection),
    ]);
  }

  return "";
}

function buildHumidityTroubleshootingFallback(chunks) {
  const text = (Array.isArray(chunks) ? chunks : [])
    .map((chunk) => String(chunk?.content || ""))
    .join("\n\n");
  if (!/влажност|RH%|осушител|регенерац/i.test(text)) {
    return "";
  }

  const steps = [];
  if (/двер|закрытии\s+двер|открытии\s+двер/i.test(text)) {
    steps.push(
      "Проверьте, что дверь закрыта: при открытии двери вентилятор осушителя отключается, а после закрытия отсчет ускоренного осушения начинается заново"
    );
  }
  if (/мен(?:ьше|ее)\s+чем\s+на\s+1\s*RH%|меньше\s+1\s*RH%|динамик[а-яё\s]+снижени[яе]\s+влажност/i.test(text)) {
    steps.push(
      "Если влажность выше порога и снижается меньше чем на 1RH% за 30 минут, шкаф переходит в режим регенерации осушителя"
    );
  }
  if (/режим[ае]?\s+«?Регенерации|регенерац/i.test(text)) {
    steps.push("Не выключайте шкаф во время режима регенерации");
  }
  if (/ТЭН|заслонк[аи]\s+осушителя|45\s*±\s*1\s+минут|60\s*±\s*1\s+минут/i.test(text)) {
    steps.push(
      "Дождитесь окончания регенерации: в этом режиме включается ТЭН и открываются заслонки осушителя"
    );
  }
  if (/RH%т\s*=\s*RH%п|порогов[а-яё\s]+значени[яе]\s+влажност/i.test(text)) {
    steps.push(
      "Сравните текущую влажность RH%т с установленным порогом RH%п и проверьте, что порог задан корректно"
    );
  }

  const uniq = [...new Set(steps)].slice(0, 5);
  const finalSteps = uniq.length
    ? uniq
    : [
        "Проверьте закрытие двери и корректность установленного порога влажности RH%п",
        "Если влажность выше порога и снижается недостаточно быстро, дождитесь режима регенерации осушителя",
        "Не выключайте шкаф во время регенерации",
      ];
  return finalSteps.map((line, idx) => `${idx + 1}. ${line}.`).join("\n");
}

function hasOnboardingChunk(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return false;
  }
  return chunks.some((chunk) => {
    const blockType = String(chunk?.metadata?.blockType || "");
    const kind = String(chunk?.metadata?.chunkKind || "");
    const text = `${chunk?.content || ""}\n${chunk?.section || ""}`.toLowerCase();
    if (blockType === "PROCEDURE_BLOCK" || kind === "procedure") {
      return true;
    }
    return /startup|first[_\s-]?launch|power[_\s-]?on|setup|подготовк|включ|подключ|тумблер|вкл|питани/.test(
      text
    );
  });
}

function finalizeGettingStartedAnswer(answer, chunks) {
  const banned = /гаранти|хранени|транспорт|коррози|мощност|нагрузк|климатическ|rh|влажност\s+окружающ|атмосферн|мм\s*рт|кпа/i;
  const action = /провер|подключ|встав|включ|перевед|нажм|установ|убед|тумблер|индикатор|кабель|ethernet|питан|вкл/i;
  const brokenReference = /согласно\s+п\.?\s*$/i;
  const descriptiveNoise = /рисунок|показан|показана|расположен|описание\s+положений|панель\s+управления/i;

  const rawLines = String(answer || "")
    .replace(/\r\n/g, "\n")
    .split(/\n|(?<=[.!?])\s+/u)
    .map((line) => line.replace(/^\s*[-*]?\s*\d+[.)]?\s*/, "").trim())
    .map((line) => line.replace(/\s+/g, " "))
    .filter(Boolean);

  let steps = rawLines
    .filter((line) => line.length >= 14 && line.length <= 180)
    .filter((line) => action.test(line))
    .filter((line) => !banned.test(line))
    .filter((line) => !descriptiveNoise.test(line))
    .filter((line) => !brokenReference.test(line));

  const fromChunks = extractGettingStartedStepsFromChunks(chunks);
  const chunkSteps = fromChunks
    ? fromChunks
        .split("\n")
        .map((line) => line.replace(/^\s*\d+[.)]?\s*/, "").trim())
        .filter(Boolean)
        .filter((line) => !banned.test(line))
        .filter((line) => !descriptiveNoise.test(line))
        .filter((line) => !brokenReference.test(line))
    : [];

  if (steps.length < 3) {
    if (chunkSteps.length >= 3) {
      steps = chunkSteps;
    }
  } else if (chunkSteps.length >= 3 && steps.length < 5) {
    steps = [...steps, ...chunkSteps];
  }

  if (steps.length < 3) {
    steps = rawLines.filter((line) => !banned.test(line)).slice(0, 5);
  }

  const uniq = [...new Set(steps)].slice(0, 7);
  const numbered = uniq
    .map((line, idx) => `${idx + 1}. ${line.replace(/\s+([.,;:])/g, "$1").replace(/[.;:]+$/, "")}.`)
    .join("\n");
  if (numbered.length <= 1200) {
    return numbered;
  }

  const truncated = uniq
    .slice(0, Math.max(3, Math.min(5, uniq.length)))
    .map((line, idx) => `${idx + 1}. ${line.replace(/[.;:]+$/, "")}.`)
    .join("\n");
  return truncated.slice(0, 1200).trim();
}

function buildDeterministicParameterAnswer(parameterKey, parameterEntry) {
  const value = String(parameterEntry?.value || "").trim();
  const unit = String(parameterEntry?.unit || "").trim();
  const skipUnit =
    unit &&
    ((unit.toLowerCase() === "ip" && /^ip\s?\d+/i.test(value)) ||
      (unit.toLowerCase() === "rh%" && /rh%/i.test(value)));
  const formatted = `${value}${unit && !skipUnit ? ` ${unit}` : ""}`.trim();
  if (!formatted) {
    return "Информация не найдена в документации.";
  }

  switch (parameterKey) {
    case "grounding_resistance":
      return `Допустимое сопротивление заземляющего контура — не более ${formatted}.`;
    case "power_voltage":
      return `Напряжение питания — ${formatted}.`;
    case "frequency":
      return `Частота сети — ${formatted}.`;
    case "protection":
      return `Класс защиты — ${formatted}.`;
    case "humidity_range":
      return `Диапазон влажности — ${formatted}.`;
    case "shelf_load_max":
      return `Максимальная нагрузка на полку — ${formatted}.`;
    case "power_consumption":
      return `Потребляемая мощность — ${formatted}.`;
    default:
      return `Параметр ${parameterKey}: ${formatted}.`;
  }
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
    const uniqueQuotes = new Set((evidenceEntries || []).map((entry) => entry.quote));
    const hasTwoDistinctQuotes =
      Array.isArray(evidenceEntries) &&
      evidenceEntries.length >= 2 &&
      uniqueQuotes.size >= 2;
    const hasTwoDistinctSources =
      Array.isArray(evidenceEntries) &&
      evidenceEntries.length >= 2 &&
      uniqueSources.size >= 2;
    if (hasTwoDistinctSources || hasTwoDistinctQuotes) {
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
  const procedureMode = Boolean(options.procedureMode);
  const queryIntent = options.queryIntent || null;
  const retrievalHasSpecOrTable = Boolean(options.retrievalHasSpecOrTable);

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
    `Ответ только про изделие «${equipment.name}» (${equipment.id}). Не называй в ответе другие модели и коды изделий из документа (например другие обозначения SDB…), если они явно относятся к другому корпусу.`,
    ...SHARED_DOCUMENTATION_RULES,
    "Различай понятия и не путай роли: изготовитель/организация на титуле (например «Совтест АТЕ» и формулировки про правопреемника) — это производитель, не марка и не модель изделия. Марка/серия/типовое имя продукта и инженерное обозначение модели (часто с префиксом вида SDB и код из названия шкафа) относятся к самому оборудованию.",
    "Строки на обложке вроде «Руководство по эксплуатации … РЭ» с кодом документа (например SATE…. или аналог) — это шифр/учётный номер документации, а не название или марка устройства; не приводи их как ответ на вопрос «какая марка/модель», если пользователь явно не спрашивает номер руководства.",
    `На вопрос «какая марка/модель оборудования» ответь по сути: из названия и контекста укажи модель/тип для этого изделия («${equipment.name}», код из документа при наличии). Изготовителя можно добавить одной короткой фразой отдельно; индекс РЭ не включай без необходимости.`,
    emergencyMode
      ? "АВАРИЙНОЕ ПРАВИЛО: при огне, дыме, коротком замыкании или угрозе жизни разрешены только: отключение питания, безопасная дистанция/эвакуация, вызов экстренных служб, уведомление ответственных."
      : "Если нет аварийной ситуации, придерживайся обычных правил безопасной эксплуатации.",
    emergencyMode
      ? "ЗАПРЕЩЕНО предлагать самостоятельный ремонт, диагностику или продолжение работы в момент аварии."
      : "Не предлагай действий, которые не подтверждаются контекстом.",
    synthesisMode
      ? "РАЗРЕШЕНО только упорядочивать шаги, явно присутствующие в тексте. ЗАПРЕЩЕНО добавлять новые шаги, даже если они логически ожидаемы. Каждый шаг должен иметь прямое подтверждение в тексте."
      : "Если вопрос не требует алгоритма, отвечай без искусственной детализации.",
    synthesisMode
      ? "Галлюцинация — любой шаг или факт, который нельзя привязать к формулировке документа; переформулировка без опоры в тексте недопустима."
      : "Не выходи за пределы подтвержденных фактов контекста.",
    "Ответ оформляй связным текстом или нумерованными/маркированными пунктами на русском.",
    "Не используй метки «fact», «interpretation», «факт (…)», «вывод» в начале абзацев.",
    ...(procedureMode
      ? [
          "Режим извлечения процедуры по инструкции: перечисляй только явные шаги из текста контекста; не добавляй этапов от себя.",
        ]
      : []),
    safetyMode
      ? "Твоя цель: выделять только критические риски и необходимые проверки по ТБ."
      : "Отвечай по сути вопроса, опираясь на документальный контекст.",
    "Если вопрос не относится к этой модели, прямо скажи об этом.",
    "Если в контексте не хватает данных, честно укажи это и предложи уточнить вопрос.",
    "Не используй LaTeX-запись и команды вроде \\downarrow, \\uparrow, \\to, \\Rightarrow, \\Leftarrow, \\text{>}, \\text{<}, \\approx, \\infty.",
    "Используй обычный текст и Unicode-символы: ↓ ↑ → ⇒ ⇐ > < ≈ ∞.",
    "Отвечай по-русски, структурно и без выдуманных технических параметров.",
    ...(queryIntent?.intentType
      ? [
          `Тип запроса (для фокуса ответа): ${queryIntent.intentType}.`,
          ...(Array.isArray(queryIntent.queryOperatingModes) &&
          queryIntent.queryOperatingModes.length === 1
            ? [
                `Запрос относится к режиму «${{
                  drying: "осушение",
                  storage: "хранение",
                  regeneration: "регенерация",
                }[queryIntent.queryOperatingModes[0]] || queryIntent.queryOperatingModes[0]}» — не добавляй описание других режимов без явной необходимости из формулировки вопроса.`,
              ]
            : []),
        ]
      : []),
    ...buildAntiMetaReferenceInstructions(queryIntent, retrievalHasSpecOrTable),
    ...buildIntentPrecisionInstructions(queryIntent),
  ].join("\n");
}

async function callOllamaChat({
  model,
  messages,
  format,
  options: ollamaOptions = null,
  directContext = false,
}) {
  const chatOptions = {
    ...getOllamaChatOptions({ directContext }),
    ...(ollamaOptions && typeof ollamaOptions === "object" ? ollamaOptions : {}),
  };
  const buildBody = (fmt) =>
    JSON.stringify({
      model,
      stream: false,
      ...(fmt ? { format: fmt } : {}),
      messages,
      options: chatOptions,
    });

  let response = await fetchOllama(OLLAMA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: buildBody(format || undefined),
  });

  let errorBody = "";
  if (!response.ok) {
    errorBody = await response.text();
  }

  const shouldRetryWithoutJsonFormat =
    Boolean(format) &&
    (response.status === 500 || response.status === 400);

  if (!response.ok && shouldRetryWithoutJsonFormat) {
    logInfo("Ollama: повтор запроса без format=json (режим структурированного вывода или пик нагрузки на память).", {
      model,
      status: response.status,
      preview: errorBody.slice(0, 280),
    });
    response = await fetchOllama(OLLAMA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: buildBody(undefined),
    });
    errorBody = "";
    if (!response.ok) {
      errorBody = await response.text();
    }
  }

  if (!response.ok) {
    throw new Error(
      `Ollama request failed (${response.status} ${response.statusText}): ${errorBody}`
    );
  }

  const payload = await response.json();
  const content = payload?.message?.content?.trim() || "";
  if (!content) {
    throw new Error("Ollama returned empty content.");
  }

  return content;
}

/** Ошибка подключения к PostgreSQL (RAG), а не к Ollama. */
function isLikelyPostgresClientError(error) {
  const raw = error instanceof Error ? error.message : String(error);
  const lower = raw.toLowerCase();
  const code = error && typeof error === "object" ? error.code : undefined;

  if (code === "ECONNREFUSED" && /5432/.test(raw)) {
    return true;
  }
  if (/econnrefused.*5432|5432.*econnrefused/.test(lower)) {
    return true;
  }
  if (/password authentication failed|too many connections|database .* does not exist/i.test(raw)) {
    return true;
  }
  if (/getaddrinfo enotfound.*postgres|postgres.*enotfound/i.test(lower)) {
    return true;
  }
  return false;
}

function formatPostgresFailureForClient(error) {
  const raw = error instanceof Error ? error.message : String(error);
  if (IS_PRODUCTION) {
    return {
      error: "Сервис поиска по документации временно недоступен.",
      details: "Повторите запрос позже или обратитесь в техподдержку.",
    };
  }
  const lower = raw.toLowerCase();
  let details =
    "Проверьте, что PostgreSQL запущен и слушает тот же хост/порт, что в переменной POSTGRES_URL.\n\n" +
    "Быстрый вариант в корне проекта:\n" +
    "  docker compose up -d\n" +
    "и в PowerShell перед `npm start`:\n" +
    "  $env:POSTGRES_URL = \"postgresql://rag:rag_secret_change_me@127.0.0.1:5432/equipment_rag\"\n\n" +
    "После первого запуска БД выполните инжест: npm run ingest:knowledge";

  if (/password authentication failed/i.test(raw)) {
    details =
      "Неверный логин или пароль в POSTGRES_URL. Сверьте с настройками контейнера/сервера PostgreSQL.";
  } else if (/database .* does not exist/i.test(raw)) {
    details =
      "Указанная в POSTGRES_URL база данных не существует. Создайте БД или поправьте имя в строке подключения.";
  }

  return {
    error: "База данных PostgreSQL недоступна (нужна для поиска по документации в чате).",
    details: `${details}\n\nТехническая информация: ${raw}`,
  };
}

/** Человекочитаемый ответ при сбоях Ollama (без сырых JSON в интерфейсе чата). */
function formatOllamaFailureForClient(error) {
  const raw = error instanceof Error ? error.message : String(error);
  if (IS_PRODUCTION) {
    return {
      error: "Сервис чата временно недоступен.",
      details: "Повторите запрос позже или обратитесь в техподдержку.",
    };
  }
  const lower = raw.toLowerCase();

  if (lower.includes("model failed to load")) {
    return {
      error: "Запрос к Ollama завершился ошибкой загрузки модели.",
      details:
        "Такой ответ часто даёт Ollama при нехватке памяти под контекст/KV, при ошибке CUDA при загрузке мультимодальной (vision) модели или при баге раннера.\n\nПо вашим логам типичны: (1) слишком большой num_ctx (раньше мог запрашиваться 262k при лимите модели 131k) — приложение теперь передаёт умеренный num_ctx через OLLAMA_NUM_CTX; (2) падение GGML_ASSERT в ggml-cuda при Gemma 4 — обновите Ollama до последней версии или временно используйте текстовую модель без vision.\n\nПроверьте `ollama ps`, логи раннера и при необходимости задайте переменную окружения OLLAMA_NUM_CTX (например 8192 или 32768).",
    };
  }

  if (
    lower.includes("ollama request failed (404") ||
    /model .*not found|pull .*model/i.test(raw)
  ) {
    return {
      error: "Модель не найдена в Ollama.",
      details:
        "Запрошенная модель не установлена локально. В терминале выполните `ollama pull <имя_модели>` и проверьте, что в коде сервера указано то же имя модели.",
    };
  }

  if (lower.includes("ollama request failed (500")) {
    return {
      error: "Ошибка сервера Ollama (500).",
      details:
        "Сервис Ollama вернул внутреннюю ошибку. Проверьте, что Ollama запущена и стабильно отвечает; при смене модели проверьте её командой `ollama run <имя_модели>` в консоли.",
    };
  }

  const short =
    raw.length > 600 ? `${raw.slice(0, 600).trim()}…` : raw;
  return {
    error: "Не удалось получить ответ от локальной модели.",
    details: short,
  };
}

async function runAnswerSelfCorrection({
  draftAnswer,
  retrievalContext,
  userQuestion,
  equipment,
  model,
  maxContextChars,
}) {
  const limit =
    typeof maxContextChars === "number" && maxContextChars > 500
      ? Math.floor(maxContextChars)
      : 14000;

  let ctx = typeof retrievalContext === "string" ? retrievalContext : "";
  if (ctx.length > limit) {
    ctx = `${ctx.slice(0, limit)}\n…`;
  }

  const system = [
    "Ты выполняешь самопроверку черновика ответа пользователю по документации.",
    `Оборудование чата: «${equipment.name}» (${equipment.id}).`,
    "Перед финальным ответом проверь черновик по пунктам:",
    "1) Нет ли необоснованного обобщения (перенос правила с одной детали, типа полки, режима или модели на все без явной формулировки в тексте)?",
    "2) Удали ВСЕ шаги, которые не имеют прямого текстового подтверждения.",
    "3) Если шаг нельзя подтвердить — он должен быть удален, а не переформулирован.",
    "4) Не приписал ли черновик свойства или лимиты другого объекта, другой модели или другого типа узла из документа этому изделию?",
    "5) Нагрузка на полки: (а) каждое значение кг привязывай только к тому типу полки, для которого оно явно сказано в контексте; не смешивай укороченную с вырезом и выдвижную; (б) если вопрос обобщённый про полку/вес, а в контексте для этой модели указано несколько типов полок с разными лимитами — в ответе должны быть все такие типы и лимиты из контекста, не сокращай черновик до одного типа.",
    "6) Если в вопросе не просили источник — убери номера разделов, имена файлов документации и отсылки к фрагментам.",
    "",
    "Полная политика опоры на документ (перепроверь черновик целиком):",
    ...SHARED_DOCUMENTATION_RULES.map((line) => `• ${line}`),
    "Если нарушений нет — верни тот же смысл с минимальными правками формулировок.",
    "Если есть нарушения — перепиши так, чтобы осталось только подтверждённое контекстом, без обобщений и без выдуманных этапов.",
    'Верни строго JSON: {"answer":"текст для пользователя, без преамбулы о проверке"}',
  ].join("\n");

  const userPayload = [
    `Вопрос пользователя: ${userQuestion}`,
    "",
    "Черновик ответа:",
    draftAnswer,
    "",
    "Контекст документов:",
    ctx,
  ].join("\n");

  const raw = await callOllamaChat({
    model,
    format: "json",
    messages: [
      { role: "system", content: system },
      { role: "user", content: userPayload },
    ],
  });

  const parsed = tryParseJson(raw);
  const fixed = typeof parsed?.answer === "string" ? parsed.answer.trim() : "";
  return fixed || draftAnswer;
}

async function detectSafetyModeWithClassifier(message, model, fallbackModel) {
  const classifierPrompt = [
    "Определи, связан ли запрос с безопасностью или аварией.",
    "Верни строго JSON:",
    '{"safetyMode":true,"emergencyMode":false,"synthesisMode":false,"triggerTerms":["..."],"reason":"..."}',
    "safetyMode=true только если явно про риски/ТБ/аварию/опасность/что нельзя делать.",
    "safetyMode=false для вопросов о порядке работы, подготовке к эксплуатации, настройке, подключении, типичной эксплуатации — даже если есть слово «проверка» в бытовом смысле (осмотр перед включением).",
    "emergencyMode=true если есть дым, огонь, искрение, гарь, КЗ, угроза жизни или эвакуация.",
    "synthesisMode=true если нужно собрать алгоритм или порядок действий из фактов документа.",
    "Вопросы про допустимую нагрузку на полки, максимальный вес полки, комплектацию без акцента на аварию/опасность/ТБ — обычно safetyMode=false и emergencyMode=false.",
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
    "Ты проверяешь соответствие пунктов списка тексту контекста (антигаллюцинации).",
    "Для каждого пункта: supported=true, если смысл пункта явно вытекает из контекста.",
    synthesisMode
      ? "Допускается только лёгкая перестановка формулировки без изменения смысла; если суть шага не найдена в тексте — supported=false."
      : "Допускается перефразирование и обобщение формулировок; не требуй дословного совпадения.",
    "Если в контексте есть конкретный шаг или требование, подтверждающее пункт — помечай supported=true.",
    emergencyMode
      ? "Блокируй пункт (supported=false), только если он предлагает ремонт, диагностику или продолжение работы при явной аварии."
      : "Блокируй только явно выдуманные пункты или действия, противоречащие контексту.",
    synthesisMode
      ? "Для синтеза порядка действий: принимай только пункты с прямой опорой в тексте; запрещены логически ожидаемые, но не описанные шаги. Перефраз недопустим вместо удаления неподтверждённого шага. Объединение двух явных цитат допустимо только без добавления нового содержания."
      : "Требуй хотя бы одну явную опору в тексте контекста.",
    "",
    "Политика проекта (учитывай при решении supported):",
    ...SHARED_DOCUMENTATION_RULES,
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
    decisions
      .filter((item) => item?.supported === true)
      .map((item) => Number(item?.index))
      .filter((n) => Number.isInteger(n) && n >= 0)
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
    if (!shouldLogHttpRequest(req.originalUrl)) {
      return;
    }
    logInfo(`${req.method} ${req.originalUrl} -> ${res.statusCode}`, {
      durationMs: Date.now() - startedAt,
      ip: req.ip,
    });
  });

  next();
});

app.use(express.json({ limit: "4mb" }));

const portalPool = getPool(ragConfig.postgresUrl);

if (IS_PRODUCTION) {
  if (!authConfig.authRequired) {
    logError("Refusing to start in production with AUTH_REQUIRED disabled.");
    process.exit(1);
  }
  if (isKnownWeakSessionSecret(authConfig.sessionSecret)) {
    logError("Refusing to start in production with a missing, short, or placeholder SESSION_SECRET.");
    process.exit(1);
  }
  if (!ragConfig.postgresUrl || isKnownDefaultPostgresUrl(ragConfig.postgresUrl)) {
    logError("Refusing to start in production with a missing or placeholder POSTGRES_URL.");
    process.exit(1);
  }
  if (HOST === "0.0.0.0" && process.env.ALLOW_PUBLIC_NODE_BIND !== "1") {
    logError(
      "Refusing to bind Node directly to 0.0.0.0 in production. Use HOST=127.0.0.1 behind a reverse proxy, or set ALLOW_PUBLIC_NODE_BIND=1 intentionally.",
    );
    process.exit(1);
  }
}

if (authConfig.authRequired) {
  if (!portalPool) {
    logError(
      "AUTH_REQUIRED=1, но POSTGRES_URL не задан. Задайте POSTGRES_URL или AUTH_REQUIRED=0 для локальных тестов.",
    );
    process.exit(1);
  }
  if (!authConfig.sessionSecret || authConfig.sessionSecret.length < 32) {
    logError(
      "AUTH_REQUIRED=1 требует SESSION_SECRET (не короче 32 символов).",
    );
    process.exit(1);
  }
  if (authConfig.trustProxy) {
    app.set("trust proxy", 1);
  }
  app.use(createSessionMiddleware(portalPool, authConfig));
  logInfo("Portal authentication is enabled.");
} else {
  logInfo("Portal authentication is disabled (AUTH_REQUIRED=0).");
}

function sendPublicFile(res, relativePath, contentType) {
  const absPath = path.join(publicDir, relativePath);
  if (!fs.existsSync(absPath)) {
    return res.status(404).type("text/plain; charset=utf-8").send("Not found.");
  }
  if (contentType) {
    res.type(contentType);
  }
  res.setHeader("Cache-Control", "no-cache, must-revalidate");
  return res.sendFile(absPath);
}

app.get("/styles.css", (req, res) => sendPublicFile(res, "styles.css", "text/css; charset=utf-8"));
app.get("/favicon.svg", (req, res) => sendPublicFile(res, "favicon.svg", "image/svg+xml"));
app.get("/login.js", (req, res) =>
  sendPublicFile(res, "login.js", "application/javascript; charset=utf-8")
);

mountAuthRoutes(app, {
  publicDir,
  getPool: () => getPool(ragConfig.postgresUrl),
});

app.use(requireAuth);

app.get("/manuals/SDB1106NM.pdf", (req, res, next) => {
  const filePath = resolveSdb1106ManualFilePath();
  if (!filePath) {
    return res.status(404).type("text/plain; charset=utf-8").send(
      "Файл руководства не найден. Задайте переменную окружения SDB1106_MANUAL_PDF (полный путь к PDF) или положите SDB1106NM.pdf в папку public/manuals/."
    );
  }
  res.type("application/pdf");
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) {
      next(err);
    }
  });
});

function sendVendorJs(res, absPath) {
  if (!fs.existsSync(absPath)) {
    return res.status(404).type("text/plain; charset=utf-8").send(
      "Не найден файл библиотеки. Выполните на сервере: npm install"
    );
  }
  res.type("application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=86400");
  return res.sendFile(absPath);
}

app.get("/vendor/marked.min.js", (req, res) => sendVendorJs(res, vendorMarkedPath));
app.get("/vendor/purify.min.js", (req, res) => sendVendorJs(res, vendorPurifyPath));

app.use(express.static(publicDir));

app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/chat", (req, res) => {
  res.sendFile(path.join(publicDir, "chat.html"));
});

app.get("/support", (req, res) => {
  res.sendFile(path.join(publicDir, "support.html"));
});

app.get("/api/equipment", (req, res) => {
  const items = filterEquipmentListForUser(getEquipmentList(), req).map(
    toEquipmentSummary
  );
  return res.json({ items });
});

app.get("/api/equipment/:equipmentId", (req, res) => {
  if (!equipmentAllowedForRequest(req, req.params.equipmentId)) {
    return res.status(404).json({
      error: "Equipment not found.",
    });
  }

  const equipment = getEquipment(req.params.equipmentId);

  if (!equipment) {
    logError("Equipment not found.", {
      equipmentId: req.params.equipmentId,
    });
    return res.status(404).json({
      error: "Equipment not found.",
    });
  }

  return res.json(enrichEquipmentForChat(equipment));
});

app.post("/api/support-request", supportLimiter, supportUploadMiddleware, async (req, res) => {
  const attachmentCheck = validateSupportAttachments(req.files);
  if (!attachmentCheck.ok) {
    return res.status(400).json({
      error: attachmentCheck.errors.join(" "),
      details: attachmentCheck.errors,
    });
  }
  const normalizedBody = normalizeSupportBody(req.body || {}, req.session?.user);
  if (normalizedBody.equipmentId && !equipmentAllowedForRequest(req, normalizedBody.equipmentId)) {
    return res.status(403).json({
      error: "Нет доступа к указанному оборудованию.",
    });
  }
  // Защита от подмены: модель фиксируем из карточки по equipmentId.
  if (normalizedBody.equipmentId) {
    const equipment = getEquipment(normalizedBody.equipmentId);
    if (equipment?.name) {
      normalizedBody.equipmentModel = equipment.name;
    }
  }

  const validation = validateSupportRequest(normalizedBody);
  if (!validation.ok) {
    return res.status(400).json({
      error: validation.errors.join(" "),
      details: validation.errors,
    });
  }

  const { data } = validation;

  const mail = buildSupportEmailContent(data);

  try {
    await sendSupportEmail({
      ...mail,
      replyTo: data.email,
      attachments: attachmentCheck.attachments,
    });
    logInfo("Support request sent.", {
      equipmentId: data.equipmentId || null,
      from: data.email,
    });
    return res.json({ ok: true, message: "Запрос отправлен в техподдержку." });
  } catch (error) {
    const code = error?.code;
    logError("Support request email failed.", {
      message: error instanceof Error ? error.message : String(error),
    });
    if (code === "SMTP_NOT_CONFIGURED") {
      return res.status(503).json({
        error:
          "Отправка писем временно недоступна. Обратитесь к администратору портала.",
      });
    }
    return res.status(502).json({
      error: "Не удалось отправить письмо. Попробуйте позже или напишите на service@sovtest-ate.ru.",
    });
  }
});

app.get("/equipment/:equipmentId", (req, res) => {
  if (!equipmentAllowedForRequest(req, req.params.equipmentId)) {
    return res.status(404).sendFile(path.join(publicDir, "index.html"));
  }

  const equipment = getEquipment(req.params.equipmentId);

  if (!equipment) {
    logError("Equipment page requested for unknown id.", {
      equipmentId: req.params.equipmentId,
    });
    return res.status(404).sendFile(path.join(publicDir, "index.html"));
  }

  return res.sendFile(path.join(publicDir, "index.html"));
});

async function getDirectContextForEquipment(equipment) {
  let docText = "";
  let sourcePath = "";
  let sourceType = "catalog";
  let manualLoaded = false;

  try {
    const primaryText = await loadAllKnowledgeText(equipment.id);
    if (primaryText && primaryText.text && primaryText.text.trim()) {
      docText = primaryText.text.trim();
      sourcePath = primaryText.sourcePath;
      sourceType = primaryText.sourceType;
      manualLoaded = sourceType !== "json";
    }
  } catch (err) {
    logError("Failed to load combined knowledge text for direct context.", {
      equipmentId: equipment.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (!docText) {
    if (equipment.id === "sdb1106-nm") {
      docText = buildSdb1106nmDirectPreamble("");
      sourcePath = "src/rag/sdb1106nm-direct-facts.js";
      sourceType = "preamble_only";
      manualLoaded = false;
    } else {
      const specsStr = Array.isArray(equipment.specs) ? equipment.specs.join("\n") : "";
      const detailsStr = Array.isArray(equipment.details) ? equipment.details.join("\n") : "";
      docText = `Название: ${equipment.name}\nТип: ${equipment.type}\nОписание: ${equipment.description}\nКраткая информация: ${equipment.summary}\n\nХарактеристики:\n${specsStr}\n\nДетали:\n${detailsStr}`;
      sourcePath = "data/equipment.json";
      sourceType = "json";
    }
  }

  let systemPrompt = "";
  if (equipment.id === "sdb1106-nm") {
    systemPrompt = buildSdb1106nmDirectSystemPrompt(equipment, { manualLoaded });
    if (sourceType !== "preamble_only") {
      const preamble = buildSdb1106nmDirectPreamble(docText);
      docText = `${preamble}\n\n---\n\n${docText}`;
    }
  } else if (equipment.id === "sdb702-nm") {
    systemPrompt = buildSdb702nmDirectSystemPrompt(equipment, { manualLoaded });
  } else if (equipment.id === "w-700") {
    systemPrompt = buildSdb302nmDirectSystemPrompt(equipment, { manualLoaded });
  } else if (equipment.id === "sdb151-nm") {
    systemPrompt = buildSdb151nmDirectSystemPrompt(equipment, { manualLoaded });
  } else if (equipment.id === "sdb1560m") {
    systemPrompt = buildSdb1560mDirectSystemPrompt(equipment, { manualLoaded });
  } else {
    systemPrompt = `Ты — квалифицированный технический специалист по оборудованию ${equipment.name}.
Твоя задача — отвечать на вопросы пользователя на основе предоставленного документа.
Будь профессионален, точен и опирайся строго на предоставленную информацию.`;
  }

  return { docText, sourcePath, sourceType, systemPrompt, manualLoaded };
}

app.post("/api/chat", chatLimiter, async (req, res) => {
  const chatSocketMs = resolveChatRequestSocketMs();
  if (chatSocketMs > 0) {
    req.setTimeout(chatSocketMs);
    res.setTimeout(chatSocketMs);
    if (req.socket) {
      req.socket.setTimeout(chatSocketMs);
    }
  } else {
    req.setTimeout(0);
    res.setTimeout(0);
    if (req.socket) {
      req.socket.setTimeout(0);
    }
  }

  const { equipmentId, message, directContextMode, testMeta: rawTestMeta } = req.body || {};
  const trimmedMessage = typeof message === "string" ? message.trim() : "";
  const testMeta = normalizeTestMeta({ testMeta: rawTestMeta });

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

  if (!equipmentAllowedForRequest(req, equipmentId)) {
    logError("Chat request rejected: equipment not allowed for user.", {
      equipmentId,
      login: req.session?.user?.login,
    });
    return res.status(403).json({
      error: "Equipment not found.",
    });
  }

  const normalizedHistory = getServerChatHistory(req, equipment.id);

  const chatStartedAt = Date.now();
  const chatCapabilities = getChatCapabilities(equipment);
  const equipmentProfile = resolveEquipmentProfile(equipment.id);
  const directContextRequested = !IS_PRODUCTION && Boolean(directContextMode);
  const honestRag = shouldUseHonestRag(equipment.id);
  const useDirectContext =
    !honestRag &&
    (directContextRequested ||
      (shouldAutoDirectWhenNoPostgres(equipmentProfile, equipment.id) && !ragConfig.postgresUrl));

  logInfo("Chat request received.", {
    equipmentId: equipment?.id || equipmentId || null,
    equipmentName: equipment?.name || null,
    historyItems: normalizedHistory.length,
    question: trimmedMessage,
  });

  let equipmentGate = null;

  if (equipmentProfile?.classifyPreGate) {
    const gate = equipmentProfile.classifyPreGate(trimmedMessage, { history: normalizedHistory });
    equipmentGate = gate;
    if (gate.action === "OFF_TOPIC" || gate.action === "FOREIGN_MODEL" || gate.action === "CHATTER" || gate.action === "UNSUPPORTED_SPEC" || gate.action === "CONTACT_SUPPORT") {
      logInfo("Equipment pre-gate: scope reject (no LLM).", {
        gateAction: gate.action,
        gateReason: gate.reason,
        question: trimmedMessage,
      });
      emitChatSessionRecord({
        equipment,
        question: trimmedMessage,
        answer: gate.reply,
        chatStartedAt,
        testMeta,
        directContextRequested: useDirectContext,
        chatMode: buildChatModeInfo({
          useDirectContext,
          ragTrace: { mode: "SCOPE_GATE" },
          capabilities: chatCapabilities,
        }),
        chatCapabilities,
        ragTrace: {
          used: false,
          mode: "SCOPE_GATE",
          gateAction: gate.action,
          gateReason: gate.reason,
        },
        retrieval: {
          route: null,
          retrievalStrategy: "scope_gate",
          topScore: 0,
          chunks: 0,
        },
        gateAction: gate.action,
      });
      const gateRetrieval = {
        route: null,
        retrievalStrategy: "scope_gate",
        topScore: 0,
        chunks: 0,
        fallback: false,
        llmUsed: false,
        deterministicUsed: false,
        groundingPassed: true,
        abstained: false,
      };
      const gateRagTrace = {
        used: false,
        mode: "SCOPE_GATE",
        gateAction: gate.action,
        gateReason: gate.reason,
      };
      const gateChatMode = buildChatModeInfo({
        useDirectContext,
        ragTrace: { mode: "SCOPE_GATE" },
        capabilities: chatCapabilities,
      });
      appendServerChatExchange(req, equipment.id, trimmedMessage, gate.reply);
      return res.json(buildChatResponsePayload({
        equipment,
        answer: gate.reply,
        sources: [],
        retrieval: gateRetrieval,
        ragTrace: gateRagTrace,
        chatMode: gateChatMode,
        chatCapabilities,
      }));
    }
  }

  if (useDirectContext) {
    logInfo("Running chat in Direct Context Mode (Bypassing RAG).", {
      equipmentId: equipment.id,
      directContextRequested,
      ragPostgresConfigured: Boolean(ragConfig.postgresUrl),
      autoDirectFallback: chatCapabilities.autoDirectForEquipment,
      question: trimmedMessage.slice(0, 100),
    });

    try {
      const { docText, sourcePath, sourceType, systemPrompt, manualLoaded } =
        await getDirectContextForEquipment(equipment);

      let deterministicAnswer = equipmentProfile?.tryDeterministicAnswer
        ? equipmentProfile.tryDeterministicAnswer(trimmedMessage, { history: normalizedHistory })
        : null;

      if (!deterministicAnswer && equipmentProfile?.buildSafetyDeterministicOrPrompt && equipmentGate?.action === "SAFETY") {
        const safetyPath = equipmentProfile.buildSafetyDeterministicOrPrompt(trimmedMessage, docText);
        if (safetyPath.mode === "deterministic") {
          deterministicAnswer = safetyPath.answer;
        }
      }

      let answer = deterministicAnswer;
      let ragTraceMode = deterministicAnswer
        ? equipmentGate?.action === "SAFETY"
          ? "SAFETY_DETERMINISTIC"
          : "DIRECT_CONTEXT_DETERMINISTIC"
        : "DIRECT_CONTEXT";
      let modelOptions = null;
      let llmMessages = null;

      if (!answer) {
        const hints = equipmentProfile?.directContextHints
          ? equipmentProfile.directContextHints(trimmedMessage)
          : "";
        const userContent = hints ? `${trimmedMessage}\n\n[Служебная подсказка: ${hints}]` : trimmedMessage;

        let effectiveSystemPrompt = systemPrompt;
        if (equipmentProfile?.extractSafetyDocExcerpt && equipmentGate?.action === "SAFETY") {
          const safetyExcerpt = equipmentProfile.extractSafetyDocExcerpt(docText, trimmedMessage);
          const equipmentForPrompt = manualLoaded
            ? { id: equipment.id, name: equipment.name }
            : equipment;
          effectiveSystemPrompt = buildSafetyGroundedSystemPrompt(equipmentForPrompt, safetyExcerpt);
        }

        const systemContent = equipmentProfile?.buildDirectSystemContent
          ? equipmentProfile.buildDirectSystemContent(effectiveSystemPrompt, docText)
          : `${systemPrompt}\n\nПолный текст руководства (единственный источник):\n\n${docText}`;

        llmMessages = [
          { role: "system", content: systemContent },
          ...normalizedHistory,
          { role: "user", content: userContent },
        ];

        modelOptions = {
          temperature: 0,
          top_p: 0.85,
          ...(llmGenerationOptionsForIntent(null, trimmedMessage) || {}),
        };

        answer = await callOllamaChat({
          model: OLLAMA_MODEL,
          messages: llmMessages,
          options: modelOptions,
          directContext: true,
        });
      }

      let postGate = null;
      if (equipmentProfile?.applyPostGate) {
        const deliveryMethod = deterministicAnswer ? "direct_deterministic" : "direct_context";
        postGate = equipmentProfile.applyPostGate({
          answer,
          context: docText,
          message: trimmedMessage,
          equipment,
          deliveryMethod,
          semanticSimilarity: 1,
          gateAction: equipmentGate?.action,
          history: normalizedHistory,
        });

        const needsRetry =
          postGate.guardrails.action === "ABSTAIN" &&
          !deterministicAnswer &&
          llmMessages &&
          answer !== STRICT_ABSTAIN;

        if (needsRetry) {
          logInfo("Equipment post-gate: retrying Direct Context LLM after guardrail abstain.", {
            guardrailReason: postGate.guardrails.reason,
            questionPreview: trimmedMessage.slice(0, 120),
          });
          const retryOptions = { ...modelOptions, temperature: 0 };
          answer = await callOllamaChat({
            model: OLLAMA_MODEL,
            messages: llmMessages,
            options: retryOptions,
            directContext: true,
          });
          modelOptions = retryOptions;
          ragTraceMode = "DIRECT_CONTEXT_RETRY";
          postGate = equipmentProfile.applyPostGate({
            answer,
            context: docText,
            message: trimmedMessage,
            equipment,
            deliveryMethod: "direct_context_retry",
            semanticSimilarity: 1,
            gateAction: equipmentGate?.action,
            history: normalizedHistory,
          });
        }

        answer = postGate.answer;
      }

      const sources = [
        {
          sourceDoc: sourcePath,
          score: 1.0,
          content: docText.slice(0, 1000) + (docText.length > 1000 ? "..." : ""),
        },
      ];

      const retrieval = {
        topScore: 1.0,
        selectedTopK: 1,
        reason: "Direct context mode (No RAG)",
        ...(equipmentProfile?.applyPostGate && postGate
          ? {
              groundingPassed: postGate.guardrails.passed,
              abstained: postGate.guardrails.action === "ABSTAIN",
            }
          : {}),
      };

      const ragTrace = attachRagTraceWarnings(
        {
          used: true,
          model: deterministicAnswer ? null : OLLAMA_MODEL,
          mode: ragTraceMode,
          directContextMode: true,
          documentPath: sourcePath,
          documentLength: docText.length,
          manualLoaded: equipmentProfile?.applyPostGate ? manualLoaded : undefined,
          systemPromptUsed: systemPrompt,
          modelOptions,
          ...(postGate ? postGate.postGateTrace : {}),
        },
        chatCapabilities,
      );
      const chatMode = buildChatModeInfo({
        useDirectContext: true,
        ragTrace,
        capabilities: chatCapabilities,
      });

      logInfo("Direct Context Mode finished.", {
        equipmentId: equipment.id,
        mode: ragTraceMode,
        gateAction: equipmentGate?.action || null,
        answerPreview: answer.slice(0, 240),
      });
      emitChatSessionRecord({
        equipment,
        question: trimmedMessage,
        answer,
        chatStartedAt,
        testMeta,
        directContextRequested: useDirectContext,
        chatMode,
        chatCapabilities,
        ragTrace,
        retrieval,
        gateAction: equipmentGate?.action || null,
      });

      appendServerChatExchange(req, equipment.id, trimmedMessage, answer);
      return res.json(buildChatResponsePayload({
        equipment,
        answer,
        items: [],
        sources,
        retrieval,
        ragTrace,
        chatMode,
        chatCapabilities,
      }));
    } catch (directError) {
      logError("Direct Context Mode failed, falling back to RAG pipeline.", {
        equipmentId: equipment.id,
        error: directError instanceof Error ? directError.message : String(directError),
      });
      // Fall back to RAG pipeline (this ensures that if Ollama or something fails under Direct Mode, RAG is tried!)
    }
  }

  try {
    if (honestRag) {
      logInfo("Honest RAG path: runPipeline + applyHonestRagPostGate (no Direct Context / legacy TTX deterministic).", {
        equipmentId: equipment.id,
      });
    }

    const routerDecision = await routeQuery({
      query: trimmedMessage,
      history: normalizedHistory,
      equipmentId: equipment.id,
      equipment,
    });

    const result = await runPipeline({
      equipment,
      message: trimmedMessage,
      history: normalizedHistory,
      routerDecision,
    });

    logInfo("RAG trace.", result.ragTrace);

    let finalAnswer = result.answer;
    let finalRetrieval = result.retrieval;
    let finalRagTrace = result.ragTrace;

    if (honestRag || equipmentProfile?.applyPostGate) {
      const semanticHint = Math.max(
        Number(result.retrieval?.topScore) || 0,
        Number(result.retrieval?.fusionScore) || 0,
        Number(result.retrieval?.lexicalScore) || 0,
      );
      const deliveryMethod =
        result.ragTrace?.mode === "RAG_DETERMINISTIC" ||
        result.ragTrace?.mode === "SAFETY_DETERMINISTIC"
          ? "rag_deterministic"
          : resolveDeliveryMethodFromLlmTrace(result.ragTrace?.llm);
      const postGateParams = {
        answer: result.answer,
        context: result.retrievalContext || "",
        message: trimmedMessage,
        equipment,
        deliveryMethod,
        semanticSimilarity: semanticHint,
        gateAction: equipmentGate?.action,
        routerDecision: result.ragTrace?.router,
        retrieval: result.retrieval,
        history: normalizedHistory,
      };
      const postGate = honestRag
        ? applyHonestRagPostGate({
            ...postGateParams,
            validationProfile: equipment.id === "sdb1560m" ? "sdb1560" : "sdb1560",
          })
        : equipmentProfile.applyPostGate(postGateParams);
      finalAnswer = postGate.answer;
      finalRetrieval = {
        ...result.retrieval,
        groundingPassed: postGate.guardrails.passed,
        abstained:
          postGate.guardrails.action === "ABSTAIN" || Boolean(result.retrieval?.abstained),
      };
      finalRagTrace = attachRagTraceWarnings(
        {
          ...result.ragTrace,
          ...postGate.postGateTrace,
          mode: postGate.postGateTrace?.mode || result.ragTrace?.mode,
          serverPostGate: true,
        },
        chatCapabilities,
      );
      logInfo(`${equipment.name || equipment.id} post-gate applied to RAG answer.`, {
        guardrailAction: postGate.guardrails.action,
        guardrailReason: postGate.guardrails.reason,
        validationOk: postGate.validation.ok,
      });
    }

    const ragChatMode = buildChatModeInfo({
      useDirectContext: false,
      ragTrace: finalRagTrace,
      capabilities: chatCapabilities,
    });

    emitChatSessionRecord({
      equipment,
      question: trimmedMessage,
      answer: finalAnswer,
      chatStartedAt,
      testMeta,
      directContextRequested: false,
      chatMode: ragChatMode,
      chatCapabilities,
      ragTrace: finalRagTrace,
      retrieval: finalRetrieval,
      gateAction: equipmentGate?.action || null,
    });

    appendServerChatExchange(req, equipment.id, trimmedMessage, finalAnswer);
    return res.json(buildChatResponsePayload({
      equipment,
      answer: finalAnswer,
      items: [],
      sources: result.sources,
      retrieval: finalRetrieval,
      ragTrace: finalRagTrace,
      chatMode: ragChatMode,
      chatCapabilities,
    }));
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    if (isLikelyPostgresClientError(error)) {
      logError("PostgreSQL unavailable for chat/RAG.", {
        equipmentId: equipment?.id,
        details: raw,
      });
      emitChatSessionRecord({
        equipment,
        question: trimmedMessage,
        answer: null,
        chatStartedAt,
        testMeta,
        directContextRequested: useDirectContext,
        chatCapabilities,
        httpStatus: 503,
        error: raw,
      });
      const payload = formatPostgresFailureForClient(error);
      return res.status(503).json(payload);
    }
    logError("Chat pipeline failed (Ollama or internal).", {
      equipmentId: equipment?.id,
      details: raw,
    });
    emitChatSessionRecord({
      equipment,
      question: trimmedMessage,
      answer: null,
      chatStartedAt,
      testMeta,
      directContextRequested: useDirectContext,
      chatCapabilities,
      httpStatus: 502,
      error: raw,
    });
    const payload = formatOllamaFailureForClient(error);
    return res.status(502).json(payload);
  }
});

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const status =
    typeof err?.status === "number"
      ? err.status
      : typeof err?.statusCode === "number"
        ? err.statusCode
        : 500;

  if (
    err?.type === "entity.too.large" ||
    status === 413 ||
    err?.message?.includes?.("too large")
  ) {
    logError("Request payload too large.", { path: req.originalUrl });
    return res.status(413).json({
      error:
        "Запрос слишком большой (например, длинная история чата). Обновите страницу или сократите диалог.",
    });
  }

  logError("Unhandled request error.", {
    path: req.originalUrl,
    details: err instanceof Error ? err.message : String(err),
  });

  return res.status(status >= 400 && status < 600 ? status : 500).json({
    error: status === 500 ? "Внутренняя ошибка сервера." : (err instanceof Error ? err.message : "Internal server error."),
  });
});

const httpServerTimeouts = resolveHttpServerTimeouts();
let isShuttingDown = false;

function shutdownServer(signal) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  closeChatSessionLog(signal);
  logInfo(`Получен ${signal}, останавливаем сервер…`);
  if (!server) {
    process.exit(0);
    return;
  }
  server.close((closeErr) => {
    if (closeErr) {
      logError("Ошибка при закрытии HTTP-сервера.", {
        error: closeErr instanceof Error ? closeErr.message : String(closeErr),
      });
    } else {
      logInfo("HTTP-сервер остановлен.");
    }
    const pool = getPool(ragConfig.postgresUrl);
    if (pool) {
      pool.end().catch(() => {});
    }
    process.exit(closeErr ? 1 : 0);
  });
  setTimeout(() => {
    logError("Принудительное завершение (таймаут shutdown).");
    process.exit(1);
  }, 8000).unref();
}

process.on("SIGINT", () => shutdownServer("SIGINT"));
process.on("SIGTERM", () => shutdownServer("SIGTERM"));

async function initializeDatabaseSchemas() {
  const pool = getPool(ragConfig.postgresUrl);
  if (!pool) {
    return;
  }
  const tasks = [ensureRagSchema(pool)];
  if (authConfig.authRequired) {
    tasks.push(ensurePortalSchema(pool));
  }
  await Promise.all(tasks);
}

let server = null;

initializeDatabaseSchemas()
  .then(() => {
    if (ragConfig.postgresUrl) {
      logInfo("Database schemas are ready.", {
        auth: authConfig.authRequired,
        rag: true,
      });
    }
    server = app.listen(PORT, HOST);
    attachServerLifecycle(server);
  })
  .catch((error) => {
    logError("Failed to initialize database schemas.", {
      details: error instanceof Error ? error.message : "Unknown error",
    });
    process.exit(1);
  });

function attachServerLifecycle(httpServer) {
httpServer.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    logError(
      `Порт ${PORT} уже занят — сервер НЕ запущен. Остановите другой процесс (например старый node server.js) или задайте другой PORT.`,
      { host: HOST, port: PORT, code: err.code },
    );
    logError("Windows: netstat -ano | findstr :" + PORT + "  →  taskkill /PID <pid> /F");
  } else {
    logError("Не удалось запустить HTTP-сервер.", {
      host: HOST,
      port: PORT,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  process.exit(1);
});

httpServer.on("listening", () => {
  logInfo(`Equipment support server is listening on ${HOST}:${PORT}`, {
    nodeEnv: process.env.NODE_ENV || "production",
    consoleLog: isConsoleLogEnabled(),
    pid: process.pid,
  });
  if (/^(127\.0\.0\.1|localhost)$/i.test(HOST)) {
    logError(
      "Сервер слушает только localhost — чат с телефона по Wi‑Fi не откроется. Уберите переменную HOST или задайте HOST=0.0.0.0 и перезапустите.",
      { host: HOST }
    );
  }
  if (HOST === "0.0.0.0") {
    logInfo(`Locally open http://127.0.0.1:${PORT} or http://localhost:${PORT}`);
    const lan = listLanIPv4Addresses();
    if (lan.length) {
      logInfo("Откройте с телефона в той же сети Wi‑Fi:", {
        urls: lan.map((ip) => `http://${ip}:${PORT}/chat`),
      });
    }
  } else {
    logInfo(`Open http://${HOST}:${PORT}`);
  }
  logInfo("Available equipment loaded.", {
    equipmentIds: Object.keys(readEquipmentCatalog()),
    ollamaModel: OLLAMA_MODEL,
    ollamaNumCtx: resolveOllamaChatNumCtx(),
    embeddingModel: ragConfig.embeddingModel,
    portalAuth: authConfig.authRequired,
  });
  if (!authConfig.authRequired) {
    logInfo(
      "Вход отключён (AUTH_REQUIRED=0). Для eval и test:gate используйте этот режим; в проде — AUTH_REQUIRED=1, POSTGRES_URL, SESSION_SECRET."
    );
  } else {
    logInfo("Вход включён. Страница: /login. Создание аккаунта: npm run user:create -- --help");
  }
  logInfo("Сервер работает. Логи чата — в консоли (CHAT) и в файле logs/*.jsonl. Остановка: Ctrl+C.");
  if (isChatFileLogEnabled()) {
    initChatSessionLog();
    const logPath = getChatSessionLogPath();
    if (logPath) {
      logInfo(`Лог чата для эксперта: ${logPath}`);
    }
  }
});

httpServer.requestTimeout = 0;
httpServer.timeout = httpServerTimeouts.socketMs;
httpServer.keepAliveTimeout = httpServerTimeouts.keepAliveMs;
httpServer.headersTimeout = httpServerTimeouts.headersMs;
logInfo("HTTP server socket timeouts (ms).", {
  socket: httpServer.timeout,
  keepAlive: httpServer.keepAliveTimeout,
  headers: httpServer.headersTimeout,
  chatRouteSocketMsDefault: resolveChatRequestSocketMs(),
});
}

if (!ragConfig.postgresUrl) {
  logInfo("RAG is disabled because POSTGRES_URL is not set.");
}
