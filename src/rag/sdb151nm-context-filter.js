"use strict";

/**
 * SDB151NM-only: family РЭ mixes 151/302/702/1106 in one table.
 * Drop rows about other models before they reach the LLM / scoped manual.
 */

const HAS_151NM = /SDB\s*151\s*NM/iu;
const FOREIGN_MODEL = /\bSDB\s*(?:302|306|702|1106|1560)(?:\s*(?:NM|М|M))?\b/iu;
const FOREIGN_ROW_START = /^\s*SDB\s*(?:302|306|702|1106|1560)\b/iu;
const NON_NM_151_ROW = /^\s*SDB\s*151\b(?!\s*NM)/iu;
const GENERIC_WHEELS = /шкаф\s+установлен\s+на\s+кол[её]с|каждое\s+кол[её]со\s+имеет\s+антистатическ/iu;
const WHEELS_KIT_OTHERS = /кол[её]с[\p{L}]*\s+для\s+транспортирован/iu;
const HEATING_OPTION_LINE = /система\s+подогрева\s+воздуха\s+для\s+шкафов/iu;
const GENERIC_HEATING_OPTION =
  /(?:опци[\p{L}]*[\s«"']*подогрев|систем[\p{L}]*\s+подогрева\s+воздуха)/iu;
const HEATING_TEMP_RANGE =
  /(?:температур[\p{L}]*\s+нагрев|температур[\p{L}]*\s+подогрев|значение\s+температуры\s+воздуха|порог[\p{L}]*\s+отслеживан[\p{L}]*\s+температур)/iu;
const HEATING_PROCEDURE_START =
  /установ[\p{L}]*\s+температур[\p{L}]*\s+нагрев|использован[\p{L}]*\s+шкафа\s+с\s+опци[\p{L}]*\s+подогрев/iu;
const HEATING_PROCEDURE_END =
  /^(?:ВЫКЛЮЧЕНИЕ|ДЕЙСТВИЯ\s+В\s+ЭКСТРЕМАЛЬН|ТЕХНИЧЕСКОЕ\s+ОБСЛУЖИВАНИЕ|ХРАНЕНИЕ|ТРАНСПОРТИРОВАНИЕ|УТИЛИЗАЦИЯ|ИСПОЛЬЗОВАНИЕ\s+ШКАФА\s+С\s+ОПЦИЕЙ\s+АЗОТ)/u;
const HEATING_OPTION_SPECS =
  /т\s*окружающ[\p{L}]*\s+среды\s*\+?\s*5|равномерность распределения\s*температур|укороченн[\p{L}]*\s+полк[\p{L}]*\s+с\s+вырезом|^максимальная температура:\s*плюс\s*40|точность поддержания:\s*от\s+плюс\s*1/iu;

const CONTEXT_PREFACE = [
  "[Ограничения контекста только для SDB151NM — не путать с другими моделями семейства]",
  "• Колёса в базовую поставку SDB151NM не входят (табл. 1.2).",
  "• Опция подогрева воздуха в табл. 1.4 для SDB151NM не приведена.",
  "• Внутренний/полный объём (литры) и число дверей в таблицах РЭ не указаны.",
  "• В ответе укажи пункт или таблицу РЭ из контекста ниже (п. …, табл. …).",
  "",
].join("\n");

const SCOPED_MANUAL_HEADER = [
  "# Руководство по эксплуатации SDB151NM (выборка для поиска)",
  "",
  "Источник: семейное РЭ SATE.421411.001.00.00.00.00.00.000. Для чата SDB151NM оставлены общие процедуры и строки таблиц, где явно указан **SDB151NM**. Строки других моделей удалены.",
  "",
  "- Колёса в базовую поставку **не входят** (табл. 1.2); выравнивание — регулируемые ножки.",
  "- Опция подогрева воздуха в табл. 1.4 для SDB151NM **не приведена** (нет диапазона +5…+40 °C как штатной опции).",
  "- Внутренний/полный объём (литры) и число дверей в таблицах **не указаны**.",
  "",
  "---",
  "",
].join("\n");

function stripForeignModelNames(line) {
  return String(line || "")
    .replace(/\bSDB\s*(?:302|306|702|1106|1560)(?:\s*(?:NM|М|M))?\*?/giu, "")
    .replace(/\bSDB\s*151\b(?!\s*NM)/giu, "")
    .replace(/,\s*,+/g, ",")
    .replace(/,{2,}/g, ",")
    .replace(/^(?:,\s*)+/g, "")
    .replace(/\(\s*,/g, "(")
    .replace(/,\s*\)/g, ")")
    .replace(/,\s*и\s*,/giu, ", ")
    .replace(/для моделей\s*,/giu, "для модели ")
    .replace(/для модели\s*,/giu, "для модели ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*:/g, ":")
    .trim();
}

function rewriteOrDropLine(line) {
  const t = String(line || "").trim();
  if (!t) return line;

  if (/распространяется на\s+шкафы\s+сухого\s+хранения/iu.test(t)) {
    return "Настоящее руководство в этой базе относится только к шкафу сухого хранения **SDB151NM** производства ООО «Совтест АТЕ».";
  }

  if (GENERIC_WHEELS.test(t)) return null;

  if (WHEELS_KIT_OTHERS.test(t) && !HAS_151NM.test(t)) {
    return "Колёса для транспортирования: для SDB151NM в табл. 1.2 не указаны, в базовую поставку не входят.";
  }

  if (HEATING_OPTION_LINE.test(t) && !HAS_151NM.test(t)) {
    return "Опция подогрева воздуха: в табл. 1.4 для SDB151NM не приведена.";
  }

  if (HEATING_TEMP_RANGE.test(t) && !HAS_151NM.test(t)) return null;
  if (HEATING_OPTION_SPECS.test(t) && !HAS_151NM.test(t)) return null;

  if (HAS_151NM.test(t)) {
    return stripForeignModelNames(line) || line;
  }

  if (FOREIGN_ROW_START.test(t)) return null;

  if (NON_NM_151_ROW.test(t) && /(?:\d{2,4}\s*[xх×]\s*\d{2,4}|\d{2,3}\s*кг)/iu.test(t)) {
    return null;
  }

  if (FOREIGN_MODEL.test(t)) return null;

  if (GENERIC_HEATING_OPTION.test(t)) return null;

  return line;
}

function filterSdb151nmContextText(text) {
  const raw = String(text || "");
  if (!raw.trim()) return "";
  const lines = raw.split(/\r?\n/);
  const kept = [];
  let skipHeatingProc = false;
  for (const line of lines) {
    const t = String(line || "").trim();
    if (skipHeatingProc) {
      if (HEATING_PROCEDURE_END.test(t)) {
        skipHeatingProc = false;
      } else {
        continue;
      }
    }
    if (HEATING_PROCEDURE_START.test(t) && !HAS_151NM.test(t)) {
      skipHeatingProc = true;
      continue;
    }
    const next = rewriteOrDropLine(line);
    if (next == null) continue;
    kept.push(next);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function prependSdb151nmContextPreface(filteredText) {
  const body = String(filteredText || "").trim();
  if (!body) return CONTEXT_PREFACE.trim();
  return `${CONTEXT_PREFACE}${body}`;
}

function buildSdb151nmScopedManual(rawFamilyText) {
  const filtered = filterSdb151nmContextText(rawFamilyText);
  if (!filtered) return SCOPED_MANUAL_HEADER.trim();
  return `${SCOPED_MANUAL_HEADER}${filtered}\n`;
}

function filterSdb151nmChunks(chunks) {
  if (!Array.isArray(chunks)) return [];
  const out = [];
  for (const chunk of chunks) {
    if (!chunk || typeof chunk !== "object") continue;
    const content = filterSdb151nmContextText(chunk.content || "");
    const meta = chunk.metadata && typeof chunk.metadata === "object" ? { ...chunk.metadata } : {};
    if (typeof meta.parentLlmContext === "string" && meta.parentLlmContext.trim()) {
      meta.parentLlmContext = filterSdb151nmContextText(meta.parentLlmContext);
    }
    const body = (meta.parentLlmContext && meta.parentLlmContext.trim()) || content;
    if (!String(body || "").trim()) continue;
    out.push({ ...chunk, content, metadata: meta });
  }
  return out;
}

module.exports = {
  CONTEXT_PREFACE,
  SCOPED_MANUAL_HEADER,
  filterSdb151nmContextText,
  filterSdb151nmChunks,
  prependSdb151nmContextPreface,
  buildSdb151nmScopedManual,
};
