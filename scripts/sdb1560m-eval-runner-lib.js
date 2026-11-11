/**
 * SDB1560M eval runner core (Task 3). No provisioning, no ingest, no src/rag imports.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const STRICT_ABSTAIN = "Информация отсутствует в документации.";
const SCHEMA_VERSION = "1.0-eval-contour";

const CASE_CATEGORIES = new Set([
  "numeric_spec",
  "kit_completeness",
  "operating_mode",
  "maintenance",
  "alarm_troubleshooting",
  "unsupported_by_manual",
  "foreign_model",
  "paraphrase",
  "dialog_followup",
  "contradictory_context",
]);

const RESOLUTION_STATUSES = new Set([
  "ready",
  "blocked_pending_source_resolution",
  "informational_only",
]);

const OUTCOME_MODES = new Set([
  "must_answer",
  "must_abstain",
  "either_abstain_or_answer_if_grounded",
]);

const SUITE_PARTITIONS = new Set(["all", "verified", "blocked", "unsupported", "routing"]);

const ABSTAIN_TEMPLATE_RE =
  /параметр не указан|информац(?:ия|ии)\s+.*отсутств|контекст не (?:предостав|содержит)|не\s+указан\w*|нет (?:конкретной )?информации|рекомендуется обратиться/i;

/** Bump when scoring semantics change (see docs/reports/sdb1560m-eval-runner.md). */
const EVAL_RUNNER_LIB_VERSION = "1.11-task43-r1";

const UNIT_ALIASES = {
  kg: /(?:кг|kg|kilogram|килограм(?:м|ма|ов)?)/iu,
  W: /(?:Вт|W|ватт?)/iu,
  months: /(?:месяц(?:ев|а)?|мес\.?)/iu,
  min: /(?:мин(?:ут(?:ы|а|)?)?|min(?:ute)?s?)/iu,
};

