const express = require("express");
const fs = require("fs");
const path = require("path");
const equipmentCatalog = require("./data/equipment.json");
const { getRagConfig, getMaxRetrievalTopK } = require("./src/rag/config");
const { getPool, ensureRagSchema } = require("./src/rag/pg-client");
const {
  retrieveEquipmentContext,
  formatContextForPrompt,
  extractSources,
} = require("./src/rag/retrieval");
const { classifyQueryIntent } = require("./src/rag/query-intent");
const { validateAnswerAgainstContext } = require("./src/rag/answer-validation");
const { fetchOllama } = require("./src/rag/ollama-fetch");

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
const OLLAMA_MODEL = "gemma4:e2b";
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
  const fallback = 32768;
  const n = Number(process.env.OLLAMA_NUM_CTX);
  let v = Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  v = Math.min(v, trainedCap);
  return Math.max(2048, v);
}

function getOllamaChatOptions() {
  return {
    num_ctx: resolveOllamaChatNumCtx(),
  };
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
];

function sharedDocumentationRulesAsBullets() {
  return SHARED_DOCUMENTATION_RULES.map((line) => `- ${line}`).join("\n");
}

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
    guideUrl: equipment.guideUrl,
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

function looksLikeStructuredChecklistAnswer(text) {
  return typeof text === "string" && /^\d+\.\s*Проверка:/m.test(text.trim());
}

function sanitizeAssistantProseAnswer(text) {
  if (typeof text !== "string") {
    return "";
  }

  let t = text.replace(/\r\n/g, "\n").trim();
  if (!t) {
    return "";
  }

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

  if (looksLikeStructuredChecklistAnswer(text)) {
    return text.trim();
  }

  return sanitizeAssistantProseAnswer(text);
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
  ].join("\n");
}

async function callOllamaChat({ model, messages, format }) {
  const chatOptions = getOllamaChatOptions();
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

/** Человекочитаемый ответ при сбоях Ollama (без сырых JSON в интерфейсе чата). */
function formatOllamaFailureForClient(error) {
  const raw = error instanceof Error ? error.message : String(error);
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
    logInfo(`${req.method} ${req.originalUrl} -> ${res.statusCode}`, {
      durationMs: Date.now() - startedAt,
      ip: req.ip,
    });
  });

  next();
});

app.use(express.json({ limit: "4mb" }));

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

