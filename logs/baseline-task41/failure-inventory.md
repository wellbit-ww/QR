# Task 41 — Failure inventory (Task 40 Task 28 baseline)

**Branch:** `backup/sova-portal` · **HEAD:** `8523954fadcc4f31b92305f81b8dfc09f3e61a14` (dirty 159 lines)

**Source:** `C:\Users\SOVAI\Documents\Work\QR\logs\baseline-task40\task28-generalization-http\report.json`

**Verified summary:** total 110, pass 70, **fail 36**, not_evaluable 4, infra 0, leakage **0/20**.

Full machine records: `logs/baseline-task41/task41-inventory.json`.

---

## gen.disc.810-storage-vs-dry

- **Primary (G):** Evaluation/dataset defect — Comparative 810 W case; same evaluator multi-W pattern as Task 34 *(confidence: medium)*
- **Question:** 810 Вт с опциями — это режим хранения или осушения для SDB1560М?
- **Expected mode:** must_answer
- **Required facts:** 810
- **Failing layer:** factual
- **Answer preview:** В документации на данную модель этот параметр не указан.
- **Router:** intent=SINGLE_FIELD_QUERY, route=UNKNOWN, mode=hybrid_wide
- **Contextual extract:** kind=undefined, applied=undefined, reject=—
- **Chunks in diagnostics:** 12
- **Top sources:** golden-facts-sdb1560m.md, golden-facts-sdb1560m.md, golden-facts-sdb1560m.md, Руководство SDB1560NM.pdf

## gen.disc.storage-vs-dry

- **Primary (G):** Evaluation/dataset defect — Answer states 8 W + 40 W correctly; factual fail contradiction on 40; grounding segments miss 40 *(confidence: high)*
- **Question:** Чем отличается 8 Вт от 40 Вт в ТТХ SDB1560М (какой режим 40 Вт)?
- **Expected mode:** must_answer
- **Required facts:** 40
- **Failing layer:** factual
- **Missing/contradicted:** 40 (contradiction)
- **Grounding (co-fail):** required fact not found in evidence segments
- **Answer preview:** Максимальная потребляемая мощность Шкафа SDB1560М составляет 8 Вт в режиме хранения и 40 Вт в режиме осушения. 

- 8 Вт – это потребляемая мощность в режиме хранения.
- 40 Вт – это потребляемая мощность в режиме осушения.
- **Router:** intent=SINGLE_FIELD_QUERY, route=UNKNOWN, mode=hybrid_wide
- **Contextual extract:** kind=undefined, applied=undefined, reject=—
- **Chunks in diagnostics:** 14
- **Top sources:** golden-facts-sdb1560m.md, golden-facts-sdb1560m.md, Руководство SDB1560NM.pdf, Руководство SDB1560NM.pdf

## gen.env.pressure-kpa-max

- **Primary (D):** Synthesis failure — Spurious abstain despite must_answer *(confidence: high)*
- **Question:** Верхняя граница атмосферного давления (кПа)?
- **Expected mode:** must_answer
- **Required facts:** 106[,.]7
- **Failing layer:** factual
- **Grounding (co-fail):** required fact not found in evidence segments
- **Answer preview:** В предоставленном контексте не указано значение верхней границы атмосферного давления для модели SDB1560 M. Поэтому, на основе доступной информации, ответить на этот вопрос невозможно.
- **Router:** intent=SINGLE_FIELD_QUERY, route=UNKNOWN, mode=hybrid_wide
- **Contextual extract:** kind=undefined, applied=undefined, reject=—
- **Chunks in diagnostics:** 10
- **Top sources:** golden-facts-sdb1560m.md, Руководство SDB1560NM.pdf, Руководство SDB1560NM.pdf, Руководство SDB1560NM.pdf

## gen.env.pressure-kpa-min