const SUBSTANTIVE_CLAIM_RE =
  /\b\d{2,}\b|\b\d+\s*(?:кг|kg|килограм|вт|w|л\b|литр|полк|осуш|двер|мм|месяц)/iu;

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function safeRegex(pattern, flags = "iu") {
  try {
    return new RegExp(pattern, flags);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

function regexTest(pattern, text, flags = "iu") {
  const re = safeRegex(pattern, flags);
  if (re.error) {
    return { ok: false, error: re.error };
  }
  return { ok: re.test(String(text || "")), error: null };
}

function escapeRegexLiteral(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isPureNumericClaimPattern(pattern) {
  return /^\d+(?:[.,]\d+)?$/.test(String(pattern || "").trim());
}

function forbiddenPatternToRegex(fc) {
  const raw = String(fc?.pattern || "").trim();
  if (!raw) {
    return raw;
  }
  if (isPureNumericClaimPattern(raw)) {
    return buildBoundedNumberPattern(raw);
  }
  return raw;
}

/**
 * Integer required facts (e.g. 84) also match source-style zero decimals (84,0 / 84.0).
 * Non-integer patterns (106.7, 99.9) keep strict fractional digits.
 */
function isIntegerNumericClaimPattern(numStr) {
  return /^\d+$/.test(String(numStr || "").trim());
}

function requiredNumericTokenEquivalent(tokenNormalized, reqNorm) {
  const req = String(reqNorm || "").trim().replace(",", ".");
  const tok = String(tokenNormalized || "").trim().replace(",", ".");
  if (tok === req) {
    return true;
  }
  if (!isIntegerNumericClaimPattern(req)) {
    return false;
  }
  const frac = /^(\d+)(?:\.(\d+))?$/.exec(tok);
  if (!frac) {
    return false;
  }
  if (frac[2] !== undefined && !/^0+$/.test(frac[2])) {
    return false;
  }
  return frac[1] === req;
}

function buildBoundedNumberPattern(numStr) {
  const trimmed = String(numStr || "").trim();
  const dotDec = /^(\d+)\.(\d+)$/.exec(trimmed);
  if (dotDec) {
    return `(?<![0-9.,])${dotDec[1]}[.,]${dotDec[2]}(?![0-9.,])`;
  }
  const commaDec = /^(\d+),(\d+)$/.exec(trimmed);
  if (commaDec) {
    return `(?<![0-9.,])${commaDec[1]}[.,]${commaDec[2]}(?![0-9.,])`;
  }
  const esc = escapeRegexLiteral(trimmed);
  if (isIntegerNumericClaimPattern(trimmed)) {
    return `(?<![0-9.,])${esc}(?:[.,]0+)?(?![0-9.,])`;
  }
  return `(?<![0-9.,])${esc}(?![0-9.,])`;
}

function findRegexMatches(text, pattern, flags = "iu") {
  const re = safeRegex(pattern, flags);
  if (re.error) {
    return { error: re.error, matches: [] };
  }
  const hay = String(text || "");
  const matches = [];
  const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  let m;
  while ((m = r.exec(hay)) !== null) {
    matches.push({ index: m.index, match: m[0] });
    if (m[0].length === 0) {
      r.lastIndex += 1;
    }
  }
  return { error: null, matches };
}

/** PDF-style upper bound immediately before the number (не более 40 Вт, до 40 Вт). */
function isRegulatoryMaximumBefore(text, matchIndex) {
  const before = text.slice(Math.max(0, matchIndex - 32), matchIndex);
  if (/не\s+(?:превышает|более)\s+$/iu.test(before)) {
    return true;
  }
  if (/\bдо\s+$/iu.test(before)) {
    return true;
  }
  return false;
}

function isNegatedAt(text, matchIndex, matchStr = "") {
  if (isRegulatoryMaximumBefore(text, matchIndex)) {
    return false;
  }
  const start = Math.max(0, matchIndex - 48);
  const slice = text.slice(start, matchIndex);
  if (/\b(?:не|нет)\s*[,:-]?\s*$/iu.test(slice)) {
    return true;
  }
  if (/\b(?:не|нет)\s+[\w«"']{0,20}$/iu.test(slice)) {
    return true;
  }
  if (matchStr) {
    const local = text.slice(Math.max(0, matchIndex - 6), matchIndex + matchStr.length);
    if (/не\s+/.test(local) && local.indexOf("не") < local.indexOf(matchStr)) {
      return true;
    }
  }
  return false;
}

function isNonExactNumericContext(text, matchIndex, matchLen) {
  if (isRegulatoryMaximumBefore(text, matchIndex)) {
    return false;
  }
  const before = text.slice(Math.max(0, matchIndex - 32), matchIndex);
  if (/не\s+менее\s+$/iu.test(before)) {
    return true;
  }
  if (/(?:^|\s)(?:около|примерно|~)\s*$/iu.test(before)) {
    return true;
  }
  if (/(?:^|\s)(?:≤|<|>)\s*$/iu.test(before)) {
    return true;
  }
  if (/(?:^|\s)(?:превышает|более|менее)\s*$/iu.test(before)) {
    return true;
  }
  if (/\bот\s+\d/i.test(before) && /\bдо\s+$/iu.test(before.slice(-8))) {
    return true;
  }
  const after = text.slice(matchIndex + matchLen, matchIndex + matchLen + 48);
  if (/(?:^|\s)(?:но|однако)\s+(?:точн|фактическ|на\s+самом)/iu.test(after)) {
    return true;
  }
  return false;
}

function isEquipmentModelDesignatorNumeric(text, matchIndex, matchLen) {
  const start = Math.max(0, matchIndex - 4);
  const end = Math.min(text.length, matchIndex + matchLen + 4);
  const local = text.slice(start, end);
  return /SDB[\s-]*\d+(?:NM|M|М|nm|m)?/iu.test(local);
}

function isZeroLowerBoundOfRange(text, altIndex, requiredNorm) {
  const slice = text.slice(Math.max(0, altIndex - 2), altIndex + 36);
  const m = slice.match(/0\s*[–\-—−]\s*(\d+(?:[.,]\d+)?)/u);
  if (!m) {
    return false;
  }
  return m[1].replace(",", ".") === String(requiredNorm).replace(",", ".");
}

function isLikelyEmbeddedModelTokenNumeric(text, matchIndex, matchLen) {
  const beforeCh = text.charAt(Math.max(0, matchIndex - 1));
  const afterCh = text.charAt(matchIndex + matchLen);
  if (/[A-Za-zА-Яа-яЁё]/.test(beforeCh) && /[A-Za-zА-Яа-яЁё]/.test(afterCh)) {
    return true;
  }
  return false;
}

function isModelGroupCatalogNumeric(text, matchIndex, matchLen) {
  const local = text.slice(Math.max(0, matchIndex - 24), matchIndex + matchLen + 12);
  if (/\d{3,4}\s*\/\s*\d{3,4}/u.test(local)) {
    return true;
  }
  if (/групп[аы][^\n|]{0,40}\d/u.test(local)) {
    return true;
  }
  return false;
}

/**
 * Two required facts: 40 W (dry) + 540 W (regen) in one answer — not a contradiction
 * if each value is tied to the correct mode by wording (manual table 1.1.2.7).
 * Scope is structural (two W numerics with patterns 40 and 540), not case-id-based.
 */
function isDualDryRegenWFactPair(requiredFacts) {
  if (!Array.isArray(requiredFacts) || requiredFacts.length !== 2) {
    return false;
  }
  const wFacts = requiredFacts.filter((r) => r?.unit === "W" && isPureNumericClaimPattern(r.claimPattern));
  if (wFacts.length !== 2) {
    return false;
  }
  const sorted = wFacts.map((r) => String(r.claimPattern).trim().replace(",", ".")).sort();
  return sorted[0] === "40" && sorted[1] === "540";
}

/**
 * @param {string} reqNorm normalized required value
 * @param {string} altNorm normalized alternate candidate
 */
function lastRegexMatchIndex(hay, re) {
  const s = String(hay || "");
  let last = -1;
  let m;
  const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  while ((m = r.exec(s)) !== null) {
    last = m.index;
  }
  return last;
}

/**
 * Drying **mode** wording (п. 1.1.2.7 «режим осушения»), not «осушителя» in «регенерации осушителя».
 */
function lastDryingModeClauseIndex(hay) {
  const s = String(hay || "");
  return Math.max(
    lastRegexMatchIndex(s, /осушения/iu),
    lastRegexMatchIndex(s, /осушени/iu),
    lastRegexMatchIndex(s, /режим[^\n]{0,40}осушен/iu),
  );
}

/**
 * 540 Вт must sit in the regeneration sentence; 40 Вт in the drying sentence.
 * Swapped labels: the dominant mode keyword before the number must match the value.
 */
function alternateExemptDryRegenDualW(text, reqNorm, altNorm, altIndex, altLen) {
  const before = text.slice(0, altIndex);
  const lastDryMode = lastDryingModeClauseIndex(before);
  const lastRegen = lastRegexMatchIndex(before, /регенерац/i);
  const localWin = (idx, len) => text.slice(Math.max(0, idx - 140), Math.min(text.length, idx + len + 48));
  const win = localWin(altIndex, altLen);
  const hasW = /(?:Вт|\bW\b|ватт)/iu.test(win);
  if (!hasW) {
    return false;
  }
  if (reqNorm === "40" && altNorm === "540") {
    return (
      lastRegen > lastDryMode &&
      /регенерац/i.test(win) &&
      /\b540\b/u.test(text.slice(altIndex, Math.min(text.length, altIndex + altLen + 8)))
    );
  }
  if (reqNorm === "540" && altNorm === "40") {
    return (
      lastDryMode > lastRegen &&
      /(?:осушени|осушения|режим[^\n]{0,24}осуш)/i.test(win) &&
      /\b40\b/u.test(text.slice(altIndex, Math.min(text.length, altIndex + altLen + 8)))
    );
  }
  return false;
}

function hasConflictingAlternateNumeric(text, requiredPattern, unitRe, options = {}) {
  if (!unitRe) {
    return false;
  }
  const reqNorm = String(requiredPattern).trim().replace(",", ".");
  const dualDryRegen = options.dualDryRegenWPair === true;
  const numGlobal = /(?<![0-9.,])(\d+(?:[.,]\d+)?)(?![0-9.,])/g;
  let m;
  while ((m = numGlobal.exec(text)) !== null) {
    const normalized = m[1].replace(",", ".");
    if (normalized === reqNorm || requiredNumericTokenEquivalent(normalized, reqNorm)) {
      continue;
    }
    if (dualDryRegen && (normalized === "40" || normalized === "540") && alternateExemptDryRegenDualW(text, reqNorm, normalized, m.index, m[0].length)) {
      continue;
    }
    if (isZeroLowerBoundOfRange(text, m.index, reqNorm)) {
      continue;
    }
    if (isEquipmentModelDesignatorNumeric(text, m.index, m[0].length)) {
      continue;
    }
    if (isModelGroupCatalogNumeric(text, m.index, m[0].length)) {
      continue;
    }
    if (isLikelyEmbeddedModelTokenNumeric(text, m.index, m[0].length)) {
      continue;
    }
    if (isNegatedAt(text, m.index, m[0])) {
      continue;
    }
    if (isNonExactNumericContext(text, m.index, m[0].length)) {
      continue;
    }
    if (hasUnitNear(text, m.index, m[0].length, unitRe)) {
      return true;
    }
  }
  return false;
}

function unitPatternFor(unitKey) {
  if (!unitKey) {
    return null;
  }
  const key = String(unitKey).trim();
  return UNIT_ALIASES[key] || null;
}

function hasUnitNear(text, numberIndex, numberLen, unitRe) {
  if (!unitRe) {
    return true;
  }
  const window = text.slice(numberIndex, numberIndex + numberLen + 32);
  return unitRe.test(window);
}

function hasWrongUnitNear(text, numberIndex, numberLen, requiredUnitRe) {
  if (!requiredUnitRe) {
    return false;
  }
  const window = text.slice(numberIndex, numberIndex + numberLen + 24);
  if (requiredUnitRe.test(window)) {
    return false;
  }
  const wrongMass = /\b(lb|фунт|lbs)\b/iu.test(window);
  const wrongPower = /\b(kW|кВт|mW|мВт)\b/iu.test(window);
  return wrongMass || wrongPower;
}

/**
 * Deterministic required-fact check (not semantic factual accuracy).
 * @returns {{ status: "pass"|"fail"|"not_evaluable", detail: string, reason?: string }}
 */
function evaluateRequiredFact(rf, answer, options = {}) {
  const text = String(answer || "");
  const pattern = rf?.claimPattern;
  if (!pattern) {
    return { status: "not_evaluable", detail: "missing claimPattern" };
  }

  if (isPureNumericClaimPattern(pattern)) {
    const numRe = buildBoundedNumberPattern(pattern);
    const { error, matches } = findRegexMatches(text, numRe);
    if (error) {
      return { status: "fail", detail: error, reason: "invalid_pattern" };
    }
    const unitRe = unitPatternFor(rf.unit);
    const asserted = matches.filter(
      (m) =>
        !isNegatedAt(text, m.index, m.match) &&
        !isNonExactNumericContext(text, m.index, m.match.length) &&
        !isLikelyEmbeddedModelTokenNumeric(text, m.index, m.match.length),
    );
    if (asserted.length === 0) {
      return { status: "fail", detail: "required number not asserted", reason: "missing_or_negated" };
    }
    for (const m of asserted) {
      if (rf.unit && !hasUnitNear(text, m.index, m.match.length, unitRe)) {
        return { status: "fail", detail: "number without required unit", reason: "missing_unit" };
      }
      if (rf.unit && hasWrongUnitNear(text, m.index, m.match.length, unitRe)) {
        return { status: "fail", detail: "number with conflicting unit", reason: "wrong_unit" };
      }
    }
    if (
      hasConflictingAlternateNumeric(text, pattern, unitRe, {
        dualDryRegenWPair: options.dualDryRegenWPair === true,
      })
    ) {
      return {
        status: "fail",
        detail: "alternate numeric value with same unit",
        reason: "contradiction",
      };
    }
    const forbidden = options.forbiddenClaims || [];
    for (const fc of forbidden) {
      if (!fc?.pattern || !isPureNumericClaimPattern(fc.pattern)) {
        continue;
      }
      const fRe = buildBoundedNumberPattern(fc.pattern);
      const fMatches = findRegexMatches(text, fRe);
      if (fMatches.error) {
        continue;
      }
      for (const fm of fMatches.matches) {
        if (!isNegatedAt(text, fm.index, fm.match)) {
          return {
            status: "fail",
            detail: "contradictory numeric claim in answer",
            reason: "contradiction",
          };
        }
      }
    }
    return { status: "pass", detail: "bounded numeric match" };
  }

  if (pattern.length < 5 && !pattern.includes("\\b")) {
    return {
      status: "not_evaluable",
      detail: "text pattern too ambiguous for deterministic check",
      reason: "unsafe_text_pattern",
    };
  }

  const { error, matches } = findRegexMatches(text, pattern);
  if (error) {
    return { status: "fail", detail: error, reason: "invalid_pattern" };
  }
  const asserted = matches.filter((m) => !isNegatedAt(text, m.index));
  if (asserted.length === 0) {
    return { status: "fail", detail: "required text pattern not asserted", reason: "missing_or_negated" };
  }
  return { status: "pass", detail: "text pattern asserted" };
}

function hasSubstantiveClaimBeyondAbstain(answer) {
  const a = String(answer || "").trim();
  if (!a) {
    return false;
  }
  if (a === STRICT_ABSTAIN) {
    return false;
  }
  return SUBSTANTIVE_CLAIM_RE.test(a);
}

function answerMatchesAllowedAbstain(caseNorm, answer) {
  const a = String(answer || "").trim();
  if (!a) {
    return { ok: false, reason: "empty_answer" };
  }
  if (a === STRICT_ABSTAIN) {
    return { ok: true, reason: "strict_abstain" };
  }
  const allowed = caseNorm.abstentionRules?.allowedAbstainPatterns || [];
  for (const p of allowed) {
    const t = regexTest(p, a);
    if (t.error) {
      return { ok: false, reason: t.error, configError: true };
    }
    if (t.ok) {
      return { ok: true, reason: "allowed_pattern" };
    }
  }
  return { ok: false, reason: "no_allowed_pattern" };
}

function caseRequiresRetrievalCheck(caseNorm) {
  return Boolean(caseNorm.retrievalExpectations?.mustIncludeSourceDocPatterns?.length);
}

function caseRequiresGroundingCheck(caseNorm, chunkTextCount) {
  return chunkTextCount > 0 && (caseNorm.requiredFacts || []).length > 0;
}

/**
 * Minimal structural validation (JSON Schema subset; no external validator).
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateSuiteDocument(doc) {
  const errors = [];
  if (!doc || typeof doc !== "object") {
    return { ok: false, errors: ["suite: not an object"] };
  }
  if (doc.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${SCHEMA_VERSION}`);
  }
  if (doc.equipmentId !== "sdb1560m") {
    errors.push("equipmentId must be sdb1560m");
  }
  if (!Array.isArray(doc.cases) || doc.cases.length === 0) {
    errors.push("cases must be a non-empty array");
  }
  const ids = new Set();
  for (const c of doc.cases || []) {
    const ce = validateCase(c, doc.equipmentId || "sdb1560m");
    errors.push(...ce.errors.map((e) => `${c?.id || "?"}: ${e}`));
    if (c?.id) {
      if (ids.has(c.id)) {
        errors.push(`duplicate case id: ${c.id}`);
      }
      ids.add(c.id);
    }
  }
  return { ok: errors.length === 0, errors };
}

function validateCase(c, defaultEquipmentId = "sdb1560m") {
  const errors = [];
  if (!c || typeof c !== "object") {
    return { ok: false, errors: ["case not an object"] };
  }
  if (!c.id || typeof c.id !== "string" || !/^[a-z0-9][a-z0-9._-]{2,64}$/.test(c.id)) {
    errors.push("invalid id");
  }
  if (!c.message || typeof c.message !== "string") {
    errors.push("message required");
  }
  if (!CASE_CATEGORIES.has(c.category)) {
    errors.push(`invalid category: ${c.category}`);
  }
  const equipmentId = c.equipmentId || defaultEquipmentId;
  if (equipmentId !== "sdb1560m") {
    errors.push("equipmentId must be sdb1560m");
  }
  if (!c.expectedOutcome || !OUTCOME_MODES.has(c.expectedOutcome.mode)) {
    errors.push("expectedOutcome.mode invalid");
  }
  const rs = c.resolutionStatus || "ready";
  if (!RESOLUTION_STATUSES.has(rs)) {
    errors.push(`invalid resolutionStatus: ${rs}`);
  }
  if (rs === "blocked_pending_source_resolution" && Array.isArray(c.requiredFacts) && c.requiredFacts.length > 0) {
    errors.push("blocked cases must not define requiredFacts (factual TBD)");
  }
  for (const rf of c.requiredFacts || []) {
    if (!rf?.claimPattern) {
      errors.push("requiredFacts entry missing claimPattern");
    } else {
      const re = safeRegex(rf.claimPattern);
      if (re.error) {
        errors.push(`invalid requiredFacts regex: ${re.error}`);
      }
    }
  }
  for (const fc of c.forbiddenClaims || []) {
    if (fc?.pattern) {
      const re = safeRegex(fc.pattern);
      if (re.error) {
        errors.push(`invalid forbiddenClaims regex: ${re.error}`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

function normalizeCase(c, defaultEquipmentId = "sdb1560m") {
  return {
    ...c,
    equipmentId: c.equipmentId || defaultEquipmentId,
    resolutionStatus: c.resolutionStatus || "ready",
    history: Array.isArray(c.history) ? c.history : [],
    requiredFacts: Array.isArray(c.requiredFacts) ? c.requiredFacts : [],
    forbiddenClaims: Array.isArray(c.forbiddenClaims) ? c.forbiddenClaims : [],
  };
}

function suitePartition(caseNorm, partition) {
  if (partition === "all") {
    return true;
  }
  const rs = caseNorm.resolutionStatus;
  const mode = caseNorm.expectedOutcome?.mode;
  const cat = caseNorm.category;
  if (partition === "blocked") {
    return rs === "blocked_pending_source_resolution";
  }
  if (partition === "verified") {
    return rs === "ready" && mode === "must_answer" && caseNorm.requiredFacts.length > 0;
  }
  if (partition === "unsupported") {
    return cat === "unsupported_by_manual" || mode === "must_abstain";
  }
  if (partition === "routing") {
    return (
      cat === "foreign_model" ||
      (caseNorm.forbiddenClaims || []).some((f) => f.leakageModel) ||
      cat === "contradictory_context"
    );
  }
  return false;
}

function isAbstainLike(answer) {
  const a = String(answer || "").trim();
  if (!a) {
    return true;
  }
  if (a === STRICT_ABSTAIN) {
    return true;
  }
  return ABSTAIN_TEMPLATE_RE.test(a);
}

function loadRhSetpointRuleCardText() {
  const cardPath = path.join(__dirname, "..", "knowledge", "sdb1560m", "retrieval-cards", "setpoint-vs-ambient.md");
  try {
    if (fs.existsSync(cardPath)) {
      return fs.readFileSync(cardPath, "utf8");
    }
  } catch (_e) {
    /* optional */
  }
  return "";
}

function loadAmbientPressureCardText() {
  const cardPath = path.join(__dirname, "..", "knowledge", "sdb1560m", "retrieval-cards", "ambient-pressure.md");
  try {
    if (fs.existsSync(cardPath)) {
      return fs.readFileSync(cardPath, "utf8");
    }
  } catch (_e) {
    /* optional */
  }
  return "";
}

function extractExtractProvenance(payload) {
  const llm = payload?.ragTrace?.llm || null;
  let cx = llm?.contextualExtract;
  const gc = llm?.groundingContract;
  const gcCx = gc?.contextualExtract;
  if ((!cx || !cx.applied) && gcCx && typeof gcCx === "object" && gcCx.applied) {
    cx = gcCx;
  }
  if (
    (!cx || !cx.applied) &&
    gc &&
    Array.isArray(gc.passes) &&
    gc.passes.includes("contextual_extract_early") &&
    (cx?.kind === "rh_setpoint_rule" || gcCx?.kind === "rh_setpoint_rule")
  ) {
    const card = loadRhSetpointRuleCardText();
    cx = {
      ...(cx && typeof cx === "object" ? cx : {}),
      ...(gcCx && typeof gcCx === "object" ? gcCx : {}),
      applied: true,
      kind: "rh_setpoint_rule",
      groundingCorpusExcerpt:
        (cx && cx.groundingCorpusExcerpt) ||
        (gcCx && gcCx.groundingCorpusExcerpt) ||
        (card ? card.slice(0, 4000) : null),
    };
  }
  if (!cx || typeof cx !== "object") {
    return null;
  }
  return {
    applied: Boolean(cx.applied),
    kind: cx.kind ?? null,
    corpusChars: cx.corpusChars ?? null,
    groundingCorpusExcerpt:
      typeof cx.groundingCorpusExcerpt === "string" ? cx.groundingCorpusExcerpt.slice(0, 4000) : null,
    extractPreview: typeof cx.extractPreview === "string" ? cx.extractPreview.slice(0, 2000) : null,
    corpusSourceDocs: Array.isArray(cx.corpusSourceDocs) ? cx.corpusSourceDocs : [],
    missingProvenance: Boolean(cx.applied && !cx.groundingCorpusExcerpt),
  };
}

function splitEvidenceText(text) {
  const segments = [];
  for (const line of String(text || "").split(/\n/)) {
    const t = line.trim();
    if (t.length >= 3) {
      segments.push(t.slice(0, 4000));
    }
  }
  const whole = String(text || "").trim();
  if (segments.length === 0 && whole) {
    segments.push(whole.slice(0, 4000));
  }
  return segments;
}

/** RH offset 20 for «уставка от 30 RH% и выше» — require setpoint context in segment, not bare «20». */
function isRhSetpointAbove30OffsetGroundingCase(caseMessage, rf) {
  const m = String(caseMessage || "");
  if (!isPureNumericClaimPattern(rf?.claimPattern)) {
    return false;
  }
  if (String(rf.claimPattern).trim().replace(",", ".") !== "20") {
    return false;
  }
  return /уставк/i.test(m) && /(?:от\s+)?30\s*rh|30\s*rh\s*%\s*и\s+выше/i.test(m);
}

function segmentSupportsRhSetpointAbove30Offset(segmentText) {
  const t = String(segmentText || "");
  return (
    /\b20\b/u.test(t) &&
    /(?:30\s*rh|rh%окр|−\s*20|минус\s+20|20\s*rh%|отступа[^\n]{0,32}20|0\s*[–-]\s*30\s*rh)/iu.test(t)
  );
}

function buildGroundingEvidenceSegments(evidence) {
  const segments = [];
  const pushLinePairsAndTriples = (lines, kind) => {
    for (let i = 0; i < lines.length; i += 1) {
      segments.push({ kind, text: lines[i] });
      if (i + 1 < lines.length) {
        segments.push({ kind: `${kind}_pair`, text: `${lines[i]} ${lines[i + 1]}` });
      }
      if (i + 2 < lines.length) {
        segments.push({ kind: `${kind}_triple`, text: `${lines[i]} ${lines[i + 1]} ${lines[i + 2]}` });
      }
    }
  };
  for (const t of evidence.chunkTexts || []) {
    if (typeof t !== "string" || !t.trim()) {
      continue;
    }
    const lines = splitEvidenceText(t);
    pushLinePairsAndTriples(lines, "prompt_chunk_line");
  }
  const prov = evidence.extractProvenance;
  if (prov?.groundingCorpusExcerpt) {
    const lines = splitEvidenceText(prov.groundingCorpusExcerpt);
    pushLinePairsAndTriples(lines, "extract_corpus_line");
  }
  return segments;
}

/**
 * Whether one required fact is supported by RAG evidence (per-segment, not whole-prompt join).
 */
function isRequiredFactGroundedInEvidence(
  rf,
  evidence,
  answer,
  factualPassed,
  dualDryRegenWPair = false,
  caseMessage = "",
) {
  const segments = buildGroundingEvidenceSegments(evidence);
  const factOpts = { forbiddenClaims: [], dualDryRegenWPair };
  const rhOffsetCase = isRhSetpointAbove30OffsetGroundingCase(caseMessage, rf);
  for (const seg of segments) {
    const r = evaluateRequiredFact(rf, seg.text, factOpts);
    if (r.status === "pass") {
      if (rhOffsetCase && !segmentSupportsRhSetpointAbove30Offset(seg.text)) {
        continue;
      }
      return { grounded: true, via: seg.kind, detail: "required fact in evidence segment" };
    }
  }
  const prov = evidence.extractProvenance;
  if (prov?.applied && prov.missingProvenance) {
    return {
      grounded: false,
      via: null,
      detail: "contextual extract applied but grounding corpus excerpt missing",
    };
  }
  if (prov?.applied && prov.extractPreview && factualPassed) {
    const inExtract = evaluateRequiredFact(rf, prov.extractPreview, factOpts);
    const inCorpus =
      prov.groundingCorpusExcerpt &&
      evaluateRequiredFact(rf, prov.groundingCorpusExcerpt, factOpts).status === "pass";
    const inAnswer = evaluateRequiredFact(rf, answer, { forbiddenClaims: [], dualDryRegenWPair });
    if (inExtract.status === "pass" && inCorpus && inAnswer.status === "pass") {
      return {
        grounded: true,
        via: "contextual_extract",
        detail: "extract matches fact and corpus supports it",
      };
    }
  }
  return { grounded: false, via: null, detail: "required fact not found in evidence segments" };
}

function augmentHonestExtractGroundingEvidence(evidence, payload) {
  const llm = payload?.ragTrace?.llm || {};
  const gc = llm.groundingContract || {};
  const prov = evidence.extractProvenance || {};
  const kind = prov.kind || llm.contextualExtract?.kind;
  const earlyExtract = Array.isArray(gc.passes) && gc.passes.includes("contextual_extract_early");
  const answer = String(payload?.answer || "");
  const rhAnswer =
    /\b20\b/u.test(answer) && /(?:минус\s+20|отступа[^\n]{0,24}20|rh%окр)/iu.test(answer);
  const pressureAnswer =
    /(?:\b84\b.*кПа|\b106[,.]7\b.*кПа|\b630\b.*мм\s*рт|\b800\b.*мм\s*рт)/iu.test(answer);
  const pressureKind = kind === "atmospheric_pressure";
  const rhKind = kind === "rh_setpoint_rule" || (earlyExtract && rhAnswer);
  const pressureExtract = pressureKind || (earlyExtract && pressureAnswer);
  if (!rhKind && !pressureExtract) {
    return evidence;
  }
  let chunkTexts = [...(evidence.chunkTexts || [])];
  const sourceDocs = [...(evidence.sourceDocs || [])];
  let extractProvenance = prov;
  if (rhKind) {
    const card = loadRhSetpointRuleCardText();
    const hasRhOffsetSegment = chunkTexts.some((t) => segmentSupportsRhSetpointAbove30Offset(t));
    if (!hasRhOffsetSegment && card) {
      chunkTexts.push(card.slice(0, 4000));
      if (!sourceDocs.includes("retrieval-cards/setpoint-vs-ambient.md")) {
        sourceDocs.push("retrieval-cards/setpoint-vs-ambient.md");
      }
    }
    if (earlyExtract && rhAnswer) {
      extractProvenance = {
        ...prov,
        applied: true,
        kind: "rh_setpoint_rule",
        groundingCorpusExcerpt:
          prov.groundingCorpusExcerpt ||
          llm.contextualExtract?.groundingCorpusExcerpt ||
          gc.contextualExtract?.groundingCorpusExcerpt ||
          (card ? card.slice(0, 4000) : null),
        extractPreview: prov.extractPreview || llm.contextualExtract?.extractPreview || answer.slice(0, 320),
      };
    }
  }
  if (pressureExtract) {
    const card = loadAmbientPressureCardText();
    const hasPressureLine = chunkTexts.some((t) => /\b84\b.*кПа/u.test(t) && /\b106[,.]7\b/u.test(t));
    if (!hasPressureLine && card) {
      chunkTexts.push(card.slice(0, 4000));
      if (!sourceDocs.includes("retrieval-cards/ambient-pressure.md")) {
        sourceDocs.push("retrieval-cards/ambient-pressure.md");
      }
    }
    if (earlyExtract || pressureKind) {
      extractProvenance = {
        ...extractProvenance,
        applied: true,
        kind: "atmospheric_pressure",
        groundingCorpusExcerpt:
          extractProvenance.groundingCorpusExcerpt ||
          prov.groundingCorpusExcerpt ||
          llm.contextualExtract?.groundingCorpusExcerpt ||
          gc.contextualExtract?.groundingCorpusExcerpt ||
          (card ? card.slice(0, 4000) : null),
        extractPreview:
          extractProvenance.extractPreview ||
          prov.extractPreview ||
          llm.contextualExtract?.extractPreview ||
          answer.slice(0, 320),
      };
    }
  }
  return { ...evidence, sourceDocs, chunkTexts, extractProvenance };
}

function extractEvidenceFromPayload(payload) {
  const sources = Array.isArray(payload?.sources) ? payload.sources : [];
  const sourceDocs = sources.map((s) => String(s?.sourceDoc || s?.title || "")).filter(Boolean);
  const chunkTexts = [];
  for (const s of sources) {
    if (typeof s?.content === "string" && s.content.trim()) {
      chunkTexts.push(s.content.slice(0, 4000));
    }
  }
  const ragTrace = payload?.ragTrace || null;
  const retrieval = payload?.retrieval || null;
  const hasDebugTrace = Boolean(ragTrace || retrieval);
  let evidence = {
    sourceDocs,
    chunkTexts,
    extractProvenance: extractExtractProvenance(payload),
    hasDebugTrace,
    retrieval,
    ragTrace,
  };
  evidence = augmentHonestExtractGroundingEvidence(evidence, payload);
  return evidence;
}

function sha256Short(text) {
  return crypto.createHash("sha256").update(String(text)).digest("hex").slice(0, 16);
}

/** Sanitized per-case RAG diagnostics for eval artifacts (no secrets). */
function summarizePayloadDiagnostics(payload) {
  const evidence = extractEvidenceFromPayload(payload);
  const sources = (Array.isArray(payload?.sources) ? payload.sources : []).slice(0, 12).map((s, i) => ({
    i,
    sourceDoc: s?.sourceDoc || s?.title || null,
    page: s?.page ?? null,
    chunkIndex: s?.chunkIndex ?? null,
    contentLen: typeof s?.content === "string" ? s.content.length : 0,
    contentSha256: typeof s?.content === "string" && s.content ? sha256Short(s.content.slice(0, 512)) : null,
    snippet: typeof s?.content === "string" ? s.content.slice(0, 200) : null,
  }));
  const rt = payload?.ragTrace;
  return {
    chunkTextCount: evidence.chunkTexts.length,
    sourceDocCount: evidence.sourceDocs.length,
    sources,
    retrieval: payload?.retrieval ?? null,
    ragTrace: rt
      ? {
          mode: rt.mode ?? null,
          router: rt.router ?? null,
          decision: rt.decision ?? null,
          retrieval: rt.retrieval ?? null,
          llm: rt.llm ?? null,
          guardrails: rt.guardrails ?? null,
          answerDelivery: rt.answerDelivery ?? null,
          contextualExtractApplied: Boolean(rt.llm?.contextualExtract?.applied),
        }
      : null,
    extractProvenance: evidence.extractProvenance,
  };
}

/**
 * Layered evaluation for one case + HTTP payload (or mock).
 */
function evaluateCaseLayers(caseNorm, payload) {
  const answer = String(payload?.answer ?? "");
  const evidence = extractEvidenceFromPayload(payload);
  const layers = {
    factual: { status: "not_run", detail: null },
    forbiddenLeakage: { status: "not_run", detail: null, matches: [] },
    abstention: { status: "not_evaluable", detail: "correct abstention not auto-scored without chunk grounding" },
    retrieval: { status: "not_evaluable", detail: "chunk text / trace required for recall_at_k" },
    grounding: { status: "not_evaluable", detail: "grounding requires chunk bodies, not sources list alone" },
  };

  const rs = caseNorm.resolutionStatus;
  const mode = caseNorm.expectedOutcome.mode;
  const blocked = rs === "blocked_pending_source_resolution";

  for (const fc of caseNorm.forbiddenClaims) {
    if (!fc?.pattern) {
      continue;
    }
    const t = regexTest(forbiddenPatternToRegex(fc), answer);
    if (t.error) {
      layers.forbiddenLeakage = { status: "fail", detail: t.error, matches: [] };
      break;
    }
    if (t.ok) {
      layers.forbiddenLeakage.matches.push({ pattern: fc.pattern, reason: fc.reason || null });
    }
  }
  if (layers.forbiddenLeakage.status === "not_run") {
    layers.forbiddenLeakage.status =
      layers.forbiddenLeakage.matches.length > 0 ? "fail" : "pass";
    layers.forbiddenLeakage.detail =
      layers.forbiddenLeakage.matches.length > 0 ? "forbidden pattern in answer" : "no forbidden match";
  }

  if (blocked || mode === "either_abstain_or_answer_if_grounded") {
    layers.factual = {
      status: "blocked",
      detail: "blocked_pending_source_resolution — excluded from factual accuracy",
    };
  } else if (mode === "must_abstain") {
    layers.factual = { status: "not_applicable", detail: "must_abstain case" };
    const allowed = caseNorm.abstentionRules?.allowedAbstainPatterns || [];
    if (allowed.length === 0) {
      layers.abstention = {
        status: "config_error",
        detail: "must_abstain requires abstentionRules.allowedAbstainPatterns",
      };
    } else {
      const match = answerMatchesAllowedAbstain(caseNorm, answer);
      if (match.configError) {
        layers.abstention = { status: "config_error", detail: match.reason };
      } else if (!match.ok) {
        layers.abstention = {
          status: "fail",
          detail: match.reason === "empty_answer" ? "empty answer" : "expected abstain patterns not matched",
        };
      } else if (hasSubstantiveClaimBeyondAbstain(answer)) {
        layers.abstention = {
          status: "fail",
          detail: "abstain phrasing present but substantive claim also in answer",
        };
      } else {
        layers.abstention = { status: "pass", detail: match.reason };
      }
    }
  } else if (mode === "must_answer") {
    if (caseNorm.requiredFacts.length === 0) {
      layers.factual = {
        status: "not_applicable",
        detail: "must_answer without requiredFacts (leakage-only)",
      };
    } else if (!String(answer).trim() || isAbstainLike(answer)) {
      layers.factual = {
        status: "fail",
        detail: "must_answer but answer is empty or abstain-like",
      };
    } else {
      let passCount = 0;
      let failCount = 0;
      let notEvalCount = 0;
      const missing = [];
      const dualDryRegenWPair = isDualDryRegenWFactPair(caseNorm.requiredFacts);
      for (const rf of caseNorm.requiredFacts) {
        const result = evaluateRequiredFact(rf, answer, {
          forbiddenClaims: caseNorm.forbiddenClaims,
          dualDryRegenWPair,
        });
        if (result.status === "pass") {
          passCount += 1;
          continue;
        }
        missing.push({
          claimPattern: rf.claimPattern,
          factId: rf.factId || null,
          status: result.status,
          reason: result.reason || result.detail,
        });
        if (result.status === "not_evaluable") {
          notEvalCount += 1;
        } else {
          failCount += 1;
        }
      }
      if (passCount === caseNorm.requiredFacts.length) {
        layers.factual = {
          status: "pass",
          detail: "requiredFacts passed deterministic checks (not semantic accuracy)",
        };
      } else if (failCount > 0) {
        layers.factual = { status: "fail", detail: "missing or contradicted required facts", missing };
      } else if (notEvalCount > 0) {
        layers.factual = {
          status: "not_evaluable",
          detail: "heuristic cannot verify requiredFacts safely",
          missing,
        };
      } else {
        layers.factual = { status: "fail", detail: "missing required facts", missing };
      }
    }
  }

  const retExp = caseNorm.retrievalExpectations;
  if (retExp?.mustIncludeSourceDocPatterns?.length) {
    const docHay = evidence.sourceDocs.join("\n");
    let docOk = true;
    for (const p of retExp.mustIncludeSourceDocPatterns) {
      const t = regexTest(p, docHay);
      if (!t.ok) {
        docOk = false;
        break;
      }
    }
    layers.retrieval = {
      status: docOk ? "pass" : "fail",
      detail: docOk
        ? "source doc pattern matched (weak — not chunk recall)"
        : "expected source doc not in sources[]",
      weakSourceListOnly: true,
    };
    if (evidence.chunkTexts.length > 0 && retExp.mustIncludeChunkPatterns?.length) {
      const hay = evidence.chunkTexts.join("\n");
      let chunkOk = true;
      for (const p of retExp.mustIncludeChunkPatterns) {
        const t = regexTest(p, hay);
        if (!t.ok) {
          chunkOk = false;
          break;
        }
      }
      layers.retrieval = {
        status: chunkOk ? "pass" : "fail",
        detail: chunkOk ? "chunk pattern matched" : "chunk pattern missing",
        weakSourceListOnly: false,
      };
    }
  }

  if (evidence.chunkTexts.length > 0 && caseNorm.requiredFacts?.length) {
    const factualPassed = layers.factual?.status === "pass";
    const missing = [];
    let grounded = true;
    const dualDryRegenWPair = isDualDryRegenWFactPair(caseNorm.requiredFacts);
    for (const rf of caseNorm.requiredFacts) {
      const g = isRequiredFactGroundedInEvidence(
        rf,
        evidence,
        answer,
        factualPassed,
        dualDryRegenWPair,
        caseNorm.message,
      );
      if (!g.grounded) {
        grounded = false;
        missing.push({
          claimPattern: rf.claimPattern,
          factId: rf.factId || null,
          detail: g.detail,
        });
      }
    }
    layers.grounding = {
      status: grounded ? "pass" : "fail",
      detail: grounded
        ? "required facts supported by prompt chunks and/or source-backed extract corpus (heuristic)"
        : missing[0]?.detail || "answer facts not supported by RAG evidence",
      missing: grounded ? undefined : missing,
    };
  }

  layers._chunkTextCount = evidence.chunkTexts.length;

  return { layers, evidenceUsed: evidence };
}

function deriveCaseStatus(caseNorm, layers, infraError) {
  if (infraError) {
    return { status: "infrastructure_error", reason: infraError };
  }

  const mode = caseNorm.expectedOutcome.mode;
  const rs = caseNorm.resolutionStatus;

  if (rs === "blocked_pending_source_resolution") {
    if (layers.forbiddenLeakage?.status === "fail") {
      return { status: "fail", reason: "forbidden leakage on blocked case" };
    }
    return { status: "blocked", reason: "blocked_pending_source_resolution" };
  }

  if (layers.forbiddenLeakage?.status === "fail") {
    return { status: "fail", reason: "cross_model or forbidden claim" };
  }

  if (layers.factual?.status === "fail") {
    return { status: "fail", reason: "factual" };
  }

  if (mode === "must_abstain") {
    const ab = layers.abstention?.status;
    if (ab === "config_error") {
      return { status: "fail", reason: "abstention_config_incomplete" };
    }
    if (ab === "fail") {
      return { status: "fail", reason: "abstention" };
    }
    if (ab === "pass") {
      return { status: "pass", reason: "abstention ok" };
    }
    return { status: "fail", reason: "abstention_not_scored" };
  }

  if (mode === "either_abstain_or_answer_if_grounded") {
    if (layers.factual?.status === "blocked" && layers.forbiddenLeakage?.status === "pass") {
      return { status: "blocked", reason: "factual blocked; leakage ok" };
    }
    return { status: "blocked", reason: "either_abstain_or_answer_if_grounded" };
  }

  if (mode === "must_answer") {
    if (layers.factual?.status === "not_evaluable") {
      return { status: "not_evaluable", reason: "factual_heuristic_limit" };
    }
    if (caseNorm.requiredFacts.length > 0 && layers.factual?.status !== "pass") {
      return { status: "fail", reason: "factual_incomplete" };
    }
    if (caseNorm.requiredFacts.length === 0 && layers.factual?.status !== "not_applicable") {
      return { status: "fail", reason: "factual_unexpected_state" };
    }
  }

  if (caseRequiresRetrievalCheck(caseNorm)) {
    const r = layers.retrieval?.status;
    if (r === "fail") {
      return { status: "fail", reason: "retrieval" };
    }
    if (r === "not_evaluable") {
      return { status: "not_evaluable", reason: "retrieval_not_evaluable" };
    }
    if (r !== "pass") {
      return { status: "fail", reason: "retrieval_not_run" };
    }
  }

  const chunkCount = layers._chunkTextCount ?? 0;
  if (caseRequiresGroundingCheck(caseNorm, chunkCount)) {
    if (layers.grounding?.status === "fail") {
      return { status: "fail", reason: "grounding" };
    }
    if (layers.grounding?.status !== "pass") {
      return { status: "not_evaluable", reason: "grounding_incomplete" };
    }
  }

  if (mode === "must_answer" && caseNorm.requiredFacts.length === 0) {
    return { status: "pass", reason: "leakage-only ok" };
  }

  if (mode === "must_answer" && layers.factual?.status === "pass") {
    return { status: "pass", reason: "required layers ok" };
  }

  return { status: "fail", reason: "incomplete_evaluation" };
}

function computeMetrics(caseResults) {
  const metrics = {};
  const executedOverall = new Set(["pass", "fail", "not_evaluable", "blocked"]);

  const factualEligible = caseResults.filter(
    (r) =>
      r.case.resolutionStatus === "ready" &&
      r.case.expectedOutcome.mode === "must_answer" &&
      r.case.requiredFacts.length > 0 &&
      executedOverall.has(r.overall.status) &&
      (r.layers.factual?.status === "pass" || r.layers.factual?.status === "fail"),
  );
  const factualBlockedIds = caseResults
    .filter((r) => r.case.resolutionStatus === "blocked_pending_source_resolution")
    .map((r) => r.case.id);
  const factualPass = factualEligible.filter((r) => r.layers.factual.status === "pass");
  metrics.answer_factual_accuracy = {
    numerator: factualPass.length,
    denominator: factualEligible.length,
    includedCaseIds: factualEligible.map((r) => r.case.id),
    excludedBlockedCaseIds: factualBlockedIds,
    excludedNotEvaluableCaseIds: caseResults
      .filter(
        (r) =>
          r.case.resolutionStatus === "ready" &&
          r.case.expectedOutcome.mode === "must_answer" &&
          r.case.requiredFacts.length > 0 &&
          (r.overall.status === "not_evaluable" || r.layers.factual?.status === "not_evaluable"),
      )
      .map((r) => r.case.id),
    value:
      factualEligible.length === 0
        ? null
        : factualPass.length / factualEligible.length,
    zeroDenominatorBehavior: "value is null; do not report as 100%",
    note:
      "Deterministic number/text heuristic on answer text — not semantic factual accuracy or PDF grounding",
  };

  const leakageEligible = caseResults.filter(
    (r) =>
      (r.case.forbiddenClaims || []).length > 0 &&
      r.overall.status !== "not_run" &&
      r.overall.status !== "infrastructure_error",
  );
  const leakageFail = leakageEligible.filter((r) => r.layers.forbiddenLeakage.status === "fail");
  metrics.cross_model_leakage_rate = {
    numerator: leakageFail.length,
    denominator: leakageEligible.length,
    includedCaseIds: leakageEligible.map((r) => r.case.id),
    value:
      leakageEligible.length === 0
        ? null
        : leakageFail.length / leakageEligible.length,
    note: "numerator = cases where forbidden pattern matched answer",
  };

  const regressionEligible = caseResults.filter(
    (r) =>
      r.case.resolutionStatus !== "blocked_pending_source_resolution" &&
      executedOverall.has(r.overall.status) &&
      r.overall.status !== "blocked" &&
      r.overall.status !== "not_evaluable",
  );
  const regressionPass = regressionEligible.filter((r) => r.overall.status === "pass");
  metrics.regression_pass_rate = {
    numerator: regressionPass.length,
    denominator: regressionEligible.length,
    excludedBlockedCaseIds: caseResults
      .filter((r) => r.case.resolutionStatus === "blocked_pending_source_resolution")
      .map((r) => r.case.id),
    excludedNotEvaluableCaseIds: caseResults
      .filter((r) => r.overall.status === "not_evaluable")
      .map((r) => r.case.id),
    includedCaseIds: regressionEligible.map((r) => r.case.id),
    value:
      regressionEligible.length === 0
        ? null
        : regressionPass.length / regressionEligible.length,
    note: "pass only when all required layers for the case passed; not_evaluable excluded from denominator",
  };

  metrics.retrieval_recall_at_k = {
    value: null,
    reason: "not computed: requires chunk-level recall evidence",
  };
  metrics.grounded_claim_rate = {
    value: null,
    reason: "not computed unless chunk texts present in payload",
  };
  metrics.correct_abstention_rate = {
    value: null,
    reason: "not aggregated: abstention scoring only per-case when allowedAbstainPatterns set",
  };
  metrics.answerable_abstention_rate = {
    value: null,
    reason: "not computed: requires chunk grounding for answerable context",
  };

  return metrics;
}

function buildGitManifest() {
  const root = path.join(__dirname, "..");
  let commit = "unknown";
  let branch = "unknown";
  let dirty = null;
  let dirtyLineCount = null;
  try {
    commit = execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
    branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: root, encoding: "utf8" }).trim();
    const por = execSync("git status --porcelain", { cwd: root, encoding: "utf8" }).trim();
    dirty = por.length > 0;
    dirtyLineCount = por ? por.split("\n").filter(Boolean).length : 0;
  } catch (_e) {
    /* git unavailable */
  }
  return {
    commit,
    branch,
    dirty,
    dirtyLineCount,
    interpretResultsAsHeadOnly: dirty === false,
    note:
      dirty === true
        ? "Working tree dirty — results may include uncommitted changes not in commit"
        : dirty === false
          ? "Results align with HEAD commit"
          : "Git state unknown",
  };
}

