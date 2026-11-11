/**
 * Пилот «честного» RAG: equipment id из RAG_HONEST_EQUIPMENT (через запятую).
 * Для этих id отключается FAQ deterministic/post-gate recovery (см. docs/RAG_SDB1560M_HONEST_RESTORE.md).
 */

function parseHonestEquipmentIds() {
  const raw = String(process.env.RAG_HONEST_EQUIPMENT || "").trim();
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean);
}

function shouldUseHonestRag(equipmentId) {
  const id = String(equipmentId || "").trim().toLowerCase();
  if (!id) {
    return false;
  }
  return parseHonestEquipmentIds().includes(id);
}

function isRagPureEnabled() {
  const raw = String(process.env.RAG_PURE || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/** RAG PURE: embed+LLM из РЭ для honest-пилота, без contextual-extract и FAQ recovery. */
function shouldUseRagPure(equipmentId) {
  return isRagPureEnabled() && shouldUseHonestRag(equipmentId);
}

function contextHasSdb1560ManualPdf(text) {
  const t = String(text || "");
  return /SDB1560NM\.pdf|Руководство\s+SDB1560/i.test(t);
}

/** PDF или golden-facts / табличные ТТХ в formatted context. */
function contextHasSdb1560AnswerableData(text) {
  const t = String(text || "");
  if (contextHasSdb1560ManualPdf(t)) {
    return true;
  }
  return /golden-facts-sdb1560|таблиц[аы]?\s*1\.[12]|260\s*кг|1\s*896|2070|2\s*070|IP\s*55|36\s+месяц|99[,.]9\s*мин|1\.1\.4\.4\.1|1\.1\.4\.3\.4|вентилятор\s+осушител/i.test(
    t,
  );
}

/** RAG PURE: golden → PDF → прочее; retrieval-cards ниже. */
function filterFusedChunksForRagPure(chunks) {
  const list = Array.isArray(chunks) ? [...chunks] : [];
  const manualRank = (ch) => {
    const src = String(ch?.sourceDoc || "");
    if (/golden-facts-sdb1560/i.test(src)) {
      return 3;
    }
    if (/\.pdf|Руководство\s+SDB1560/i.test(src)) {
      return 2;
    }
    if (/retrieval-cards/i.test(src)) {
      return 0;
    }
    return 1;
  };
  return [...list].sort((a, b) => {
    const dr = manualRank(b) - manualRank(a);
    if (dr !== 0) {
      return dr;
    }
    return (Number(b.rerankScore) || Number(b.score) || 0) - (Number(a.rerankScore) || Number(a.score) || 0);
  });
}

/** RAG PURE: golden-facts и PDF в начало prompt list. */
function prioritizeSdb1560PurePromptChunks(chunks) {
  return filterFusedChunksForRagPure(chunks);
}

function isUnverifiedVolumeLiterQueryLazy(message) {
  return require("./sdb1560m-unsupported-spec").isUnverifiedVolumeLiterQuery(message);
}

/** Эвристика «ответ по теме» для post-gate (не подмена фактов, только не сбрасывать в abstain). */
function ragPureSdb1560AnswerLooksOnTopic(message, answer) {
  const m = String(message || "");
  const a = String(answer || "");
  if (/мига|красн.*авари|красн.*норм|красн.*долж/i.test(m) && /осушен|мига|индикатор|1\.1\.4\.3/i.test(a)) {
    return true;
  }
  if (!isUnverifiedVolumeLiterQueryLazy(m)) {
    if (/полн[^\n]{0,10}объ|полный\s+объ/i.test(m) && /2070|2\s*070|2100|2\s*100/i.test(a)) {
      return true;
    }
    if (/внутренн[^\n]{0,10}объ|рабоч[^\n]{0,8}объ/i.test(m) && /896|1\s*896/i.test(a)) {
      return true;
    }
  }
  if (/двер/i.test(m) && /\b4\b/.test(a)) {
    return true;
  }
  if (/регенерац/i.test(m) && /мощност|максимальн/i.test(m) && /540/.test(a)) {
    return true;
  }
  if (/двер/i.test(m) && /\b4\b/.test(a)) {
    return true;
  }
  if (/540/.test(a) && /регенерац/i.test(m)) {
    return true;
  }
  if (/осушит|блок\s+осуш|36\s*месяц|график/i.test(m) && /36/.test(a)) {
    return true;
  }
  if (/\bip\b|пыл|брызг/i.test(m) && /ip\s*55|ip55/i.test(a)) {
    return true;
  }
  if (/260|вес|килограм|тяж|кран|вдво/i.test(m) && /260/.test(a)) {
    return true;
  }
  if (/полок/i.test(m) && /полк|\b2\b|\b4\b/i.test(a)) {
    return true;
  }
  if (/таймер.*азот|n2ton|99[,.]9/i.test(m) && /99/.test(a)) {
    return true;
  }
  if (/180|выходит\s+на|влажност.*включ|после\s+включ/i.test(m) && /180/.test(a)) {
    return true;
  }
  if (/\bw\b|символ\s*w|буква\s*w/i.test(m) && /подогрев|\bw\b/i.test(a)) {
    return true;
  }
  if (/давлен.*азот|азот.*вход/i.test(m) && /(?:6\s*бар|бар)/i.test(a)) {
    return true;
  }
  if (/100.*полк|нагрузк.*полк|полк.*кг/i.test(m) && /100/.test(a)) {
    return true;
  }
  if (/точност.*влаж|±\s*1/i.test(m) && /±\s*1|1\s*rh/i.test(a)) {
    return true;
  }
  if (/0.*80|диапазон\s+влаж/i.test(m) && /\b0\b/.test(a) && /80/.test(a)) {
    return true;
  }
  if (/подогрев|\+?\s*40/i.test(m) && /\+?\s*40/.test(a)) {
    return true;
  }
  if (/сломал|замен|что\s+делать/i.test(m) && /полк|техподдерж|замен|комплект|800\s*\(\s*800\s*\)|8\s*\(\s*800/i.test(a)) {
    return true;
  }
  if (/пищ|громк.*звук|звук.*громк|звуков.*сигнал/i.test(m) && /звук|сигнал|двер|штат|1\.1\.4/i.test(a)) {
    return true;
  }
  if (
    /влажност/iu.test(m) &&
    /(?:резко\s+)?(?:вырос|повыс|поднял)/iu.test(m) &&
    /1\.1\.4\.4\.1|вентилятор|открыт|загруз|60\s*±/iu.test(a)
  ) {
    return true;
  }
  if (/ухл|климат.*исполнен/i.test(m) && /ухл/i.test(a)) {
    return true;
  }
  return false;
}

/** Ответ не содержит ключевых цифр/темы вопроса — повод для LLM retry (не подмена ответа). */
function ragPureSdb1560AnswerOffTopic(message, answer) {
  const m = String(message || "");
  const a = String(answer || "");
  if (
    /(?:красн[\p{L}]*\s+(?:ламп|лампочк|огон|светодиод|индикатор|свет)|мига[\p{L}]*\s+красн)/iu.test(m) &&
    !/осушен|1\.1\.4\.3\.3/i.test(a)
  ) {
    return true;
  }
  if (/мига|красн.*(?:норм|авари|паник|долж)/i.test(m) && !/осушен|мига|индикатор|1\.1\.4\.3/i.test(a)) {
    return true;
  }
  if (!isUnverifiedVolumeLiterQueryLazy(m) && /внутренн|рабоч[^\n]{0,8}объ/i.test(m) && !/896|1\s*896/i.test(a)) {
    return true;
  }
  if (/давлен[^\n]{0,12}азот|азот.*вход/i.test(m) && !/бар|\bbar\b/i.test(a)) {
    return true;
  }
  if (/выходит\s+на\s+влажност|после\s+включен|долго\s+выход|через\s+сколько/i.test(m) && !/180|3\s*ч/i.test(a)) {
    return true;
  }
  if (
    /(?:сколько\s+ватт|мощност|потребля|ватт)/iu.test(m) &&
    /хранен/iu.test(m) &&
    !/азот|подогрев|опци|установленн[\p{L}]*\s+систем/iu.test(m) &&
    /\b810\b/u.test(a) &&
    !/\b8\s*(?:Вт|W)\b/iu.test(a)
  ) {
    return true;
  }
  if (
    /(?:диапазон|какой\s+диапазон).{0,40}влажност|влажност.{0,30}поддержива/iu.test(m) &&
    !/(?:0\s*[–\-…]\s*80|0\s*-\s*80|\[0\s*-\s*80|0\s*…\s*80)/iu.test(a) &&
    !(/\b0\b/u.test(a) && /\b80\b/u.test(a))
  ) {
    return true;
  }
  if (
    /(?:температур[\p{L}]*\s+(?:помещен|окружающ|эксплуатац)|при\s+какой\s+температур[\p{L}]*\s+помещен)/iu.test(m) &&
    /\b15\b/u.test(a) &&
    !/\b35\b/u.test(a)
  ) {
    return true;
  }
  if (/диспле[^\n]{0,12}\bW\b|символ[^\n]{0,12}\bW\b|на\s+диспле[^\n]{0,12}W/i.test(m) && !/подогрев/i.test(a)) {
    return true;
  }
  if (!isUnverifiedVolumeLiterQueryLazy(m) && /полн[^\n]{0,8}объ[её]м|полный\s+объ/i.test(m) && !/2070|2\s*070|2100|2\s*100/i.test(a)) {
    return true;
  }
  if (
    !isUnverifiedVolumeLiterQueryLazy(m) &&
    /внутренн[^\n]{0,10}объ|рабоч[^\n]{0,8}объ/i.test(m) &&
    /2070|2\s*070|2100|2\s*100/i.test(a) &&
    !/896|1896/i.test(a)
  ) {
    return true;
  }
  if (/двер/i.test(m) && !/\b4\b/.test(a)) {
    return true;
  }
  if (/регенерац/i.test(m) && /мощност|максимальн/i.test(m) && !/540/.test(a)) {
    return true;
  }
  if (/производител|датчик|сенсор|vendor/i.test(m) && /\+?\s*40\s*°?\s*c|подогрев/i.test(a) && !/не\s+указан/i.test(a)) {
    return true;
  }
  if (/\bip\b|пыл|брызг|от\s+воды/i.test(m) && !/ip\s*55|ip55/i.test(a)) {
    return true;
  }
  if (/осушит|блок\s+осуш|36\s*месяц|график\s+обслуж/i.test(m) && !/36/.test(a)) {
    return true;
  }
  if (
    /влажност/iu.test(m) &&
    /(?:резко\s+)?(?:вырос|повыс|поднял)/iu.test(m) &&
    /загруз/iu.test(m) &&
    !/1\.1\.4\.4\.1|вентилятор|открыт|60\s*±/iu.test(a)
  ) {
    return true;
  }
  if (
    /влажност/iu.test(m) &&
    /(?:резко\s+)?(?:вырос|повыс|поднял)/iu.test(m) &&
    (/можно\s+предполож|нет\s+прямого\s+ответа|в\s+общем\s+случае/i.test(a) ||
      (!/1\.1\.4\.4\.1|вентилятор|открыт[\p{L}]*\s+двер|60\s*±/iu.test(a) &&
        /уплотнител|неисправност|можно\s+предполож/i.test(a)))
  ) {
    return true;
  }
  if (
    /пищ|звуков\s+сигнал|почему.*шкаф/i.test(m) &&
    (/возможные\s+причин|неисправност\w*\s+вентилятор|засорен\w*\s+фильтр|общ(?:их|ие)\s+принцип|нет\s+конкретных\s+данных/i.test(
      a,
    ) &&
      !/1\.1\.4\.3\.4|открыт[\p{L}]*\s+двер|штат|норм/i.test(a))
  ) {
    return true;
  }
  if (/таймер\s+подач|n2ton|99[,.]9|азот.*(?:минут|таймер)/i.test(m) && !/99/.test(a)) {
    return true;
  }
  if (
    /(?:масс|вес|килограм|тяж|кран|вдво|какой\s+вес|сколько\s+весит|какая\s+масса)/iu.test(m) &&
    !/полк|нагрузк|на\s+полк/i.test(m)
  ) {
    if (!/\b260\b/.test(a) && /\b\d{2,4}\s*кг/i.test(a)) {
      return true;
    }
    if (/\b156\s*кг/i.test(a) && /sdb\s*1560|1560\s*m/i.test(`${m}\n${a}`)) {
      return true;
    }
  }
  if (/ухл|климат/i.test(m) && !/ухл/i.test(a) && !/регенерац/i.test(m)) {
    return true;
  }
  if (
    /слом|замен|что\s+делать/i.test(m) &&
    /уточните|какая\s+именно\s+проблем|какие\s+признак/i.test(a) &&
    !/техподдерж|800\s*\(\s*800|нет\s+инструкц/i.test(a)
  ) {
    return true;
  }
  return false;
}

function ragPureSdb1560NeedsFactRetry(message, answer, intent, retrievalContext) {
  if (!contextHasSdb1560AnswerableData(retrievalContext)) {
    return false;
  }
  const a = String(answer || "").trim();
  if (!a || isSpuriousModelAbstainAnswer(a) || /параметр не указан/i.test(a)) {
    return true;
  }
  if (ragPureSdb1560AnswerOffTopic(message, answer)) {
    return true;
  }
  if (isNumericTtxRetrievalQuery(message, intent) && !ragPureSdb1560AnswerLooksOnTopic(message, answer)) {
    return true;
  }
  return false;
}

function isSpuriousModelAbstainAnswer(answer) {
  const a = String(answer || "").trim();
  const strictAbstain = "Информация отсутствует в документации.";
  if (!a || a === strictAbstain) {
    return false;
  }
  if (a.length > 320 && (a.match(/[.!?…]/g) || []).length >= 5) {
    return false;
  }
  return (
    /параметр не указан|информац(?:ия|ии)\s+.*отсутств|контекст не (?:предостав|содержит)|контекст\s+не\s+предоставляет|в\s+предоставленном\s+контексте|в\s+данном\s+контексте\s+информации|не\s+содержит\s+информации|не\s+указан\w*|не\s+(?:указано|предоставлен\w*)\s+в\s+(?:предоставленном\s+)?(?:контекст|фрагмент)|нет\s+(?:конкретной\s+)?информации|в\s+контексте\s+нет|невозможно\s+(?:точно\s+)?(?:ответить|определить|сказать)|рекомендуется\s+обратиться|необходимо\s+обратиться|дополнительн[\p{L}]*\s+информац|для\s+точного\s+определен|вероятнее\s+всего|дополнительным\s+руководствам|производител\w*\s+для\s+получения|на\s+основе\s+доступной\s+информации|этот\s+параметр\s+не\s+указан|можно\s+предполож|в\s+общем\s+случае|нет\s+прямого\s+ответа/i.test(
      a,
    )
  );
}

function shouldDeferGuardrailsToPostGate(equipmentProfile, equipmentId) {
  if (!equipmentProfile?.deferGuardrailsToPostGate) {
    return false;
  }
  return true;
}

function shouldAutoDirectWhenNoPostgres(equipmentProfile, equipmentId) {
  if (!equipmentProfile?.autoDirectWhenNoPostgres) {
    return false;
  }
  if (shouldUseHonestRag(equipmentId)) {
    return false;
  }
  return true;
}

/** Числовые ТТХ / single-field: retrieval-cards не должны доминировать над PDF/таблицами. */
function isNumericTtxRetrievalQuery(query, intent) {
  const intentType = intent?.intentType;
  if (intentType === "SINGLE_FIELD_QUERY" || intentType === "QUICK_FACT_QUERY") {
    return true;
  }
  const fp = intent?.focusParameter;
  if (
    fp &&
    [
      "kit_shelf_count",
      "internal_volume",
      "full_volume",
      "dimensions",
      "voltage",
      "frequency",
      "humidity",
      "load",
      "pressure",
      "protection",
      "temperature",
      "grounding_resistance",
      "nitrogen",
      "power_storage",
      "power_regen",
    ].includes(fp)
  ) {
    return true;
  }
  const q = String(query || "");
  return /(?:сколько\s+полок|количеств\w*\s+полок|полок\s+в\s+комплект|объ[её]м|масс|вес|габарит|мощност|питани|частот|напряжен|шаг\s+влаж|диапазон\s+влаж|класс\s+защиты|\bip\b|\bip\s*\d|степень\s+защиты|от\s+воды|пыл|брызг|блок\s+осуш|осушит|график\s+обслуж|n2ton|таймер[^\n]{0,20}азот|азот[^\n]{0,24}без\s+датчик|99[,.]9|тяж|кран|вдво|полный\s+объ|регенерац|давлен.*азот)/iu.test(
    q,
  );
}

/** Honest 1560: skip retrieval-cards только для «голых» spec-чисел, не SET/дверь/режимы. */
function isHonestNumericSpecOnlyQuery(query, intent) {
  const intentType = intent?.intentType;
  if (intentType === "PROCEDURE_QUERY" || intentType === "CONFIGURATION_QUERY") {
    return false;
  }
  const q = String(query || "");
  if (
    /задать\s+порог|выставить.*влажност|как\s+открыть\s+двер|какие\s+режим|что\s+показывает\s+диспл/i.test(
      q,
    )
  ) {
    return false;
  }
  return isNumericTtxRetrievalQuery(query, intent);
}

function shouldSkipRetrievalCardsForHonest1560(equipmentId, query, intent, honestRag) {
  void honestRag;
  if (!shouldUseHonestRag(equipmentId)) {
    return false;
  }
  return isHonestNumericSpecOnlyQuery(query, intent);
}

module.exports = {
  parseHonestEquipmentIds,
  shouldUseHonestRag,
  isRagPureEnabled,
  shouldUseRagPure,
  contextHasSdb1560ManualPdf,
  contextHasSdb1560AnswerableData,
  filterFusedChunksForRagPure,
  prioritizeSdb1560PurePromptChunks,
  ragPureSdb1560AnswerLooksOnTopic,
  ragPureSdb1560AnswerOffTopic,
  ragPureSdb1560NeedsFactRetry,
  isSpuriousModelAbstainAnswer,
  shouldDeferGuardrailsToPostGate,
  shouldAutoDirectWhenNoPostgres,
  isNumericTtxRetrievalQuery,
  isHonestNumericSpecOnlyQuery,
  shouldSkipRetrievalCardsForHonest1560,
};