- **Primary (D):** Synthesis failure — Spurious context abstain; pressure facts likely in §1.1 / retrieval-card gap (secondary A) *(confidence: high)*
- **Question:** Нижняя граница атмосферного давления для эксплуатации (кПа)?
- **Expected mode:** must_answer
- **Required facts:** 84
- **Failing layer:** factual
- **Grounding (co-fail):** required fact not found in evidence segments
- **Answer preview:** В предоставленном контексте не указано значение нижней границы атмосферного давления для эксплуатации шкафа SDB1560NM.
- **Router:** intent=SINGLE_FIELD_QUERY, route=UNKNOWN, mode=hybrid_wide
- **Contextual extract:** kind=undefined, applied=undefined, reject=—
- **Chunks in diagnostics:** 10
- **Top sources:** golden-facts-sdb1560m.md, Руководство SDB1560NM.pdf, Руководство SDB1560NM.pdf, Руководство SDB1560NM.pdf

## gen.env.pressure-mmhg-max

- **Primary (D):** Synthesis failure — Same as mmhg-min *(confidence: high)*
- **Question:** Верхняя граница давления в мм рт. ст.?
- **Expected mode:** must_answer
- **Required facts:** 800
- **Failing layer:** factual
- **Grounding (co-fail):** required fact not found in evidence segments
- **Answer preview:** В документации на данную модель этот параметр не указан.
- **Router:** intent=SINGLE_FIELD_QUERY, route=UNKNOWN, mode=hybrid_wide
- **Contextual extract:** kind=undefined, applied=undefined, reject=—
- **Chunks in diagnostics:** 10
- **Top sources:** golden-facts-sdb1560m.md, golden-facts-sdb1560m.md, golden-facts-sdb1560m.md, Руководство SDB1560NM.pdf

## gen.env.pressure-mmhg-min

- **Primary (D):** Synthesis failure — MODEL_PARAM_NOT_SPECIFIED-style abstain *(confidence: high)*
- **Question:** Нижняя граница давления в мм рт. ст.?
- **Expected mode:** must_answer
- **Required facts:** 630
- **Failing layer:** factual
- **Grounding (co-fail):** required fact not found in evidence segments
- **Answer preview:** В документации на данную модель этот параметр не указан.
- **Router:** intent=SINGLE_FIELD_QUERY, route=UNKNOWN, mode=hybrid_wide
- **Contextual extract:** kind=undefined, applied=undefined, reject=—
- **Chunks in diagnostics:** 10
- **Top sources:** golden-facts-sdb1560m.md, golden-facts-sdb1560m.md, Руководство SDB1560NM.pdf, Руководство SDB1560NM.pdf

## gen.foreign.mass-1106

- **Primary (H):** Mixed/undetermined — Foreign-model probe; inconsistent abstain vs numeric leakage risk *(confidence: medium)*
- **Question:** Сколько kilogram весит SDB1106 по той же таблице габаритов?
- **Expected mode:** must_answer
- **Required facts:** 160
- **Failing layer:** factual
- **Missing/contradicted:** 160 (missing_or_negated)
- **Answer preview:** Я специализируюсь только на модели SDB1560 M. Могу подсказать параметры и эксплуатацию именно этого устройства.
- **Chunks in diagnostics:** 0
- **Top sources:** —

## gen.ind.green-only-storage

- **Primary (A):** Retrieval failure — Indicator semantics; retrieval dominated by unrelated procedure chunks *(confidence: medium)*
- **Question:** Если горит только зелёный (без красного и жёлтого), какой режим?
- **Expected mode:** must_answer
- **Required facts:** Хранен
- **Failing layer:** factual
- **Missing/contradicted:** Хранен (missing_or_negated)
- **Answer preview:** Если горит только зелёный индикатор (без красного и жёлтого), то Шкаф работает в режиме осушения.
- **Router:** intent=TROUBLESHOOTING_QUERY, route=TROUBLESHOOTING_QA, mode=troubleshooting_focused
- **Contextual extract:** kind=undefined, applied=undefined, reject=—
- **Chunks in diagnostics:** 12
- **Top sources:** golden-facts-sdb1560m.md, golden-facts-sdb1560m.md, golden-facts-sdb1560m.md, Руководство SDB1560NM.pdf

## gen.insuf.n2-without-option