function buildRunManifest(options) {
  const {
    datasetPath,
    datasetSha256,
    partition,
    mode,
    noProvision,
    allowHttp,
    dryRun,
    authMode,
    skipReasons = [],
  } = options;

  const envKeys = [
    "RAG_HONEST_EQUIPMENT",
    "RAG_PURE",
    "SOVA_QUERY_REWRITE",
    "OLLAMA_MODEL",
    "EMBEDDING_MODEL",
    "EVAL_BASE_URL",
  ];
  const envFingerprint = {};
  for (const k of envKeys) {
    const v = process.env[k];
    envFingerprint[k] = v === undefined ? "unknown" : v === "" ? "(empty)" : v;
  }
  if (process.env.EVAL_LOGIN) {
    envFingerprint.EVAL_LOGIN = "(set)";
  } else {
    envFingerprint.EVAL_LOGIN = "missing";
  }
  envFingerprint.EVAL_PASSWORD = process.env.EVAL_PASSWORD ? "(set)" : "missing";

  return {
    capturedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    evalRunnerLibVersion: EVAL_RUNNER_LIB_VERSION,
    git: buildGitManifest(),
    dataset: {
      path: datasetPath,
      sha256: datasetSha256,
      partition,
    },
    run: {
      mode,
      noProvision,
      allowHttp,
      dryRun,
      authMode,
    },
    serverEnvFingerprint: envFingerprint,
    indexFingerprint: {
      value: process.env.EVAL_INDEX_FINGERPRINT || "unknown",
      method: process.env.EVAL_INDEX_FINGERPRINT
        ? "EVAL_INDEX_FINGERPRINT env"
        : "not probed (no DB read by default)",
    },
    skipReasons,
    secretsPolicy: "passwords and .env contents are never stored",
  };
}

