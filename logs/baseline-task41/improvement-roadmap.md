# Task 41 — Improvement roadmap (implementation proposals only)

No changes applied in Task 41. Protected baselines: T27 32/32, Priority B 10/10, T28 ≥70/110, leakage 0/20, infra 0.

## Ranked tasks

### Task 42 (P0) — Spurious abstain recovery on must_answer

- **Problem:** 20 synthesis failures dominated by abstain-like answers while golden/PDF chunks are in prompt (see cluster `spurious_abstain`).
- **Cases:** gen.kit.wheels, gen.maint.dust-months, gen.maint.power-cable, gen.proc.sound-door, gen.proc.door-fan-off, gen.multi.mass-depth, gen.para.storage-w, gen.para.36m, gen.spare.lock-excluded
- **Modules:** `src/rag/honest-contextual-extract.js`, `src/rag/synthesis/sdb1560-grounding-contract.js`, `src/rag/sdb1560m-post-gate.js`
- **Approach:** Expand early-extract kinds for kit/maintenance/paraphrase; tighten `priorAnswerFullyAnswersQuery` to reject context-deferral phrases when extract corpus contains table rows.
- **Expected gain:** +8–12 on T28 if stable HTTP.
- **Regression:** T27, Priority B, power smoke; watch for leakage on foreign model.

### Task 43 (P0) — must_abstain wording alignment

- **Problem:** 6× `overall.reason=abstention` — substantive or non-allowed abstain phrasing.
- **Cases:** gen.unsup.bluetooth, gen.unsup.sdb151-mass-for-1560, gen.unsup.warehouse-humidity-setpoint, gen.insuf.n2-without-option, gen.unsup.blockchain, gen.unsup.serial-format
- **Modules:** `src/rag/sdb1560m-chat-gate.js`, `src/rag/guardrails/guardrail-engine.js`, prompts.
- **Approach:** Route `gen.unsup.*` / `gen.insuf.*` through unsupported-spec gate before LLM; normalize answers to `MODEL_PARAM_NOT_SPECIFIED` phrasing in dataset allowed patterns.
- **Expected gain:** +4–6 must_abstain passes.

### Task 44 (P1) — Environmental + RAL retrieval cards

- **Cases:** gen.env.pressure-*, gen.num.ral, gen.std.esd
- **Modules:** `knowledge/sdb1560m/retrieval-cards/`, `src/rag/retrieval/unified-retriever.js`
- **Approach:** Dedicated cards for §1.1.2.8 pressure, RAL 7035, ESD; lexical boost for kPa/mmHg/бар.
- **Expected gain:** +4–7.

### Task 45 (P1) — RH setpoint below-30 routing (mirror Task 40 above-30)

- **Cases:** gen.rh.rule-below30, secondary gen.num.rh-range-high, gen.num.rh-accuracy
- **Modules:** `src/rag/router/query-router.js`, `knowledge/.../setpoint-vs-ambient.md`, contextual extract.

### Task 46 (P1) — Cross-model TTX chunk demotion

- **Cases:** gen.num.rh-range-high, gen.maint.power-cable, gen.proc.sound-door, gen.multi.mass-depth, gen.std.esd, gen.rh.rule-below30, gen.ind.green-only-storage
- **Modules:** `src/rag/rerank.js`, index metadata filter for `SDB1560M` row chunks vs `SDB1106NM` artifact rows.

### Task 47 (P2) — Comparative power evaluator (document-only unless product accepts)

- **Cases:** gen.disc.storage-vs-dry, gen.disc.810-storage-vs-dry
- **Note:** Answers may be technically correct; Task 39 dual-W logic does not cover all comparative patterns — **dataset/evaluator** change requires explicit approval.

### Task 48 (P2) — LCD symbol + procedure extracts

- **Cases:** gen.proc.open-door-symbol, gen.proc.fan-symbol, gen.ind.green-only-storage
- **Modules:** new retrieval cards for LCD legend §; procedure contextual extract kinds.

### Task 49 (P2) — Single-field power gaps

- **Cases:** gen.num.pwr-regen, gen.kit.shelves-perf, gen.opt.feeder-basket-*, gen.kit.power-cord
- **Modules:** contextual extract kinds `power_regen`, `kit_*`, deterministic slices.

## Safest sequence

1. Task 43 (abstain — low regression risk on must_answer numerics). 2. Task 42 (largest pass-count upside). 3. Task 46 (cross-model demotion). 4. Task 44 env cards. 5. Task 45 RH below30. 6. Task 48 symbols. 7. Task 49 singles. 8. Task 47 only after stakeholder sign-off.
