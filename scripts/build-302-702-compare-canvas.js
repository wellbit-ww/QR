const fs = require("fs");
const path = require("path");

const rows = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "_audit-temp", "cards-wave-compare-verdicts.json"), "utf8"),
);
const json = JSON.stringify(rows);

const src = `import {
  BarChart,
  Callout,
  CollapsibleSection,
  Grid,
  H1,
  H2,
  PieChart,
  Stack,
  Stat,
  Table,
  Text,
} from "cursor/canvas";

type Verdict = "ok" | "partial" | "fail";
type Row = { id: string; q: string; q702: string; a: Verdict; b: Verdict };

const GENERATED =
  "2026-09-04, 09:36–10:10 UTC+3 · живой POST /api/chat · 125 одинаковых вопросов";

const ROWS: Row[] = ${json};

const S302 = { ok: 108, partial: 8, fail: 9 };
const S702 = { ok: 77, partial: 14, fail: 34 };
const PREV302 = { ok: 97, partial: 13, fail: 15 };

function label(v: Verdict) {
  if (v === "ok") return "верно";
  if (v === "partial") return "частично";
  return "ошибка";
}

function tone(v: Verdict): "success" | "warning" | "danger" {
  if (v === "ok") return "success";
  if (v === "partial") return "warning";
  return "danger";
}

function pairTone(a: Verdict, b: Verdict): "success" | "warning" | "danger" | undefined {
  if (a === "fail" && b === "fail") return "danger";
  if (a !== b) return "warning";
  return undefined;
}

const bothFail = ROWS.filter((r) => r.a === "fail" && r.b === "fail");
const only302 = ROWS.filter((r) => r.a === "ok" && r.b !== "ok");
const only702 = ROWS.filter((r) => r.b === "ok" && r.a !== "ok");
const adapted = ROWS.filter((r) => r.q !== r.q702);

export default function Sdb302Vs702CardsWave() {
  return (
    <Stack gap={24}>
      <Stack gap={8}>
        <H1>SDB302NM vs SDB702NM: один набор из 125 вопросов</H1>
        <Text tone="secondary">
          {GENERATED}. Экспертная оценка ответов, не keyword-score. Вопросы 302
          взяты из прошлого отчёта (75 + 50). Для 702 те же формулировки; цифры
          и ловушки подставлены под модель: 743 л / 90 кг / 1952 мм / 7 полок / 3 двери.
        </Text>
      </Stack>

      <Callout tone="info" title="Что сравнивали">
        Живой чат на :3000. 302 — каталог w-700 после детерминированных фактов
        (цех +12, корпус ~100 °C, колёса, W, зелёный). 702 — профиль sdb702-nm
        без этих доработок. Утечки чужих ТТХ в этом прогоне не было.
      </Callout>

      <Grid columns={4} gap={12}>
        <Stat value="108 / 125" label="302 верно" tone="success" />
        <Stat value="77 / 125" label="702 верно" tone="warning" />
        <Stat value="9 vs 34" label="Ошибок 302 / 702" tone="danger" />
        <Stat value="+11" label="302 к прошлому отчёту (было 97)" tone="success" />
      </Grid>

      <Grid columns={2} gap={20}>
        <Stack gap={8}>
          <H2>SDB302NM</H2>
          <PieChart
            donut
            size={180}
            data={[
              { label: "Верно", value: S302.ok, tone: "success" },
              { label: "Частично", value: S302.partial, tone: "warning" },
              { label: "Ошибка", value: S302.fail, tone: "danger" },
            ]}
          />
          <Text tone="secondary" size="small">
            Прошлый отчёт: {PREV302.ok} / {PREV302.partial} / {PREV302.fail}
          </Text>
        </Stack>
        <Stack gap={8}>
          <H2>SDB702NM</H2>
          <PieChart
            donut
            size={180}
            data={[
              { label: "Верно", value: S702.ok, tone: "success" },
              { label: "Частично", value: S702.partial, tone: "warning" },
              { label: "Ошибка", value: S702.fail, tone: "danger" },
            ]}
          />
          <Text tone="secondary" size="small">
            ТТХ (объём, масса, габариты, полки, двери) — свои цифры, без 302.
          </Text>
        </Stack>
      </Grid>

      <H2>Верно / частично / ошибка</H2>
      <BarChart
        categories={["Верно", "Частично", "Ошибка"]}
        series={[
          { name: "SDB302NM", values: [S302.ok, S302.partial, S302.fail], tone: "success" },
          { name: "SDB702NM", values: [S702.ok, S702.partial, S702.fail], tone: "warning" },
        ]}
        height={220}
        showValues
      />
      <Text tone="secondary" size="small">
        Источник: живой /api/chat · 125 пар · экспертная оценка 2026-09-04
      </Text>

      <H2>Где 302 сильнее (32 вопроса)</H2>
      <Text>
        Карточки поиска и свежие факты 302. На 702 те же живые формулировки
        ломаются: отказ, чужой матчер или выдумка.
      </Text>
      <Table
        headers={["id", "Вопрос", "302", "702"]}
        striped
        stickyHeader
        rows={only302.map((r) => [r.id, r.q, label(r.a), label(r.b)])}
        rowTone={only302.map((r) => tone(r.b))}
      />

      <H2>Единственный плюс 702</H2>
      <Table
        headers={["id", "Вопрос", "302", "702"]}
        rows={only702.map((r) => [r.id, r.q, label(r.a), label(r.b)])}
        rowTone={only702.map(() => "success" as const)}
      />
      <Text tone="secondary">
        «Только купил, с чего начать?» — 702 дал тумблер и 220 В, 302 ушёл в общие советы про солнце.
      </Text>

      <H2>Оба ошиблись (8)</H2>
      <Table
        headers={["id", "Вопрос", "В чём промах"]}
        striped
        rows={[
          ["talk-temp-button", "Температура на циферблате", "302 выдумал внешние термометры; 702 отказался. Нужна кнопка DN."],
          ["n50-dn-temp", "Температура кнопкой DN?", "Оба отказали, хотя в РЭ температура — DN."],
          ["n50-regen-length", "Регенерация сколько минут?", "В РЭ длительность не указана. 302 подставил 3 часа влажности, 702 — 285 Вт."],
          ["n50-n2-timer", "Таймер азота без датчика", "Оба ушли в таймер двери Ррег, а не 0–99,9 мин."],
          ["n50-door-signal", "Звук и красный при открытой двери", "Оба сказали только звук. Красный индикатор в РЭ есть."],
          ["n50-shop-15", "Цех ровно +15", "Нижняя граница диапазона. Оба не сказали это прямо."],
          ["n50-ambient-humidity", "Влажность помещения", "В РЭ не более 80 %. Оба отказали."],
          ["n50-store-warehouse", "Склад рядом с кислотами", "Раздел 5: без паров кислот. Оба ушли в общие предосторожности."],
        ]}
        rowTone={bothFail.map(() => "danger" as const)}
      />

      <H2>Адаптация ловушек 302 → 702</H2>
      <Table
        headers={["id", "Вопрос в чате 302", "Вопрос в чате 702"]}
        rows={adapted.map((r) => [r.id, r.q, r.q702])}
      />

      <CollapsibleSection title="Все 125 вопросов" count={125} defaultOpen>
        <Table
          headers={["#", "id", "Вопрос (чат 302)", "302", "702"]}
          striped
          stickyHeader
          rows={ROWS.map((r, i) => [String(i + 1), r.id, r.q, label(r.a), label(r.b)])}
          rowTone={ROWS.map((r) => pairTone(r.a, r.b))}
        />
      </CollapsibleSection>
    </Stack>
  );
}
`;

const out = path.join(
  process.env.USERPROFILE || "",
  ".cursor/projects/c-Users-SOVAI-Documents-Work-QR/canvases/sdb302-vs-sdb702-cards-wave.canvas.tsx",
);
fs.writeFileSync(out, src);
console.log("wrote", out, src.length);