app.use(express.static(publicDir));

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
  req.setTimeout(0);
  res.setTimeout(0);
  if (req.socket) {
    req.socket.setTimeout(0);
  }

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
    const procedureMode = PROCEDURE_PATTERN.test(trimmedMessage);
    const preparationSectionFilter =
      PREPARATION_SECTION_PATTERN.test(trimmedMessage);

    const classifierDecision = await detectSafetyModeWithClassifier(
      trimmedMessage,
      ragConfig.safetyClassifierModel,
      OLLAMA_MODEL
    );

    const forceSafetyIntent =
      keywordEmergency ||
      keywordSafety ||
      classifierDecision.emergencyMode ||
      classifierDecision.safetyMode;

    const queryIntent = classifyQueryIntent(trimmedMessage, equipment, {
      forceSafety: forceSafetyIntent,
    });

    const retrievalTopCap = getMaxRetrievalTopK(ragConfig);
    const retrievalWide = await retrieveEquipmentContext({
      equipmentId: equipment.id,
      query: trimmedMessage,
      topK: retrievalTopCap,
      sectionHints: preparationSectionFilter ? ["2.2", "2.3"] : undefined,
      intent: queryIntent,
    });
    const safetyMode =
      keywordEmergency ||
      classifierDecision.emergencyMode ||
      ((keywordSafety || classifierDecision.safetyMode) &&
        !(keywordSynthesis || classifierDecision.synthesisMode));
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
      ...(procedureMode ? ["keyword:procedure"] : []),
      ...classifierDecision.triggerTerms.map((term) => `classifier:${term}`),
    ];
    const requestedTopK = emergencyMode
      ? ragConfig.emergencyRetrievalTopK
      : safetyMode
        ? synthesisMode
          ? ragConfig.synthesisRetrievalTopK
          : ragConfig.safetyRetrievalTopK
        : synthesisMode
          ? ragConfig.synthesisRetrievalTopK
          : ragConfig.retrievalTopK;

    const slicedChunks = retrievalWide.chunks.slice(0, requestedTopK);
    const retrieval = {
      ...retrievalWide,
      chunks: slicedChunks,
      topScore: slicedChunks.length
        ? slicedChunks[0].rerankScore ?? slicedChunks[0].score
        : 0,
      selectedTopK: requestedTopK,
    };
    const sources = extractSources(retrieval.chunks);
    const retrievalContext = formatContextForPrompt(retrieval.chunks);

    logInfo("Retrieval completed.", {
      equipmentId: equipment.id,
      queryIntentType: queryIntent.intentType,
      queryOperatingModes: queryIntent.queryOperatingModes,
      mode: safetyMode ? "safety" : "normal",
      safetyMode,
      emergencyMode,
      synthesisMode,
      procedureMode,
      preparationSectionFilter,
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
        score: chunk.rerankScore ?? chunk.score,
        vectorScore: chunk.vectorScore,
      })),
      sectionHints: retrieval.sectionHints || [],
      sectionHintFiltered: Boolean(retrieval.sectionHintFiltered),
      rerankApplied: Boolean(retrieval.rerankApplied),
      retrievalFetchLimit: retrieval.fetchLimit,
      embeddingAugmented: Boolean(retrieval.embeddingAugmented),
    });

    const ragEnabled = Boolean(ragConfig.postgresUrl);
    if (
      ragEnabled &&
      (retrieval.chunks.length === 0 || retrieval.topScore < ragConfig.minSimilarityScore)
    ) {
      const fallbackAnswer =
        "Информация отсутствует в документации. Уточните вопрос или проверьте инструкцию.";

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
          rerankApplied: Boolean(retrieval.rerankApplied),
          fetchLimit: retrieval.fetchLimit,
          intentType: queryIntent.intentType,
          queryOperatingModes: queryIntent.queryOperatingModes,
        },
      });
    }

    const ollamaStartedAt = Date.now();
    let answer = "";
    let skipAnswerSelfCorrection = false;
    let responseItems = [];
    let verification = {
      enabled: safetyMode || synthesisMode,
      emergencyMode,
      synthesisMode,
      safetySubmode,
      candidateItems: 0,
      acceptedItems: 0,
      droppedItems: 0,
      blockedUnsafeItems: 0,
      jsonRetryUsed: false,
    };

    if (safetyMode || synthesisMode) {
      const checklistPrompt = [
        trimmedMessage,
        "",
        "Верни строго JSON формата:",
        '{"items":[{"check":"...","criticalReason":"...","type":"fact","confidence":"high","composed":true,"evidence":[{"quote":"...","source":"..."}]}]}',
        "Требования:",
        "- Укажи проверки и шаги из контекста; для режима эксплуатации включай подготовку и осмотр, если они есть в тексте.",
        "- Каждый пункт обязан содержать подтверждение из контекста.",
        "- type: fact или interpretation. interpretation обязательно помечай как вывод.",
        "- confidence: high/medium/low.",
        synthesisMode
          ? "- РАЗРЕШЕНО только упорядочивать шаги, явно присутствующие в тексте. ЗАПРЕЩЕНО добавлять новые шаги, даже если они логически ожидаемы. Каждый шаг должен иметь прямое подтверждение в тексте."
          : "- Новая структура не обязательна; используй прямые пункты контекста.",
        synthesisMode
          ? "- Для composed=true указывай минимум два подтверждения evidence[] из разных источников."
          : "- Можно указывать одно подтверждение evidence[].",
        emergencyMode
          ? "- Аварийный сценарий: не предлагай ремонт/диагностику/продолжение работы."
          : "- Избегай небезопасных действий и недоказанных рекомендаций.",
        "- Если подтвержденных пунктов нет, верни {\"items\":[]}.",
        "",
        "Общая политика документирования — каждый пункт JSON и evidence должны ей соответствовать:",
        sharedDocumentationRulesAsBullets(),
      ].join("\n");

      const checklistMessages = [
        {
          role: "system",
          content: buildSystemPrompt(equipment, retrievalContext, {
            safetyMode,
            emergencyMode,
            synthesisMode,
            procedureMode,
            queryIntent,
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
          skipAnswerSelfCorrection = true;
        } else {
          logInfo("Safety verifier accepted no items; falling back to prose RAG answer.", {
            equipmentId: equipment.id,
            candidateItems: candidateItems.length,
          });
          answer = await callOllamaChat({
            model: OLLAMA_MODEL,
            messages: [
              {
                role: "system",
                content: buildSystemPrompt(equipment, retrievalContext, {
                  safetyMode: false,
                  emergencyMode: false,
                  synthesisMode,
                  procedureMode,
                  queryIntent,
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
      } else {
        responseItems = verified.verifiedItems;
        skipAnswerSelfCorrection = true;
        answer = synthesisMode
          ? buildUserFacingProcedureAnswer(verified.verifiedItems)
          : buildChecklistAnswer(verified.verifiedItems);
        if (!emergencyMode && notConfirmed.length > 0) {
          if (synthesisMode) {
            answer = [
              answer,
              "",
              "Отдельные возможные шаги не включены: их нельзя было надёжно подтвердить по тексту документа.",
            ].join("\n");
          } else {
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
              procedureMode,
              queryIntent,
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

    if (
      ragConfig.chatSelfCorrect &&
      answer &&
      !skipAnswerSelfCorrection
    ) {
      try {
        answer = await runAnswerSelfCorrection({
          draftAnswer: answer,
          retrievalContext,
          userQuestion: trimmedMessage,
          equipment,
          model: OLLAMA_MODEL,
          maxContextChars: ragConfig.selfCorrectionMaxContextChars,
        });
      } catch (scError) {
        logInfo("Answer self-correction failed; using draft.", {
          equipmentId: equipment.id,
          details: scError instanceof Error ? scError.message : String(scError),
        });
      }
    }

    answer = polishAssistantAnswer(answer);

    if (!answer) {
      logError("Ollama returned empty answer after sanitization.", {
        equipmentId: equipment?.id || equipmentId || null,
      });
      return res.status(502).json({
        error: "Ollama returned an empty response.",
      });
    }

    const hallucinationCheck = detectHallucinations(answer, retrievalContext);
    verification.hallucinationFlagged = hallucinationCheck.flagged;

    const ragGroundingCheck = ragConfig.ragAnswerValidation
      ? validateAnswerAgainstContext(answer, retrievalContext, {
          queryOperatingModes: queryIntent.queryOperatingModes,
          intentType: queryIntent.intentType,
        })
      : { ok: true, warnings: [], skipped: true };
    logInfo("Ollama answer generated.", {
      equipmentId: equipment?.id || equipmentId || null,
      mode: safetyMode ? "safety" : "normal",
      safetyMode,
      emergencyMode,
      synthesisMode,
      procedureMode,
      preparationSectionFilter,
      safetySubmode,
      triggerTerms,
      durationMs: Date.now() - ollamaStartedAt,
      verification,
      hallucinationFlagged: hallucinationCheck.flagged,
      ragGroundingCheck,
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
        sectionHints: retrieval.sectionHints || [],
        sectionHintFiltered: Boolean(retrieval.sectionHintFiltered),
        rerankApplied: Boolean(retrieval.rerankApplied),
        fetchLimit: retrieval.fetchLimit,
        intentType: queryIntent.intentType,
        queryOperatingModes: queryIntent.queryOperatingModes,
      },
      safety: {
        safetyMode,
        emergencyMode,
        synthesisMode,
        procedureMode,
        preparationSectionFilter,
        submode: safetySubmode,
        triggerTerms,
      },
      verification,
      hallucinationCheck,
      ragGroundingCheck,
    });
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    logError("Failed to reach Ollama.", {
      equipmentId: equipment?.id,
      details: raw,
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
    error: err instanceof Error ? err.message : "Internal server error.",
  });
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
    ollamaNumCtx: resolveOllamaChatNumCtx(),
    embeddingModel: ragConfig.embeddingModel,
  });
});

// Входящий запрос: не обрывать длинную генерацию; исходящий к Ollama — см. fetchOllama (Undici bodyTimeout).
server.requestTimeout = 0;
server.timeout = 0;
server.headersTimeout = 600_000;
server.keepAliveTimeout = 120_000;

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