- **Primary (F):** Abstention failure — must_abstain *(confidence: high)*
- **Question:** Какой расход азота у шкафа без установленной опции азота?
- **Expected mode:** must_abstain
- **Required facts:** —
- **Failing layer:** abstention
- **Answer preview:** Система **подачи азота** в базовый состав SDB1560NM **не входит** — **опция**, приобретается отдельно (табл. 1.2).
- **Router:** intent=SINGLE_FIELD_QUERY, route=UNKNOWN, mode=hybrid_wide
- **Contextual extract:** kind=n2_option, applied=true, reject=—
- **Chunks in diagnostics:** 11
- **Top sources:** golden-facts-sdb1560m.md, Руководство SDB1560NM.pdf, Руководство SDB1560NM.pdf, Руководство SDB1560NM.pdf

## gen.kit.power-cord

- **Primary (D):** Synthesis failure — Wrong or partial kit answer with chunks present *(confidence: medium)*
- **Question:** Минимальная длина шнура питания в комплекте?
- **Expected mode:** must_answer
- **Required facts:** 4
- **Failing layer:** factual
- **Missing/contradicted:** 4 (missing_or_negated)
- **Answer preview:** Минимальная длина шнура питания в комплекте для модели SDB1560М не менее 4 м.
- **Router:** intent=SINGLE_FIELD_QUERY, route=UNKNOWN, mode=hybrid_wide
- **Contextual extract:** kind=undefined, applied=undefined, reject=—
- **Chunks in diagnostics:** 10
- **Top sources:** golden-facts-sdb1560m.md, golden-facts-sdb1560m.md, golden-facts-sdb1560m.md, Руководство SDB1560NM.pdf

## gen.kit.shelves-perf

- **Primary (C):** Contextual extraction failure — Shelf load fact; extract applied but factual miss *(confidence: medium)*
- **Question:** Сколько полок с перфорацией для SDB1560М в таблице 1.2?
- **Expected mode:** must_answer
- **Required facts:** 4
- **Failing layer:** factual
- **Missing/contradicted:** 4 (missing_or_negated)
- **Answer preview:** В шкафу SDB1560NM предусмотрено **2 полки**.
- **Router:** intent=SINGLE_FIELD_QUERY, route=UNKNOWN, mode=hybrid_wide
- **Contextual extract:** kind=kit_shelf, applied=true, reject=—
- **Chunks in diagnostics:** 10
- **Top sources:** golden-facts-sdb1560m.md, golden-facts-sdb1560m.md, golden-facts-sdb1560m.md, Руководство SDB1560NM.pdf

## gen.kit.wheels

- **Primary (D):** Synthesis failure — Spurious abstain; table 1.2 / golden kit row present in diagnostics *(confidence: high)*
- **Question:** Сколько колёс для транспортирования в базовой поставке SDB1560М?
- **Expected mode:** must_answer
- **Required facts:** 4
- **Failing layer:** factual
- **Answer preview:** В предоставленном контексте не указано количество колёс для транспортирования в базовой поставке SDB1560М.
- **Router:** intent=SINGLE_FIELD_QUERY, route=UNKNOWN, mode=hybrid_wide
- **Contextual extract:** kind=undefined, applied=undefined, reject=—
- **Chunks in diagnostics:** 14
- **Top sources:** golden-facts-sdb1560m.md, Руководство SDB1560NM.pdf, Руководство SDB1560NM.pdf, Руководство SDB1560NM.pdf

## gen.maint.dust-months

- **Primary (D):** Synthesis failure — Spurious abstain on maintenance interval *(confidence: high)*
- **Question:** Как часто продувать от пыли узел поддержания температуры (если опция есть)?
- **Expected mode:** must_answer
- **Required facts:** 12
- **Failing layer:** factual
- **Answer preview:** В предоставленных фрагментах контекста нет информации о частоте продувки узла поддержания температуры от пыли для модели SDB1560M.
- **Router:** intent=SINGLE_FIELD_QUERY, route=UNKNOWN, mode=hybrid_wide
- **Contextual extract:** kind=undefined, applied=undefined, reject=—
- **Chunks in diagnostics:** 10
- **Top sources:** golden-facts-sdb1560m.md, golden-facts-sdb1560m.md, golden-facts-sdb1560m.md, Руководство SDB1560NM.pdf

## gen.maint.power-cable