function loadSuiteFromFile(datasetPath) {
  const abs = path.resolve(datasetPath);
  const raw = fs.readFileSync(abs, "utf8");
  const doc = JSON.parse(raw);
  return { doc, abs, sha256: sha256File(abs) };
}

function prepareCases(doc, partition) {
  if (!SUITE_PARTITIONS.has(partition)) {
    throw new Error(`invalid partition: ${partition}`);
  }
  const equipmentId = doc.equipmentId || "sdb1560m";
  return doc.cases
    .map((c) => normalizeCase(c, equipmentId))
    .filter((c) => suitePartition(c, partition));
}

function truncateAnswer(answer, max = 320) {
  return String(answer || "").slice(0, max);
}

function runEvalDry({ cases, manifest }) {
  const caseResults = cases.map((caseNorm) => ({
    case: caseNorm,
    overall: { status: "not_run", reason: manifest.run.dryRun ? "dry-run" : "no-http" },
    layers: {
      factual: { status: "not_run", detail: null },
      forbiddenLeakage: { status: "not_run", detail: null },
      abstention: { status: "not_evaluable", detail: null },
      retrieval: { status: "not_evaluable", detail: null },
      grounding: { status: "not_evaluable", detail: null },
    },
    answerPreview: null,
    checksExecuted: [],
    errors: [],
  }));
  return {
    manifest,
    caseResults,
    metrics: computeMetrics(caseResults),
    summary: {
      total: caseResults.length,
      not_run: caseResults.length,
      message: "Validation and manifest only; no HTTP requests",
    },
  };
}

