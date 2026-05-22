/**
 * Validates data/eval-sdb1106nm-parity.json: JSON syntax + regex compile + mustNotContain sanity.
 */
const fs = require("fs");
const path = require("path");

const DATASET_PATH = path.join(__dirname, "..", "data", "eval-sdb1106nm-parity.json");

function main() {
  const raw = fs.readFileSync(DATASET_PATH, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error("JSON.parse FAILED:", error.message);
    process.exit(1);
  }

  console.log("JSON.parse: OK");
  console.log(`Items: ${parsed.items.length}`);

  let warnings = 0;
  let errors = 0;

  for (const item of parsed.items) {
    for (const pattern of item.mustMatchRegex || []) {
      try {
        new RegExp(String(pattern), "iu");
      } catch (error) {
        console.error(`[${item.id}] invalid mustMatchRegex ${JSON.stringify(pattern)}: ${error.message}`);
        errors += 1;
      }
      // Detect regex metacharacters that likely need JSON double-backslash but got single-letter form
      if (/\\s|\\d|\\w|\\b/.test(String(pattern))) {
        /* has backslash escapes — good if they came from JSON \\ */
      } else if (/\s+\+|\+|\*\?/.test(String(pattern)) && String(pattern).includes("s+")) {
        console.warn(`[${item.id}] suspicious pattern (literal s+?): ${pattern}`);
        warnings += 1;
      }
    }

    for (const pattern of item.mustNotMatchRegex || []) {
    try {
      new RegExp(String(pattern), "iu");
    } catch (error) {
      console.error(`[${item.id}] invalid mustNotMatchRegex ${JSON.stringify(pattern)}: ${error.message}`);
      errors += 1;
    }
  }

  for (const token of item.mustNotContain || []) {
      const t = String(token);
      if (/\\[sdwSDW]|\\s|\\d|\[\^/.test(t)) {
        console.warn(
          `[${item.id}] mustNotContain uses regex-like token (substring match only): ${JSON.stringify(token)}`
        );
        warnings += 1;
      }
    }
  }

  const warehouse = parsed.items.find((i) => i.id === "ttx-warehouse-mismatch");
  if (warehouse) {
    const pattern = warehouse.mustMatchRegex[0];
    const re = new RegExp(pattern, "iu");
    const ok = re.test("условия не соответствуют требованиям");
    const rawLine = raw.split("\n").find((l) => l.includes("ttx-warehouse-mismatch") === false && l.includes("не\\\\s+соответств"));
    console.log(`ttx-warehouse-mismatch mustMatchRegex[0] after JSON.parse: ${pattern}`);
    console.log(`  contains \\s whitespace class: ${/\\s/.test(pattern)}`);
    console.log(`  matches "не соответствуют": ${ok}`);
    if (!ok) errors += 1;
  }

  const ipCase = parsed.items.find((i) => i.id === "ttx-ip-class");
  if (ipCase) {
    const re = new RegExp(ipCase.mustMatchRegex[0], "iu");
    console.log(`ttx-ip-class mustMatchRegex[0]: ${ipCase.mustMatchRegex[0]}`);
    console.log(`  matches "IP65": ${re.test("класс защиты ip65")}`);
    console.log(`  matches abstain (no IP65): ${re.test("информация отсутствует")}`);
  }

  if (errors > 0) {
    process.exit(1);
  }
  console.log(`Warnings: ${warnings}`);
}

main();