- **Primary (D):** Synthesis failure — Spurious abstain; maintenance § in corpus *(confidence: high)*
- **Question:** Как часто проверять кабель сетевого питания 220 В?
- **Expected mode:** must_answer
- **Required facts:** 1
- **Failing layer:** factual
- **Answer preview:** В документации на данную модель этот параметр не указан.
- **Router:** intent=TROUBLESHOOTING_QUERY, route=TROUBLESHOOTING_QA, mode=troubleshooting_focused
- **Contextual extract:** kind=undefined, applied=undefined, reject=—
- **Chunks in diagnostics:** 10
- **Top sources:** golden-facts-sdb1560m.md, Руководство SDB1560NM.pdf, Руководство SDB1560NM.pdf, Руководство SDB1560NM.pdf

## gen.multi.mass-depth

- **Primary (D):** Synthesis failure — Multi-field; abstain-like despite golden table in context *(confidence: high)*
- **Question:** Назовите массу и глубину SDB1560М по Таблице 1.1.
- **Expected mode:** must_answer
- **Required facts:** 260, 1028
- **Failing layer:** factual
- **Answer preview:** В документации на данную модель этот параметр не указан.
- **Router:** intent=SINGLE_FIELD_QUERY, route=UNKNOWN, mode=hybrid_wide
- **Contextual extract:** kind=mass_and_dimensions, applied=true, reject=—
- **Chunks in diagnostics:** 11
- **Top sources:** golden-facts-sdb1560m.md, golden-facts-sdb1560m.md, golden-facts-sdb1560m.md, Руководство SDB1560NM.pdf

## gen.num.pwr-regen

- **Primary (C):** Contextual extraction failure — Regen-only W query; extract path ran but answer did not satisfy 540 W fact *(confidence: medium)*
- **Question:** Потолок мощности в режиме регенерации осушителя для SDB1560М?
- **Expected mode:** must_answer
- **Required facts:** 540
- **Failing layer:** factual
- **Missing/contradicted:** 540 (contradiction)
- **Answer preview:** Максимальная потребляемая мощность: в режиме **осушения** — **не более 40 Вт**, в режиме **регенерации** осушителя — **не более 540 Вт** (п. 1.1.2.7).
- **Router:** intent=SINGLE_FIELD_QUERY, route=UNKNOWN, mode=hybrid_wide
- **Contextual extract:** kind=power_dry_regen, applied=true, reject=—
- **Chunks in diagnostics:** 10
- **Top sources:** golden-facts-sdb1560m.md, Руководство SDB1560NM.pdf, Руководство SDB1560NM.pdf, Руководство SDB1560NM.pdf

## gen.num.ral

- **Primary (D):** Synthesis failure — Spurious abstain; RAL 7035 in manual § *(confidence: high)*
- **Question:** Какой цвет корпуса RAL указан в РЭ?
- **Expected mode:** must_answer
- **Required facts:** 7035
- **Failing layer:** factual
- **Grounding (co-fail):** required fact not found in evidence segments
- **Answer preview:** В предоставленном контексте не указан конкретный цвет RAL для корпуса шкафа SDB1560M.
- **Router:** intent=SINGLE_FIELD_QUERY, route=UNKNOWN, mode=hybrid_wide
- **Contextual extract:** kind=undefined, applied=undefined, reject=—
- **Chunks in diagnostics:** 14
- **Top sources:** Руководство SDB1560NM.pdf, Руководство SDB1560NM.pdf, Руководство SDB1560NM.pdf, Руководство SDB1560NM.pdf

## gen.num.rh-accuracy

- **Primary (C):** Contextual extraction failure — ±1 RH% extract/kind path incomplete vs required pattern *(confidence: medium)*
- **Question:** Точность поддержания установленного диапазона влажности?
- **Expected mode:** must_answer
- **Required facts:** 1
- **Failing layer:** factual
- **Missing/contradicted:** 1 (missing_or_negated)
- **Answer preview:** Диапазон поддержания относительной влажности внутри рабочего объёма SDB1560NM — **0–80 %RH**, но не выше влажности окружающего воздуха (п. 1.1.2.1).
- **Router:** intent=SINGLE_FIELD_QUERY, route=UNKNOWN, mode=hybrid_wide
- **Contextual extract:** kind=rh_range, applied=true, reject=—
- **Chunks in diagnostics:** 10
- **Top sources:** golden-facts-sdb1560m.md, golden-facts-sdb1560m.md, Руководство SDB1560NM.pdf, Руководство SDB1560NM.pdf

