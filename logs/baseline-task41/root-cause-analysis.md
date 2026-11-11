# Task 41 — Root-cause analysis

Evidence from `report.json`, `eval-rag-diagnostics.jsonl`, and auditor review (`task41-final-classifications.json`).

## Primary distribution (36 fails)

| Code | Label | Count |
|------|-------|------:|
| A | Retrieval failure | 3 |
| B | Routing failure | 1 |
| C | Contextual extraction failure | 3 |
| D | Synthesis failure | 20 |
| E | Grounding failure | 0 |
| F | Abstention failure | 6 |
| G | Evaluation/dataset defect | 2 |
| H | Mixed/undetermined | 1 |

**Sum:** 36. **True grounding-only (factual pass, grounding fail):** 0.

## Cross-cutting themes

### cross_model_ttx_chunks

Wrong-model TTX row chunks (SDB1106NM) in prompt top ranks (**7**): gen.num.rh-range-high, gen.maint.power-cable, gen.proc.sound-door, gen.multi.mass-depth, gen.std.esd, gen.rh.rule-below30, gen.ind.green-only-storage

### spurious_abstain

Spurious abstain on must_answer despite grounded context (**9**): gen.kit.wheels, gen.maint.dust-months, gen.maint.power-cable, gen.proc.sound-door, gen.proc.door-fan-off, gen.multi.mass-depth, gen.para.storage-w, gen.para.36m, gen.spare.lock-excluded

### must_abstain_hallucination

Unsupported-spec queries answered substantively (**6**): gen.unsup.bluetooth, gen.unsup.sdb151-mass-for-1560, gen.unsup.warehouse-humidity-setpoint, gen.insuf.n2-without-option, gen.unsup.blockchain, gen.unsup.serial-format

### multi_fact_partial

Multi-fact questions missing one or more required assertions (**1**): gen.multi.mass-depth

### evaluator_comparative_power

Comparative storage vs dry power — evaluator W contradiction heuristic (**2**): gen.disc.storage-vs-dry, gen.disc.810-storage-vs-dry

### procedure_symbol_indicator

Procedure / indicator / symbol paraphrase (**5**): gen.proc.sound-door, gen.proc.door-fan-off, gen.ind.green-only-storage, gen.proc.open-door-symbol, gen.proc.fan-symbol

### environmental_spec

Environmental limits (pressure, RAL, ESD, RH range) (**7**): gen.num.rh-range-high, gen.env.pressure-kpa-min, gen.env.pressure-kpa-max, gen.num.ral, gen.std.esd, gen.env.pressure-mmhg-min, gen.env.pressure-mmhg-max

### Unclustered

gen.num.pwr-regen, gen.num.rh-accuracy, gen.kit.shelves-perf, gen.kit.power-cord, gen.opt.feeder-basket-min, gen.opt.feeder-basket-max, gen.para.desiccant-qty, gen.foreign.mass-1106

## Historical regression

- Improved Task 39→40: **gen.rh.rule-above30** (RH above30; not in remaining 36).
- Regressed Task 39→40 among current fails: **none**.
- Regained fail after Task 33 pass: **gen.num.pwr-regen, gen.para.storage-w**.
- Persistent fail since Task 33: **34/36**.

Task 28 pass trajectory: 54 (T30) → 51 (T32, 3 infra) → 55 (T33) → 69 (T39) → **70 (T40)**.