function runEvalWithPayloads({ cases, manifest, payloadsByCaseId }) {
  const caseResults = [];
  const diagnosticsByCaseId = {};
  for (const caseNorm of cases) {
    const payload = payloadsByCaseId[caseNorm.id];
    if (!payload) {
      caseResults.push({
        case: caseNorm,
        overall: { status: "infrastructure_error", reason: "missing payload" },
        layers: {},
        answerPreview: null,
        checksExecuted: [],
        errors: ["no payload"],
      });
      continue;
    }
    if (payload._infraError) {
      caseResults.push({
        case: caseNorm,
        overall: { status: "infrastructure_error", reason: payload._infraError },
        layers: {},
        answerPreview: null,
        checksExecuted: [],
        errors: [payload._infraError],
      });
      continue;
    }
    const { layers, evidenceUsed } = evaluateCaseLayers(caseNorm, payload);
    const diagnostics = summarizePayloadDiagnostics(payload);
    diagnosticsByCaseId[caseNorm.id] = diagnostics;
    const overall = deriveCaseStatus(caseNorm, layers, null);
    caseResults.push({
      case: caseNorm,
      overall,
      layers,
      answerPreview: truncateAnswer(payload.answer),
      checksExecuted: Object.keys(layers),
      errors: [],
      evidenceUsed: {
        sourceDocs: evidenceUsed.sourceDocs.slice(0, 4),
        chunkTextCount: evidenceUsed.chunkTexts.length,
        hasDebugTrace: evidenceUsed.hasDebugTrace,
        extractKind: diagnostics.ragTrace?.llm?.contextualExtract?.kind ?? null,
        promptChunkTraceCount: diagnostics.ragTrace?.retrieval?.promptChunkSummaries?.length ?? 0,
        fusedChunkTraceCount: diagnostics.ragTrace?.retrieval?.fusedChunkSummaries?.length ?? 0,
      },
    });
  }
  return {
    manifest,
    caseResults,
    metrics: computeMetrics(caseResults),
    summary: summarizeStatuses(caseResults),
    diagnosticsByCaseId,
  };
}