## gen.num.rh-range-high

- **Primary (A):** Retrieval failure — RH upper bound; SDB1106NM row chunks in fused top ranks *(confidence: high)*
- **Question:** Верхняя граница диапазона поддержания RH% внутри рабочего объёма?
- **Expected mode:** must_answer
- **Required facts:** 80
- **Failing layer:** factual
- **Missing/contradicted:** 80 (missing_or_negated)
- **Answer preview:** Верхняя граница диапазона поддержания относительной влажности (RH%) внутри рабочего объёма шкафа не должна превышать значение относительной влажности окружающей среды.
- **Router:** intent=SINGLE_FIELD_QUERY, route=UNKNOWN, mode=hybrid_wide
- **Contextual extract:** kind=undefined, applied=undefined, reject=—
- **Chunks in diagnostics:** 10
- **Top sources:** golden-facts-sdb1560m.md, golden-facts-sdb1560m.md, Руководство SDB1560NM.pdf, Руководство SDB1560NM.pdf

## gen.opt.feeder-basket-max

- **Primary (D):** Synthesis failure — Option qty wrong/incomplete *(confidence: medium)*
- **Question:** Максимальное число корзин питателей для SDB1560М?
- **Expected mode:** must_answer
- **Required facts:** 2
- **Failing layer:** factual
- **Missing/contradicted:** 2 (missing_or_negated)
- **Answer preview:** Максимальное число корзин питателей для модели SDB1560М — от 1 до 2.
- **Router:** intent=SINGLE_FIELD_QUERY, route=UNKNOWN, mode=hybrid_wide
- **Contextual extract:** kind=undefined, applied=undefined, reject=—
- **Chunks in diagnostics:** 14
- **Top sources:** golden-facts-sdb1560m.md, golden-facts-sdb1560m.md, Руководство SDB1560NM.pdf, Руководство SDB1560NM.pdf

## gen.opt.feeder-basket-min

- **Primary (D):** Synthesis failure — Option qty wrong/incomplete *(confidence: medium)*
- **Question:** Минимальное число корзин питателей для SDB1560М по опциям?
- **Expected mode:** must_answer
- **Required facts:** 1
- **Failing layer:** factual
- **Missing/contradicted:** 1 (missing_or_negated)
- **Answer preview:** Минимальное число корзин питателей для модели SDB1560М по опциям составляет 1.
- **Router:** intent=SINGLE_FIELD_QUERY, route=UNKNOWN, mode=hybrid_wide
- **Contextual extract:** kind=undefined, applied=undefined, reject=—
- **Chunks in diagnostics:** 12
- **Top sources:** golden-facts-sdb1560m.md, Руководство SDB1560NM.pdf, Руководство SDB1560NM.pdf, Руководство SDB1560NM.pdf

## gen.para.36m

- **Primary (D):** Synthesis failure — 36-month maintenance paraphrase → abstain *(confidence: high)*
- **Question:** Через сколько месяцев менять блок осушения по графику ТО?
- **Expected mode:** must_answer
- **Required facts:** 36
- **Failing layer:** factual
- **Answer preview:** В предоставленном контексте не указано конкретное время для замены блока осушения по графику технического обслуживания для модели SDB1560M. Необходимо обратиться к дополнительным источникам или руководству по эксплуатации для этой модели.
- **Router:** intent=SINGLE_FIELD_QUERY, route=UNKNOWN, mode=hybrid_wide
- **Contextual extract:** kind=undefined, applied=undefined, reject=—
- **Chunks in diagnostics:** 10
- **Top sources:** golden-facts-sdb1560m.md, golden-facts-sdb1560m.md, golden-facts-sdb1560m.md, Руководство SDB1560NM.pdf

## gen.para.desiccant-qty

