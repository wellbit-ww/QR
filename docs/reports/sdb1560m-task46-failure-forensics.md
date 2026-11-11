# Task 46 — SDB1560M Task 28 failure forensics (read-only)

**Status:** COMPLETE  
**Mode:** READ-ONLY (no RAG/evaluator/dataset/HTTP/DB changes)  
**Baseline:** `logs/baseline-task44/task28-generalization-http/` · runner **`1.11-task43-r1`**  
**Git:** `backup/sova-portal` @ `8523954fadcc4f31b92305f81b8dfc09f3e61a14` (dirty, no commit)

**Machine output:** `logs/baseline-task46/failure-classification.json`  
**Snapshot:** `logs/baseline-task46/repo-snapshot.json`

---

## 1. Executive summary

Task 44 full HTTP generalization: **74/110 PASS**, **32 FAIL**, **4 NOT_EVALUABLE**, **0 infra**, leakage **0/20**.

Versus Task 40 (**70/110**): единственное улучшение — **4 pressure cases** (Task 42 RAG + Task 43 evaluator). **Новых fail-ID нет**; **32 оставшихся fail** совпадают с Task 41 инвентарём минус pressure.

Доминирующие причины (primary, 32 FAIL):

| Primary category | Count |
|------------------|------:|
| RETRIEVAL_FAILURE | 12 |
| GENERATION_ERROR | 8 |
| ABSTENTION_POLICY | 6 |
| RETRIEVAL_RANKING | 4 |
| EVALUATOR_MISMATCH | 2 |

Confidence (primary): **HIGH 2**, **MEDIUM 23**, **LOW 7**.

**Главные системные темы:**

1. **Spurious context abstain** на `must_answer` (~14 кейсов) — «не указано в контексте» при наличии chunks/golden (synthesis/policy).
2. **must_abstain violations** (6) — substantive answers на unsupported/insufficient queries.
3. **Numeric/table gaps** — kit 1.2, опции 1.4, RH high bound, ESD 61340, maintenance 3.1 (retrieval или generation).
4. **Evaluator multi-W** — `gen.disc.storage-vs-dry`, `gen.num.pwr-regen` (ответ содержит 540/40/8, factual `contradiction`).
5. **4 NOT_EVALUABLE** — короткие text patterns (`IP55`, `двер`, `азот`); не входят в 32 FAIL.

**Task 47 recommendation (one task):** **P0 must_abstain / unsupported-spec hardening** для 6 `must_abstain` fails — наименьший scope с доказанным risk (галлюцинации на Bluetooth, blockchain, warehouse setpoint, N2 без опции).

---

## 2. Исходное состояние

| Check | Result |
|-------|--------|
| Artifact path | `logs/baseline-task44/task28-generalization-http/report.json` ✓ |
| capturedAt | 2026-11-10T11:27:44.936Z |
| HEAD | `8523954fadcc4f31b92305f81b8dfc09f3e61a14` ✓ |
| evalRunnerLibVersion | `1.11-task43-r1` ✓ |
| summary | pass 74, fail 32, not_evaluable 4 |
| Diagnostics | `eval-rag-diagnostics.jsonl` present (snippets **~200 chars**, truncated) |

**Не смешивать** с `logs/baseline-task40/` или `logs/baseline-task42/task28-*`.

---

## 3. Полная таблица 32 FAILED cases