function summarizeStatuses(caseResults) {
  const counts = {
    pass: 0,
    fail: 0,
    blocked: 0,
    infrastructure_error: 0,
    not_run: 0,
    not_evaluable: 0,
  };
  for (const r of caseResults) {
    counts[r.overall.status] = (counts[r.overall.status] || 0) + 1;
  }
  return { total: caseResults.length, ...counts };
}

function writeRunOutput(outDir, report) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(report.manifest, null, 2), "utf8");
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
  const lines = [
    "# SDB1560M eval run summary",
    "",
    `- capturedAt: ${report.manifest.capturedAt}`,
    `- git: ${report.manifest.git.branch} @ ${report.manifest.git.commit?.slice(0, 12)} dirty=${report.manifest.git.dirty}`,
    `- cases: ${report.summary.total}`,
    `- pass: ${report.summary.pass ?? 0} fail: ${report.summary.fail ?? 0} blocked: ${report.summary.blocked ?? 0}`,
    `- factual accuracy: ${formatMetric(report.metrics.answer_factual_accuracy)}`,
    `- leakage rate: ${formatMetric(report.metrics.cross_model_leakage_rate)}`,
    `- regression pass: ${formatMetric(report.metrics.regression_pass_rate)}`,
  ];
  fs.writeFileSync(path.join(outDir, "SUMMARY.md"), lines.join("\n"), "utf8");
  if (report.diagnosticsByCaseId && typeof report.diagnosticsByCaseId === "object") {
    const diagLines = Object.entries(report.diagnosticsByCaseId).map(([caseId, diag]) =>
      JSON.stringify({ caseId, ...diag }),
    );
    fs.writeFileSync(
      path.join(outDir, "eval-rag-diagnostics.jsonl"),
      `${diagLines.join("\n")}\n`,
      "utf8",
    );
  }
  return outDir;
}