- **Primary (D):** Synthesis failure — Wrong qty vs table 1.2 *(confidence: medium)*
- **Question:** Число блоков осушителя у SDB1560М в базовой комплектации?
- **Expected mode:** must_answer
- **Required facts:** 2
- **Failing layer:** factual
- **Missing/contradicted:** 2 (missing_or_negated)
- **Answer preview:** Число блоков осушителя у модели SDB1560М в базовой комплектации: 2.
- **Router:** intent=SINGLE_FIELD_QUERY, route=UNKNOWN, mode=hybrid_wide
- **Contextual extract:** kind=undefined, applied=undefined, reject=—
- **Chunks in diagnostics:** 10
- **Top sources:** golden-facts-sdb1560m.md, golden-facts-sdb1560m.md, golden-facts-sdb1560m.md, Руководство SDB1560NM.pdf

## gen.para.storage-w

- **Primary (D):** Synthesis failure — Paraphrase storage power → spurious abstain *(confidence: high)*
- **Question:** Сколько максимум ватт в режиме поддержания влажности без опций?
- **Expected mode:** must_answer
- **Required facts:** 8
- **Failing layer:** factual
- **Answer preview:** В документации на данную модель этот параметр не указан.
- **Router:** intent=SINGLE_FIELD_QUERY, route=UNKNOWN, mode=hybrid_wide
- **Contextual extract:** kind=undefined, applied=undefined, reject=—
- **Chunks in diagnostics:** 10
- **Top sources:** golden-facts-sdb1560m.md, golden-facts-sdb1560m.md, Руководство SDB1560NM.pdf, Руководство SDB1560NM.pdf

## gen.proc.door-fan-off

- **Primary (D):** Synthesis failure — Procedure question → abstain-like answer *(confidence: high)*
- **Question:** Что происходит с вентилятором осушителя при открытой двери?
- **Expected mode:** must_answer
- **Required facts:** отключ
- **Failing layer:** factual
- **Answer preview:** В контексте не указано конкретное действие, которое происходит с вентилятором осушителя при открытой двери. Однако, известно, что при открытии двери Шкафа звучит звуковой сигнал, и при закрытии двери Шкафа звуковой сигнал отключается. Информации о работе вентилятора осушителя при открытой двери нет.
- **Router:** intent=FACT_QUERY, route=REASONING_QA, mode=reasoning_causal
- **Contextual extract:** kind=undefined, applied=undefined, reject=—
- **Chunks in diagnostics:** 10
- **Top sources:** golden-facts-sdb1560m.md, golden-facts-sdb1560m.md, golden-facts-sdb1560m.md, Руководство SDB1560NM.pdf

## gen.proc.fan-symbol

- **Primary (D):** Synthesis failure — Fan symbol abstain-like *(confidence: high)*
- **Question:** Какой символ означает включённый вентилятор осушителя?
- **Expected mode:** must_answer
- **Required facts:** вентилятор
- **Failing layer:** factual
- **Grounding (co-fail):** required fact not found in evidence segments
- **Answer preview:** В предоставленном контексте не указан символ, который означает включённый вентилятор осушителя. Информация об этом не представлена в фрагментах.
- **Router:** intent=FACT_QUERY, route=REASONING_QA, mode=reasoning_causal
- **Contextual extract:** kind=undefined, applied=undefined, reject=—
- **Chunks in diagnostics:** 10
- **Top sources:** golden-facts-sdb1560m.md, golden-facts-sdb1560m.md, golden-facts-sdb1560m.md, Руководство SDB1560NM.pdf

## gen.proc.open-door-symbol

- **Primary (D):** Synthesis failure — LCD symbol answer hedges/abstains; символ «дверь» in manual *(confidence: high)*
- **Question:** Какой символ на LCD показывает открытую дверь?
- **Expected mode:** must_answer
- **Required facts:** двер
- **Failing layer:** factual
- **Grounding (co-fail):** required fact not found in evidence segments
- **Answer preview:** Символ, который на LCD индикаторе показывает открытую дверь Шкафа, не указан явно в предоставленном контексте. Однако, в описании символов на LCD индикаторе есть пункт, который относится к состоянию двери:

- символ - дверь Шкафа открыта. 

