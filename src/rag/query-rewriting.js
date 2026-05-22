const { generate } = require("./llm/llm-service");
const { buildQueryRewriteSystemPrompt, buildQueryRewriteUserMessage } = require("./prompts");
const { ragInfo, ragWarn } = require("./rag-log");
const { anchorQueryToSdb1106nm, SDB1106NM_PRODUCT_MODEL } = require("./sdb1106nm-scope");

const CHATTER_ONLY_RE =
  /^(?:спасибо|благодар(?:ю|им)?|понятно|ясно|окей|ок|хорошо|отлично|принято|да|нет|ага|угу|расскажи\s+подробнее|подробнее|ещё\s+раз|еще\s+раз)\s*[.!?…]*$/iu;

const SDB_MODEL_RE = /\b(SDB\d{4})(?:\s*[-\s]?\s*(?:NM|nm))?\b/gi;

function collectSdbModelsFromText(...parts) {
  const found = new Set();
  for (const p of parts) {
    const s = String(p || "");
    const re = new RegExp(SDB_MODEL_RE.source, "gi");
    let m;
    while ((m = re.exec(s)) !== null) {
      const base = m[1].toUpperCase();
      const full = /nm/i.test(m[0]) ? `${base}NM` : base;
      found.add(full);
    }
  }
  return [...found];
}