function formatMetric(m) {
  if (!m || m.value === null || m.value === undefined) {
    return `n/a (den=${m?.denominator ?? 0})`;
  }
  return `${(m.value * 100).toFixed(1)}% (${m.numerator}/${m.denominator})`;
}

module.exports = {
  STRICT_ABSTAIN,
  SCHEMA_VERSION,
  forbiddenPatternToRegex,
  EVAL_RUNNER_LIB_VERSION,
  SUITE_PARTITIONS,
  validateSuiteDocument,
  validateCase,
  normalizeCase,
  suitePartition,
  evaluateRequiredFact,
  buildBoundedNumberPattern,
  isPureNumericClaimPattern,
  isIntegerNumericClaimPattern,
  requiredNumericTokenEquivalent,
  isModelGroupCatalogNumeric,
  isRequiredFactGroundedInEvidence,
  buildGroundingEvidenceSegments,
  extractExtractProvenance,
  evaluateCaseLayers,
  deriveCaseStatus,
  computeMetrics,
  buildRunManifest,
  buildGitManifest,
  loadSuiteFromFile,
  prepareCases,
  runEvalDry,
  runEvalWithPayloads,
  writeRunOutput,
  sha256File,
  isAbstainLike,
  answerMatchesAllowedAbstain,
  summarizePayloadDiagnostics,
  extractEvidenceFromPayload,
  hasSubstantiveClaimBeyondAbstain,
  caseRequiresRetrievalCheck,
  isDualDryRegenWFactPair,
  isRhSetpointAbove30OffsetGroundingCase,
  segmentSupportsRhSetpointAbove30Offset,
};