Таким образом,虽然上下文中没有明确指出LCD显示器上表示开门的符号，但可以得出结论，有一个特定的符号表示柜门打开。但由于符号本身没有被明确描述，
- **Router:** intent=FACT_QUERY, route=REASONING_QA, mode=reasoning_causal
- **Contextual extract:** kind=undefined, applied=undefined, reject=—
- **Chunks in diagnostics:** 10
- **Top sources:** golden-facts-sdb1560m.md, golden-facts-sdb1560m.md, golden-facts-sdb1560m.md, Руководство SDB1560NM.pdf

## gen.proc.sound-door

- **Primary (D):** Synthesis failure — Troubleshooting paraphrase → abstain-like answer *(confidence: high)*
- **Question:** Когда включается звуковая сигнализация по двери?
- **Expected mode:** must_answer
- **Required facts:** открыт
- **Failing layer:** factual
- **Answer preview:** В предоставленном контексте нет конкретной информации о том, когда включается звуковая сигнализация по двери. Однако, исходя из общих принципов работы подобных устройств, звуковая сигнализация по двери обычно включается при неплотном закрытии дверей или при их открытии во время работы шкафа. Для точной информации реком
- **Router:** intent=TROUBLESHOOTING_QUERY, route=TROUBLESHOOTING_QA, mode=troubleshooting_focused
- **Contextual extract:** kind=undefined, applied=undefined, reject=—
- **Chunks in diagnostics:** 14
- **Top sources:** Руководство SDB1560NM.pdf, Руководство SDB1560NM.pdf, Руководство SDB1560NM.pdf, Руководство SDB1560NM.pdf

## gen.rh.rule-below30

- **Primary (B):** Routing failure — Setpoint rule paraphrase; answer gives ambient-cap wording not −10 RH% rule; missing setpoint card route (cf Task 40 above30) *(confidence: medium)*
- **Question:** Для уставки 0–30 RH% установка не выше какой величины относительно окружающей?
- **Expected mode:** must_answer
- **Required facts:** 10
- **Failing layer:** factual
- **Missing/contradicted:** 10 (missing_or_negated)
- **Grounding (co-fail):** required fact not found in evidence segments
- **Answer preview:** Для уставки 0–30 RH%, влажность внутри рабочего объема Шкафа поддерживается не выше окружающей влажности.
- **Router:** intent=TROUBLESHOOTING_QUERY, route=TROUBLESHOOTING_QA, mode=troubleshooting_focused
- **Contextual extract:** kind=undefined, applied=undefined, reject=—
- **Chunks in diagnostics:** 10
- **Top sources:** Руководство SDB1560NM.pdf, Руководство SDB1560NM.pdf, Руководство SDB1560NM.pdf, retrieval-cards/humidity-time.md

## gen.spare.lock-excluded

- **Primary (D):** Synthesis failure — Spurious abstain on composition § *(confidence: high)*
- **Question:** Входит ли запасной замок на каждую дверь в перечень запасных частей для SDB1560M?
- **Expected mode:** must_answer
- **Required facts:** кроме.*1560|1560M\)
- **Failing layer:** factual
- **Answer preview:** В предоставленном контексте нет информации о перечне запасных частей для модели SDB1560M, включая наличие запасного замка на каждую дверь.
- **Router:** intent=FACT_QUERY, route=REASONING_QA, mode=reasoning_causal
- **Contextual extract:** kind=undefined, applied=undefined, reject=—
- **Chunks in diagnostics:** 10
- **Top sources:** golden-facts-sdb1560m.md, golden-facts-sdb1560m.md, golden-facts-sdb1560m.md, Руководство SDB1560NM.pdf

## gen.std.esd

- **Primary (A):** Retrieval failure — ESD clause not surfaced; family-manual noise in snippets *(confidence: high)*
- **Question:** Каким стандартам по ESD соответствует шкаф?
- **Expected mode:** must_answer
- **Required facts:** 61340
- **Failing layer:** factual
- **Missing/contradicted:** 61340 (missing_or_negated)
- **Answer preview:** Шкаф снабжен антистатическим тканевым браслетом с кнопкой (STUD) диаметром 4 мм и проводом для подключения, что соответствует требованиям по защите от статического электричества (ESD).
- **Router:** intent=FACT_QUERY, route=REASONING_QA, mode=reasoning_causal
- **Contextual extract:** kind=undefined, applied=undefined, reject=—
- **Chunks in diagnostics:** 10
- **Top sources:** Руководство SDB1560NM.pdf, Руководство SDB1560NM.pdf, Руководство SDB1560NM.pdf, Руководство SDB1560NM.pdf

