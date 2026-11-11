#!/usr/bin/env node
/**
 * Validate Task 28 generalization dataset before HTTP eval.
 */
const fs = require("fs");
const path = require("path");
const {
  validateSuiteDocument,
  loadSuiteFromFile,
  prepareCases,
} = require("./sdb1560m-eval-runner-lib");

const DATASET = path.join(__dirname, "eval", "sdb1560m-generalization-v1.json");
const V2 = path.join(__dirname, "..", "docs", "reports", "sdb1560m-eval-suite-expanded-v2.json");

function main() {
  let failed = false;
  const log = (ok, msg) => {
    console.log(`${ok ? "OK" : "FAIL"}: ${msg}`);
    if (!ok) failed = true;
  };

  const { doc, sha256 } = loadSuiteFromFile(DATASET);
  log(doc.suiteMeta?.name === "sdb1560m-generalization-v1", "suite name");
  log(doc.cases.length >= 100 && doc.cases.length <= 150, `case count ${doc.cases.length} in 100–150`);

  const validation = validateSuiteDocument(doc);
  log(validation.ok, `schema: ${validation.errors.join("; ") || "valid"}`);

  const ids = new Set();
  const messages = new Set();
  for (const c of doc.cases) {
    if (ids.has(c.id)) log(false, `duplicate id ${c.id}`);
    ids.add(c.id);
    const m = c.message.trim().toLowerCase();
    if (messages.has(m)) log(false, `duplicate message ${c.id}`);
    messages.add(m);
  }
  log(true, "unique ids and messages");

  const v2 = JSON.parse(fs.readFileSync(V2, "utf8"));
  const v2msg = new Set(v2.cases.map((c) => c.message.trim().toLowerCase()));
  const overlap = doc.cases.filter((c) => v2msg.has(c.message.trim().toLowerCase()));
  log(overlap.length === 0, `no v2 message overlap (${overlap.length})`);

  let missingSource = 0;
  for (const c of doc.cases) {
    if (c.expectedOutcome.mode === "must_answer") {
      const facts = c.requiredFacts || [];
      if (!facts.length) {
        log(false, `${c.id} must_answer without requiredFacts`);
        continue;
      }
      for (const f of facts) {
        if (!f.sourceHint) missingSource++;
      }
    } else if (c.expectedOutcome.mode === "must_abstain") {
      if (!c.abstentionRules?.allowedAbstainPatterns?.length) {
        log(false, `${c.id} abstain without patterns`);
      }
      if (!c.notes && !c.expectedOutcome.abstainReason) {
        missingSource++;
      }
    }
  }
  log(missingSource === 0, `source/abstain metadata (${missingSource} gaps)`);

  const answerN = doc.cases.filter((c) => c.expectedOutcome.mode === "must_answer").length;
  const abstainN = doc.cases.filter((c) => c.expectedOutcome.mode === "must_abstain").length;
  log(answerN > 0 && abstainN >= 10, `mix answer=${answerN} abstain=${abstainN}`);

  const partitions = ["all", "unsupported", "verified"];
  for (const p of partitions) {
    try {
      const n = prepareCases(doc, p).length;
      console.log(`partition ${p}: ${n} cases`);
    } catch (e) {
      log(false, `partition ${p}: ${e.message}`);
    }
  }

  console.log(`dataset sha256: ${sha256}`);
  if (failed) process.exit(1);
  console.log("generalization-v1 dataset validation passed");
}

main();
