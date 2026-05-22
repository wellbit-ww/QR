/**
 * Robust extraction of safety checklist JSON from LLM output (markdown fences, minor syntax issues).
 */

function stripMarkdownFences(text) {
  let s = String(text || "").trim();
  const block = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (block) {
    s = block[1].trim();
  }
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  return s;
}

function stripTrailingCommasInJson(jsonStr) {
  return String(jsonStr || "").replace(/,\s*([}\]])/g, "$1");
}

/** First top-level balanced `{ ... }` span. */
function extractBalancedObject(text) {
  const s = String(text || "");
  const start = s.indexOf("{");
  if (start < 0) {
    return null;
  }
  let depth = 0;
  let inString = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (esc) {
        esc = false;
      } else if (c === "\\") {
        esc = true;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") {
      depth += 1;
    } else if (c === "}") {
      depth -= 1;
      if (depth === 0) {
        return s.slice(start, i + 1);
      }
    }
  }
  return null;
}

function tryParseJsonObject(candidate) {
  if (!candidate) {
    return null;
  }
  const cleaned = stripTrailingCommasInJson(candidate.trim());
  try {
    return JSON.parse(cleaned);
  } catch (_e) {
    try {
      return JSON.parse(stripTrailingCommasInJson(candidate.trim()));
    } catch (_e2) {
      return null;
    }
  }
}

function itemsFromParsed(parsed) {
  const raw = Array.isArray(parsed?.пункты_для_проверки)
    ? parsed.пункты_для_проверки
    : Array.isArray(parsed?.items)
    ? parsed.items
    : [];
  const out = [];
  for (const it of raw) {
    const line =
      typeof it?.текст === "string"
        ? it.текст.trim()
        : typeof it?.text === "string"
        ? it.text.trim()
        : typeof it === "string"
        ? it.trim()
        : "";
    if (line) {
      out.push(line);
    }
  }
  return out;
}

/**
 * @param {string} rawAnswer
 * @returns {string[]} non-empty checklist lines (empty if unrecoverable)
 */
function parseSafetyChecklistItems(rawAnswer) {
  const stripped = stripMarkdownFences(rawAnswer);
  let candidate = stripped;
  if (!candidate.startsWith("{")) {
    const sub = extractBalancedObject(stripped);
    if (sub) {
      candidate = sub;
    }
  }
  let parsed = tryParseJsonObject(candidate);
  if (!parsed && candidate !== stripped) {
    parsed = tryParseJsonObject(stripped);
  }
  if (!parsed) {
    const balanced = extractBalancedObject(stripped);
    if (balanced && balanced !== candidate) {
      parsed = tryParseJsonObject(balanced);
    }
  }
  if (!parsed) {
    return [];
  }
  return itemsFromParsed(parsed);
}

function formatSafetyChecklistLines(items) {
  const lines = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!lines.length) {
    return "";
  }
  return ["Что проверить:", ...lines.map((line, idx) => `${idx + 1}. ${line}`)].join("\n");
}

module.exports = {
  stripMarkdownFences,
  parseSafetyChecklistItems,
  formatSafetyChecklistLines,
  extractBalancedObject,
};