| Case ID | Primary | Conf | Factual detail (short) | Answer preview (short) |
|---------|---------|------|------------------------|-------------------------|
| gen.num.pwr-regen | EVALUATOR_MISMATCH | HIGH | contradiction | 40 Вт + 540 Вт в одном ответе |
| gen.disc.storage-vs-dry | EVALUATOR_MISMATCH | HIGH | contradiction | 8 Вт storage + 40 Вт dry |
| gen.unsup.bluetooth | ABSTENTION_POLICY | MEDIUM | must_abstain | упоминание Bluetooth |
| gen.unsup.sdb151-mass-for-1560 | ABSTENTION_POLICY | MEDIUM | must_abstain | scope redirect, не abstain |
| gen.unsup.warehouse-humidity-setpoint | ABSTENTION_POLICY | MEDIUM | must_abstain | substantive RH setpoint |
| gen.insuf.n2-without-option | ABSTENTION_POLICY | MEDIUM | must_abstain | частично ок, но fail abstention layer |
| gen.unsup.blockchain | ABSTENTION_POLICY | MEDIUM | must_abstain | «нет информации» не по allowed pattern |
| gen.unsup.serial-format | ABSTENTION_POLICY | MEDIUM | must_abstain | даёт серийник (substantive) |
| gen.num.rh-range-high | RETRIEVAL_FAILURE | MEDIUM | missing 80 | RH без явного «80» |
| gen.num.rh-accuracy | GENERATION_ERROR | LOW | missing ±1 | 0–80 %RH без точности |
| gen.num.ral | RETRIEVAL_FAILURE | MEDIUM | abstain-like | RAL не указан |
| gen.kit.wheels | RETRIEVAL_RANKING | MEDIUM | abstain-like | «4 колёса» не названы |
| gen.kit.shelves-perf | GENERATION_ERROR | LOW | missing 4 | ответ «2 полки» (wrong table row) |
| gen.kit.power-cord | GENERATION_ERROR | LOW | missing 4m | длина шнура не та |
| gen.opt.feeder-basket-min | GENERATION_ERROR | LOW | missing 1 | «4 корзины» wrong |
| gen.opt.feeder-basket-max | GENERATION_ERROR | LOW | missing 2 | «1–2» ambiguous |
| gen.maint.dust-months | RETRIEVAL_FAILURE | MEDIUM | abstain-like | table 3.1 not surfaced |
| gen.maint.power-cable | RETRIEVAL_FAILURE | MEDIUM | abstain-like | «параметр не указан» |
| gen.proc.sound-door | RETRIEVAL_RANKING | MEDIUM | abstain-like | п. 1.1.4.3.4 not asserted |
| gen.proc.door-fan-off | RETRIEVAL_FAILURE | MEDIUM | abstain-like | fan/door procedure |
| gen.multi.mass-depth | RETRIEVAL_RANKING | MEDIUM | abstain-like | multi-field abstain |
| gen.para.storage-w | RETRIEVAL_FAILURE | MEDIUM | abstain-like | 8 Вт storage |
| gen.para.desiccant-qty | GENERATION_ERROR | LOW | missing 2 | «2 блока» wrong vs expect |
| gen.para.36m | RETRIEVAL_RANKING | MEDIUM | abstain-like | desiccant 36 mo |
| gen.disc.810-storage-vs-dry | RETRIEVAL_FAILURE | MEDIUM | abstain-like | 810 comparative abstain |
| gen.foreign.mass-1106 | GENERATION_ERROR | LOW | missing 160 | foreign scope message |
| gen.std.esd | RETRIEVAL_FAILURE | MEDIUM | missing 61340 | ESD standard not in answer |
| gen.spare.lock-excluded | RETRIEVAL_FAILURE | MEDIUM | abstain-like | spare parts list |
| gen.rh.rule-below30 | RETRIEVAL_FAILURE | MEDIUM | missing 10 | below-30 rule (cf. Task 40 above-30) |
| gen.ind.green-only-storage | GENERATION_ERROR | MEDIUM | text «Хранен» | wrong mode wording |
| gen.proc.open-door-symbol | RETRIEVAL_FAILURE | MEDIUM | abstain-like | LCD symbol |
| gen.proc.fan-symbol | RETRIEVAL_FAILURE | MEDIUM | abstain-like | fan symbol |

Полные previews, missing claims, sourceDocs — в JSON.

---

## 4. NOT_EVALUABLE (4) — отдельно от 32 FAIL

| Case ID | Reason | Note |
|---------|--------|------|
| gen.num.ip55 | `factual_heuristic_limit` / unsafe text pattern `IP55` | grounding fail co-occurring |
| gen.para.ip | same | paraphrase IP question |
| gen.ind.red-door | unsafe pattern `двер` | alarm paraphrase |
| gen.sym.n2 | unsafe pattern `азот` | symbol question |

**Не production-RAG primary** — ограничение deterministic factual checker на коротких text patterns (Task 34/41 уже отмечали). Grounding fail в отчёте — следствие not_evaluable factual path.

---

## 5. Группировка системных проблем

### 5.1 Spurious abstain / policy (`must_answer`, ~16)

**IDs:** kit.wheels, maint.*, proc.sound-door, proc.door-fan-off, multi.mass-depth, para.storage-w, para.36m, disc.810, spare.lock, proc.open-door, proc.fan, num.ral (+ частично ranking).

**Evidence:** `factualDetail` = «empty or abstain-like»; answer содержит «контекст / не указан»; `chunkTextCount` 10–14; golden/PDF в `sourceDocs`.

**Hypothesis (MEDIUM):** LLM + RAG-pure post-gate не заменяют abstain, хотя corpus answerable (`honest-rag-mode.js` `isSpuriousModelAbstainAnswer`, grounding contract) — **не доказано** полным prompt без HTTP replay.

**Код (read-only hints):** `src/rag/pipeline/run-pipeline.js` (extract после LLM), `src/rag/synthesis/sdb1560-grounding-contract.js`, `src/rag/honest-rag-post-gate.js`.

### 5.2 must_abstain (6) — P0

**IDs:** unsup.bluetooth, sdb151-mass, warehouse-humidity-setpoint, insuf.n2-without-option, blockchain, serial-format.

**Evidence:** `overall.reason=abstention`; answers with specs/scoping.

