# Task 32 — Task 31 grounding failure analysis (Stage A)

Source: `C:\Users\SOVAI\Documents\Work\QR\logs\baseline-task31\task27-regression-http-verified-v2\report.json`

Task 31 activated grounding on prompt chunk bodies. Failures below had **factual pass** except N2 timer.

## exp.num.mass.direct

- **Question:** Какой вес шкафа SDB1560M?
- **Answer preview:** **Масса** шкафа SDB1560NM — **260 кг** (табл. 1.1).
- **Factual:** pass — requiredFacts passed deterministic checks (not semantic accuracy)
- **Grounding (Task 31):** fail — answer facts not found in provided chunk bodies
- **chunkTextCount:** 10
- **extractKind:** mass
- **Classification:** grounding matcher limitation (joined-chunk alternate-numeric false conflict)

## exp.num.pwr-storage-8

- **Question:** Сколько ватт в режиме хранения?
- **Answer preview:** Максимальная потребляемая мощность SDB1560NM в режиме **хранения** без опций — **не более 8 Вт** (п. 1.1.2.7).
- **Factual:** pass — requiredFacts passed deterministic checks (not semantic accuracy)
- **Grounding (Task 31):** fail — answer facts not found in provided chunk bodies
- **chunkTextCount:** 10
- **extractKind:** power_storage
- **Classification:** grounding matcher limitation

## exp.num.pwr-dry-base-40

- **Question:** Мощность в режиме осушения без опций?
- **Answer preview:** Максимальная потребляемая мощность Шкафа SDB1560М в режиме осушения без установленных систем подачи азота и подогрева воздуха не более 40 Вт.
- **Factual:** pass — requiredFacts passed deterministic checks (not semantic accuracy)
- **Grounding (Task 31):** fail — answer facts not found in provided chunk bodies
- **chunkTextCount:** 10
- **extractKind:** —
- **Classification:** grounding matcher limitation

## exp.num.pwr-regen-540

- **Question:** Максимальная мощность при регенерации?
- **Answer preview:** Мощность в режиме **регенерации** для SDB1560NM — **не более 540 Вт** (раздел 1.1).
- **Factual:** pass — requiredFacts passed deterministic checks (not semantic accuracy)
- **Grounding (Task 31):** fail — answer facts not found in provided chunk bodies
- **chunkTextCount:** 10
- **extractKind:** power_regen
- **Classification:** grounding matcher limitation

## exp.num.shelf-load-100

- **Question:** Какая максимальная нагрузка на стандартную полку?
- **Answer preview:** Суммарная, распределенная нагрузка на каждую стандартную полку для шкафов SDB1560M не должна превышать 100 кг.
- **Factual:** pass — requiredFacts passed deterministic checks (not semantic accuracy)
- **Grounding (Task 31):** fail — answer facts not found in provided chunk bodies
- **chunkTextCount:** 10
- **extractKind:** —
- **Classification:** grounding matcher limitation

## exp.multi.mass-and-width

- **Question:** Масса и ширина шкафа SDB1560M?
- **Answer preview:** Масса шкафа SDB1560M составляет 260 кг, а ширина — 1202 мм.
- **Factual:** pass — requiredFacts passed deterministic checks (not semantic accuracy)
- **Grounding (Task 31):** fail — answer facts not found in provided chunk bodies
- **chunkTextCount:** 10
- **extractKind:** mass_and_dimensions
- **Classification:** grounding matcher limitation

## exp.para.dry-no-options

- **Question:** Сколько жрёт при осушении если без азота и подогрева?
- **Answer preview:** Мощность Шкафа SDB1560M в режиме осушения без системы подачи азота и подогрева воздуха составляет не более 40 Вт.

Шаги для определения потребляемой мощности в режиме осушения без азота и подогрева:
1. Убедитесь, что система подачи азота отключена.
2. Убедитесь, что система подогрева воздуха отключена.
3. Включите режи
- **Factual:** pass — requiredFacts passed deterministic checks (not semantic accuracy)
- **Grounding (Task 31):** fail — answer facts not found in provided chunk bodies
- **chunkTextCount:** 10
- **extractKind:** —
- **Classification:** grounding matcher limitation

## exp.maint.desicc-36mo

- **Question:** Как часто менять блок осушения?
- **Answer preview:** Блок осушения следует заменять каждые 36 месяцев.
- **Factual:** pass — requiredFacts passed deterministic checks (not semantic accuracy)
- **Grounding (Task 31):** fail — answer facts not found in provided chunk bodies
- **chunkTextCount:** 10
- **extractKind:** —
- **Classification:** grounding matcher limitation

## exp.leak.mass-180

- **Question:** Какая масса SDB1560M?
- **Answer preview:** **Масса** шкафа SDB1560NM — **260 кг** (табл. 1.1).
- **Factual:** pass — requiredFacts passed deterministic checks (not semantic accuracy)
- **Grounding (Task 31):** fail — answer facts not found in provided chunk bodies
- **chunkTextCount:** 10
- **extractKind:** mass
- **Classification:** grounding matcher limitation

## exp.num.pwr-storage-with-opt-810

- **Question:** Мощность в режиме хранения с азотом и подогревом?
- **Answer preview:** Максимальная потребляемая мощность SDB1560NM в режиме **хранения** с системами подачи азота и подогрева воздуха — **не более 810 Вт** (п. 1.1.2.7).
- **Factual:** pass — requiredFacts passed deterministic checks (not semantic accuracy)
- **Grounding (Task 31):** fail — answer facts not found in provided chunk bodies
- **chunkTextCount:** 10
- **extractKind:** power_storage_opt
- **Classification:** grounding matcher limitation

## exp.num.n2-timer-99

- **Question:** Какой максимум у таймера подачи азота без датчика?
- **Answer preview:** Максимальное значение таймера подачи азота **без датчика** (N2Ton) — **99,9 мин** (диапазон **0–99,9 мин**, п. 1.2.2).
- **Factual:** fail — missing or contradicted required facts
- **Grounding (Task 31):** fail — answer facts not found in provided chunk bodies
- **chunkTextCount:** 10
- **extractKind:** n2_option
- **Classification:** evaluator defect (ASCII decimal in claimPattern vs comma in answer/chunks)