function stripChatterFromQuery(q) {
  return String(q || "")
    .replace(
      /\b(?:спасибо|благодарю|понятно|ясно|окей|хорошо|отлично|расскажи\s+подробнее|подробнее)\b/giu,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

function mentionsStandardShelf(text) {
  return /стандартн[\p{L}]*\s+полк|полк[\p{L}]*\s+стандартн/iu.test(String(text || ""));
}

function mentionsReinforcedShelf(text) {
  return /усиленн[\p{L}]*\s+полк|полк[\p{L}]*\s+усиленн/iu.test(String(text || ""));
}

function ensureStandardShelfPhrase(query, modelCode) {
  let q = String(query || "").trim();
  const requiredCore =
    /суммарн[\p{L}]*\s+распределенн[\p{L}]*\s+нагрузк[\p{L}]*\s+на\s+стандартн[\p{L}]*\s+полк/iu.test(q) &&
    /для\s+моделей\s+SDB/i.test(q);
  if (requiredCore) {
    return q;
  }
  void modelCode;
  const prefix = `Максимальная суммарная распределенная нагрузка на стандартную полку шкафа ${SDB1106NM_PRODUCT_MODEL}`;
  if (!q || q.length < 12 || (mentionsStandardShelf(q) && q.length < 72)) {
    return prefix;
  }
  if (!/[?.!]$/.test(q)) {
    q = `${q}?`;
  }
  return `${prefix} ${q}`.replace(/\s+/g, " ").trim();
}

/** Синонимы ТО / замены / ресурса (п. 1.1.2, 3.1). */
function expandMaintenanceSynonyms(query) {
  const q = String(query || "");
  const extras = [];
  if (
    /замен|расходник|ресурс|техобслуж|техническ(?:ое|ого)\s+обслуживани|график\s+обслуж|36\s+месяц|запасн/i.test(
      q
    )
  ) {
    extras.push(
      "1.1.2",
      "3.1",
      "техническое обслуживание",
      "график технического обслуживания",
      "замена блока осушения",
      "ресурс осушителя",
      "запасные части"
    );
  }
  return [...new Set(extras)];
}

/** Синонимы неисправностей (табл. 3.2 / п. 3.1.4) для hybrid FTS и vector. */
function expandTroubleshootingSynonyms(query) {
  const q = String(query || "");
  const extras = [];

  if (
    /не\s+включается|не\s+запускается|не\s+включ(?:а|и)ется|не\s+включается|нет\s+индикац/i.test(
      q
    )
  ) {
    extras.push(
      "отсутствие индикации",
      "срабатывание защиты",
      "питание",
      "шкаф не включается",
      "напряжение в электросети",
      "предохранитель",
      "кабель сетевого питания",
      "типовые неисправности"
    );
  }

  if (
    /влажност/i.test(q) &&
    /не\s+(?:падает|снижается|уменьшается|выходит)|не\s+выходит\s+на|не\s+достигает/i.test(q)
  ) {
    extras.push(
      "превышение времени выхода на режим",
      "герметичность",
      "фильтр",
      "уплотнитель",
      "резиновый уплотнитель",
      "плотность закрытия замков",
      "осушитель",
      "осушающий модуль",
      "кожух осушителя",
      "перечень возможных неисправностей",
      "2.2.2.2",
      "2.2.2.3",
      "не выходит на заданный режим влажности",
      "типовые неисправности",
      "таблица 3.2"
    );
  }

  if (/пищит|звуковой\s+сигнал|сигнализац/i.test(q) && !/дым|пожар/i.test(q)) {
    extras.push("открыта дверь", "датчик двери", "шкаф издает звуковой сигнал");
  }

  if (/ethernet|сет(?:и|ь)\s+не\s+работ|нет\s+связ/i.test(q)) {
    extras.push("нет связи шкафа по сети ethernet", "кабель ethernet");
  }

  return [...new Set(extras)];
}

/** Синонимы для hybrid FTS / vector (шаг, точность, сорбент, неисправности). */
function expandRetrievalSynonyms(query) {
  let q = String(query || "").trim();
  if (!q) {
    return q;
  }
  const extras = [...expandTroubleshootingSynonyms(q), ...expandMaintenanceSynonyms(q)];
  if (/\d/.test(q) && /условия\s+эксплуатации|1\.1\.3|допустим|входит\s+ли|соответствует/i.test(q)) {
    extras.push("1.1.3", "условия эксплуатации", "диапазон", "допустимые значения");
  }
  if (/желт|зелен|красн|индикатор|мигает|1\.1\.4\.3\.3/i.test(q) && !/неисправ|не\s+работ/i.test(q)) {
    extras.push("1.1.4.3.3", "световой сигнал", "режим хранения", "режим осушения", "режим регенерации");
  }
  if (/температур|подогрев|нагрев/i.test(q)) {
    extras.push("система подогрева", "2.3.3.1", "+40", "плюс 40");
  }
  if (/\bшаг\b/iu.test(q) && !/дискретност/iu.test(q)) {
    extras.push("дискретность", "шаг установки");
  }
  if (/\bточност/iu.test(q) && !/погрешност/iu.test(q)) {
    extras.push("погрешность");
  }
  if (/\bвеществ/iu.test(q) || /\bсорбент/iu.test(q) || /молекулярн(?:ое|ого)\s+сито/iu.test(q)) {
    if (!/сорбент/iu.test(q)) {
      extras.push("сорбент");
    }
    if (!/молекулярн/iu.test(q)) {
      extras.push("молекулярное сито");
    }
    if (!/веществ/iu.test(q)) {
      extras.push("вещество");
    }
  }
  if (extras.length) {
    q = `${q} ${[...new Set(extras)].join(" ")}`.replace(/\s+/g, " ").trim();
  }
  return q;
}

function applyMandatoryRewriteRules(standalone, userQuery, history, equipment) {
  let q = stripChatterFromQuery(standalone);
  if (!q) {
    q = stripChatterFromQuery(userQuery);
  }
  q = expandRetrievalSynonyms(q);

  if (mentionsStandardShelf(userQuery) || mentionsStandardShelf(q)) {
    q = ensureStandardShelfPhrase(q, null);
  } else if (mentionsReinforcedShelf(userQuery) || mentionsReinforcedShelf(q)) {
    if (!/усиленн[\p{L}]*\s+полк/iu.test(q) && /усиленн/iu.test(userQuery)) {
      q = q.replace(/нагрузк[\p{L}]*/iu, (m) => `${m} на усиленную полку`);
    }
  }

  return anchorQueryToSdb1106nm(q);
}

function parseRewriteModelOutput(raw) {
  let t = String(raw || "").trim();
  t = t.replace(/^```(?:\w+)?\s*/i, "").replace(/```\s*$/i, "").trim();
  t = t.replace(/^["'`]+|["'`]+$/g, "").trim();
  t = t.replace(/^standalone\s*query\s*:\s*/i, "").trim();
  const lines = t.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 1) {
    return lines[0];
  }
  return lines[0] || t;
}

function shouldAttemptRewrite(userQuery, history) {
  const q = String(userQuery || "").trim();
  if (!q || CHATTER_ONLY_RE.test(q)) {
    return false;
  }
  const hasModel = /\bSDB\d{4}/i.test(q);
  const hist = Array.isArray(history) ? history : [];
  if (q.length >= 140 && hasModel && !mentionsStandardShelf(q)) {
    return false;
  }
  if (hist.length === 0 && q.length >= 80 && hasModel) {
    return false;
  }
  return true;
}

function heuristicRewrite(userQuery, history, equipment) {
  let q = stripChatterFromQuery(userQuery);
  return applyMandatoryRewriteRules(q, userQuery, history, equipment);
}

/**
 * @param {{ userQuery: string, history?: Array<{role:string,content:string}>, equipment?: object, ragConfig?: object }} params
 * @returns {Promise<{ standaloneQuery: string, rewritten: boolean, source: string, model?: string }>}
 */
async function rewriteQueryForRetrieval({ userQuery, history = [], equipment, ragConfig = {} }) {
  const original = String(userQuery || "").trim();
  if (!original) {
    return { standaloneQuery: original, rewritten: false, source: "empty" };
  }
  if (ragConfig.queryRewriteEnabled === false) {
    return { standaloneQuery: original, rewritten: false, source: "disabled" };
  }
  if (!shouldAttemptRewrite(original, history)) {
    const tuned = applyMandatoryRewriteRules(original, original, history, equipment);
    return {
      standaloneQuery: tuned,
      rewritten: tuned !== original,
      source: "rules_only",
    };
  }

  try {
    const systemPrompt = buildQueryRewriteSystemPrompt(equipment);
    const userMessage = buildQueryRewriteUserMessage(original, history);
    const result = await generate({
      route: "QUERY_REWRITE",
      context: "",
      systemPrompt,
      userMessage,
      outputSchema: null,
    });
    let standalone = parseRewriteModelOutput(result.content);
    standalone = applyMandatoryRewriteRules(standalone, original, history, equipment);
    if (!standalone || standalone.length < 6) {
      throw new Error("rewrite_empty");
    }
    ragInfo("query_rewrite.ok", {
      source: "llm",
      model: result.model,
      originalLen: original.length,
      standaloneLen: standalone.length,
    });
    return {
      standaloneQuery: anchorQueryToSdb1106nm(standalone),
      rewritten: standalone !== original,
      source: "llm",
      model: result.model,
    };
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    ragWarn("query_rewrite.fallback", { error: details });
    const standalone = heuristicRewrite(original, history, equipment);
    return {
      standaloneQuery: anchorQueryToSdb1106nm(standalone),
      rewritten: standalone !== original,
      source: "heuristic",
    };
  }
}

module.exports = {
  rewriteQueryForRetrieval,
  applyMandatoryRewriteRules,
  expandRetrievalSynonyms,
  expandTroubleshootingSynonyms,
  expandMaintenanceSynonyms,
  collectSdbModelsFromText,
};