**Hypothesis (HIGH):** unsupported-spec / chat-gate / `sdb1560m-unsupported-spec.js` не режет все формулировки generalization suite.

### 5.3 Kit / table 1.2–1.4 (8)

**IDs:** kit.wheels, shelves-perf, power-cord, feeder-basket-*, para.desiccant-qty.

**Evidence:** missing `4`, `4m`, `1`, `2`; shelves-perf answered **2 полки** (smoke expects 2 shelves generic, case wants **perforated shelves count 4**).

**Source:** PDF table 1.2 / 1.4 (not re-OCR’d in Task 46 — cited from case `sourceHint`).

### 5.4 RH / power / comparative eval (4)

**IDs:** rh-range-high, rh-accuracy, rh.rule-below30, pwr-regen + disc.storage-vs-dry.

**Evidence:** missing RH facts; below30 analogous to fixed above30 (Task 40); W contradiction with 8+40+540 in text.

### 5.5 Procedure / symbol / ESD (5)

**IDs:** proc.*, std.esd, ind.green-only-storage, foreign.mass-1106.

---

## 6. Source conflicts

**No confirmed F SOURCE_CONFLICT** at case level in artifacts (no contradictory manual values surfaced in answers). **G EVALUATOR_MISMATCH** for dual-W answers is checker semantics, not PDF vs golden conflict.

**Partial model-scope behavior:** `gen.foreign.mass-1106` — правильный scope message, но factual expects **160** foreign fact denial pattern — generation/policy, not leakage (foreign case).

---

## 7. Architecture touchpoints (evidence-linked)

| Area | Relevance | Evidence |
|------|-----------|----------|
| `honest-contextual-extract.js` | Missing kinds for RAL, kit rows, maint 3.1, symbols | `extractKind: null` on most abstain fails |
| `sdb1560m-rag-priority.js` | Section/table boosts | RETRIEVAL_* cluster |
| `honest-rag-mode.js` RAG PURE ranking | Cards below PDF/golden | snippets show golden first, wrong row for shelves |
| `sdb1560m-unsupported-spec.js` / chat-gate | must_abstain 6 | abstention reason |
| `sdb1560m-eval-runner-lib.js` | W contradiction, not_evaluable patterns | pwr-regen, disc.*, IP55 |
| `sdb1560-grounding-contract.js` | Early extract | rh-accuracy has `extractKind: rh_range` but misses ±1 |

---

## 8. Backlog P0–P3

| Pri | Theme | Cases | Area | Regression watch |
|-----|-------|------:|------|------------------|
| **P0** | must_abstain substantive answers | 6 | `unsupported-spec`, chat-gate, post-gate | Task 28 leakage + must_abstain partition |
| **P1** | Spurious abstain must_answer | ~14 | extract + grounding contract | Task 27 v2, Priority B, smoke |
| **P1** | RH below-30 rule | 1 | card/extract (mirror Task 40 RH) | RH above-30 case |
| **P1** | Kit/table 1.2 retrieval | 5+ | cards / retrieval priority | kit feet-height (pass) |
| **P2** | RH range high / accuracy | 2 | extract kinds | rh-range cases |
| **P2** | Procedure/symbol LCD | 3 | retrieval cards §1.1.4 | proc/alarm suite |
| **P3** | Dual-W evaluator | 2 | eval-runner scoped exemption | disc + pwr cases |
| **P3** | NOT_EVALUABLE patterns | 4 | dataset pattern length / evaluator | optional, not RAG |

No predicted PASS delta committed without experiment.

---

## 9. Limitations

1. **Truncated diagnostics snippets** — RETRIEVAL vs RANKING confidence capped at MEDIUM; full chunk bodies not in JSONL.
2. **No prompt replay** — cannot prove GENERATION_ERROR vs CONTEXT_LOSS for LLM path.
3. **No PDF page verification** in Task 46 — sourceHints taken from dataset only.
4. **Heuristic classifier** — human review on LOW (7 cases); JSON is reproducible via `logs/baseline-task46/` (regenerate: read-only node one-liner in git history, not shipped to `scripts/`).

---

## 10. Task 47 recommendation

**Start with:** **must_abstain / unsupported-spec hardening (P0, 6 cases)**.

**Why:** Clear failure mode (`overall.reason=abstention`), high user-risk on fabricated specs (Bluetooth, blockchain, warehouse setpoint), isolated from numeric table work, verifiable on 6 IDs + leakage partition without full 110 run.

**Second wave (Task 48+):** spurious abstain cluster (kit/maint/procedure) — larger PASS potential, higher regression surface.

---

## 11. READ-ONLY confirmation

- No production, evaluator, dataset, or env changes in Task 46.  
- No HTTP re-run, no DB/ingest.  
- New files only: `logs/baseline-task46/*`, `docs/reports/sdb1560m-task46-failure-forensics.md`.  
- Task 44 artifacts untouched.