## gen.unsup.blockchain

- **Primary (F):** Abstention failure — must_abstain *(confidence: high)*
- **Question:** Записывает ли шкаф данные в блокчейн?
- **Expected mode:** must_abstain
- **Required facts:** —
- **Failing layer:** abstention
- **Answer preview:** В предоставленном контексте нет информации о том, что шкаф SDB1560M записывает данные в блокчейн. Все упомянутые функции и характеристики шкафа не включают работу с блокчейн-технологиями.
- **Router:** intent=FACT_QUERY, route=REASONING_QA, mode=reasoning_causal
- **Contextual extract:** kind=undefined, applied=undefined, reject=—
- **Chunks in diagnostics:** 10
- **Top sources:** Руководство SDB1560NM.pdf, Руководство SDB1560NM.pdf, Руководство SDB1560NM.pdf, Руководство SDB1560NM.pdf

## gen.unsup.bluetooth

- **Primary (F):** Abstention failure — must_abstain; wording not in allowed patterns *(confidence: high)*
- **Question:** Есть Bluetooth для настройки?
- **Expected mode:** must_abstain
- **Required facts:** —
- **Failing layer:** abstention
- **Answer preview:** В документации не упоминается использование Bluetooth для настройки Шкафа SDB1560NM. Подключение осуществляется через кабель Ethernet и панель управления.
- **Router:** intent=FACT_QUERY, route=REASONING_QA, mode=reasoning_causal
- **Contextual extract:** kind=undefined, applied=undefined, reject=—
- **Chunks in diagnostics:** 10
- **Top sources:** golden-facts-sdb1560m.md, golden-facts-sdb1560m.md, golden-facts-sdb1560m.md, Руководство SDB1560NM.pdf

## gen.unsup.sdb151-mass-for-1560

- **Primary (F):** Abstention failure — must_abstain *(confidence: high)*
- **Question:** Сколько весит SDB151 — нужно для расчёта помещения под SDB1560М.
- **Expected mode:** must_abstain
- **Required facts:** —
- **Failing layer:** abstention
- **Answer preview:** Я специализируюсь только на модели SDB1560 M. Могу подсказать параметры и эксплуатацию именно этого устройства.
- **Chunks in diagnostics:** 0
- **Top sources:** —

## gen.unsup.serial-format

- **Primary (F):** Abstention failure — must_abstain *(confidence: high)*
- **Question:** Как расшифровать серийный номер на шильдике?
- **Expected mode:** must_abstain
- **Required facts:** —
- **Failing layer:** abstention
- **Answer preview:** **Серийный номер** шкафа **SDB1560NM** указан на **заводском знаке (табличке изделия)** (раздел **«Маркировка»**, рис. 1.2 РЭ).

На табличке также указаны: изготовитель, наименование и модель шкафа, напряжение питания, дата изготовления, страна-изготовитель, сведения о сертификатах.

**Формат серийного номера** (п. «Ма
- **Router:** intent=FACT_QUERY, route=REASONING_QA, mode=reasoning_causal
- **Chunks in diagnostics:** 0
- **Top sources:** —

## gen.unsup.warehouse-humidity-setpoint

- **Primary (F):** Abstention failure — must_abstain *(confidence: high)*
- **Question:** Какую влажность установить для хранения печатных плат без указания класса?
- **Expected mode:** must_abstain
- **Required facts:** —
- **Failing layer:** abstention
- **Answer preview:** Установленное значение относительной влажности внутри рабочего объема Шкафа для диапазона от 30RH% и выше должно быть не более RH%окр.ср. - 20RH%.
- **Router:** intent=SINGLE_FIELD_QUERY, route=UNKNOWN, mode=hybrid_wide
- **Contextual extract:** kind=undefined, applied=undefined, reject=—
- **Chunks in diagnostics:** 10
- **Top sources:** golden-facts-sdb1560m.md, golden-facts-sdb1560m.md, Руководство SDB1560NM.pdf, Руководство SDB1560NM.pdf

