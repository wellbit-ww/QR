/**
 * Морфологически устойчивые паттерны для golden-router SDB1106NM.
 * Stem-регексы («полок», «полки», «перфорирован») вместо точных подстрок.
 */

/** @type {Record<string, RegExp>} */
const TERM = Object.freeze({
  shelf: /(?:полок|полк(?:а|и|е|у|ой|ами|ах|ов|ам)?|полоч|перфорир)/iu,
  kitSupply: /(?:комплект|поставк|комплектац|базов(?:ой|ая|ую|ое)?\s*(?:комплект|исполнен|поставк)|состав\s+поставк|в\s+комплект|комплектующ|коробк|завод|упаков|с\s+завода|штатн[\p{L}]*\s+(?:комплектац|ид[её]т|поставля)|заводск[\p{L}]*\s+комплектац|поставля[\p{L}]*\s+(?:со|с)\s+шкаф)/iu,
  quantity: /(?:сколько|количеств|число|скольк|идет|входит|входят|набор|скольк[оа]|штук|шт\.?)/iu,
  cabinet: /(?:sdb1106|шкаф|сух(?:ого|ой)?\s+хранен|данн(?:ого|ой|ый|ая|ым)?\s+шкаф|сушильн\w*\s+шкаф)/iu,
  load: /(?:нагрузк|грузопод|выдерж|лимит|масс|вес(?!\w|т[ия])|кг|килограм|\bкило\b|держит|перегруз|допустим|можно\s+(?:класть|положить|ставить)|сколько\s+(?:класть|положить|ставить))/iu,
  reinforced: /усилен/iu,
  standard: /(?:стандарт|обычн|штатн)/iu,
  cutout: /(?:укорочен|вырез|подогрев|обрезан)/iu,
  drawer: /(?:выдвиж|выкатн)/iu,
  massCabinet: /(?:масс(?:а|у|ы|ой)?(?!\w)|вес(?:а|у|ом)?(?!\w|т[ия])|сколько\s+весит|каков\s+вес|какая\s+масса|насколько\s+тяж[её]л)/iu,
  width: /ширин/iu,
  height: /(?:высот|опор)/iu,
  depth: /глубин/iu,
  dimensions: /(?:габарит|размер|табл(?:иц)?[аы]?\s*1\.1)/iu,
  power: /(?:мощност|потребля|потреблен|ватт|(?<=\d)\s*вт|энергопотреб|пиков|жр[её]т|ест\s+по\s+электрич|сколько\s+(?:бер[её]т|тянет)\s+(?:энерг|электрич)|расход\s+(?:электрич|энерг))/iu,
  storageMode: /хранен/iu,
  dryingMode: /(?:осуш|осушени)/iu,
  regenMode: /регенерац/iu,
  voltage: /(?:напряжен|\b220\b.*(?:в|вольт)|питающ(?:ей|ая)\s+сет|вольт|от\s+скольк|какая\s+сеть|сеть\s+питан)/iu,
  frequency: /(?:частот|\bгц\b|герц)/iu,
  grounding: /(?:заземл|заземляющ)/iu,
  groundingResistance: /(?:сопротивлен.*заземл|заземляющ.*контур)/iu,
  humidity: /(?:влажност|влаго|%rh|\brh\b|относительн\w*\s+влажн)/iu,
  humidityStep: /(?:шаг.*(?:влажност|rh)|(?:влажност|rh).*шаг|шаг\s+установ|шаг\s+rh|дискретност.*(?:влажност|rh))/iu,
  humidityLimit: /(?:предельн|максимальн|поддержива|диапазон).*(?:влажност|rh)|(?:влажност|rh).*(?:предельн|максимальн|поддержива|диапазон)/iu,
  ip: /(?:\bip\b|\bип\b|класс\s+защиты|степень\s+защиты|ip65|поражен.*током|электрическ.*ток)/iu,
  coat: /(?:ral\s*7035|цвет.*(?:покрыт|окраск)|порошков.*покрыт|ral7035|\bral\b.*покрыт|покрыт.*\bral\b)/iu,
  doorGlass: /(?:прозрач|вставк.*двер|стекл.*двер|материал.*(?:двер|встав|окон)|смотров.*ок)/iu,
  zeolite:
    /(?:цеолит|поглотител|адсорбент|гранулят|химическ.*вещ.*влаг|влаго.*погло|влагу.*погло|поглощ[а-яё]*.*влаг|вытягива.*влаг|влагу.*вытяг|чем.*влагу|че.*влагу.*погло)/iu,
  zeoliteMaintenance: /(?:замен|меня|ресурс|обслужив|частот|регламент|интервал|\bто\b|часов|тысяч\s+час|как\s+часто)/iu,
  regenDuration: /(?:цикл|длит|сколько\s+времен|минут|полн|продолжительност)/iu,
  nitrogen: /(?:азот|\bn\s*2\b)/iu,
  nitrogenPressure: /(?:давлен|(?<![а-яё])бар(?![а-яё])|\d\s*бар|мпа|максимум)/iu,
  inspection: /(?:осмотр|осматр|визуальн|смотр|провер)/iu,
  powerOff: /(?:отключ|220|кабел|электропитан|заземл|вилк|розетк|включен|включён|под\s+напряжен|питан)/iu,
  doorSound: /(?:звук|сигнализац|сигнал|пищит|писк|зуммер|сирен)/iu,
  door: /(?:двер|створк)/iu,
  liquidDesiccant: /(?:жидк|как\s+(?:именно\s+)?осуш|метод\s+осуш|происходит\s+осуш|химическ.*осуш)/iu,
  sensorBrand: /(?:производител|производит|бренд|комpan|siemens|honeywell|немецк|японск|кто\s+делает)/iu,
  sensor: /датчик/iu,
  chamberTemp: /(?:диапазон.*температур|рабоч.*температур|температур.*(?:внутр|рабоч|камер))/iu,
  ambientTemp: /(?:условия\s+эксплуатац|температур.*окружающ|влажност.*помещен)/iu,
  atmosphericPressure:
    /(?:атмосфер(?:ное|ного)?\s+давлен|давлен(?:ие|ия)?\s+атмосфер|\bкпа\b|мм\s*рт(?:\.|\s*ст)?)/iu,
  lowAmbientTemp: /(?:\+\s*)?(?:1[0-4]|\d)\s*(?:°|°c|,|\b)|опустил|ниже.*15|минимально\s+допустим|градус|холод/iu,
  explosive: /(?:взрыво|(?:легко)?воспламен|горюч.*(?:материал|вещ))/iu,
  esd: /(?:\besd\b|61340|гост|антистат)/iu,
  esdCoat: /(?:антистат|esd|покрыт|esd-покрыт|стандарт|норматив)/iu,
  location: /(?:где|располож|находится|на\s+корпус|как\s+найти|как\s+отыскать|на\s+какой\s+сторон)/iu,
  switch: /(?:выключ|тумблер|рубильник|вилк|разъем|разъём)/iu,
  surge: /(?:перепад|скачок|стабилиз|защит.*напряжен)/iu,
  powerOn: /(?:как\s+включ|включить\s+шкаф|включение\s+шкаф|порядок\s+включ|запустить\s+шкаф|запуск\s+шкаф|подать\s+питани|ввести\s+в\s+работ|начать\s+работу\s+шкаф|как\s+запитать|как\s+активир)/iu,
  volume: /(?:объем|объём)/iu,
  liters: /(?:литр|\bл\b)/iu,
  options: /(?:опци|азот|подогрев)/iu,
  heatingAirTemp:
    /(?:подогрев\s+воздух|опци[яи]?\s*«?\s*подогрев|систем[аы]\s+подогрева|температур.*нагрев|нагрев.*(?:воздух|в\s+опци)|максимальн.*(?:температур|нагрев)|можно\s+выставить.*температур)/iu,
  climatic: /(?:климатическ\w*|гост\s*15150|ухл|категори\w*\s+размещ|исполнен\w*\s+климат|паспорт|книжк|в\s+начал)/iu,
  mainSwitch:
    /(?:основн\w*\s+(?:тумблер|выключател)|тумблер.*(?:питан|электропитан)|выключател.*электропитан)/iu,
});

/**
 * Устраняет типографические различия, не выполняя нечёткого поиска.
 * Так правило не пропустит тот же самый вопрос из-за «ё», неразрывного
 * пробела или другого символа дефиса, но не начнёт угадывать опечатки.
 */
function normalizeRuleText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/ё/giu, "е")
    .replace(/[\u2010-\u2015\u2212]/gu, "-")
    .replace(/[\u00A0\u202F]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function mergeUserContext(message, history = []) {
  const recent = (Array.isArray(history) ? history : [])
    .filter((e) => e?.role === "user" && typeof e.content === "string")
    .slice(-2)
    .map((e) => normalizeRuleText(e.content))
    .join(" ");
  return normalizeRuleText(`${recent} ${normalizeRuleText(message)}`);
}

function hasTerm(text, name) {
  const re = TERM[name];
  return re ? re.test(normalizeRuleText(text)) : false;
}

function hasAnyTerm(text, names) {
  return names.some((name) => hasTerm(text, name));
}

function hasAllTerms(text, names) {
  return names.every((name) => hasTerm(text, name));
}

function hasCabinetContext(message, history = []) {
  return hasTerm(mergeUserContext(message, history), "cabinet");
}

function isShelfLoadQuery(message) {
  const m = String(message || "");
  if (/не\s+про\s+нагрузк|не\s+про\s+масс|не\s+нагрузк|без\s+нагрузк/i.test(m)) {
    return false;
  }
  return hasTerm(m, "shelf") && hasTerm(m, "load");
}

function isPowerCordLengthQuery(message) {
  const m = String(message || "");
  if (/осмотр|визуальн|заземл|можно\s+ли\s+смотрет/i.test(m)) {
    return false;
  }
  return /(?:шнур|провод|кабел|длин).*(?:питан|комплект)|длин.*(?:шнур|провод|кабел)|(?:шнур|провод|кабел).*питан/iu.test(m);
}

function isKitShelfCountQuery(message, history = []) {
  const currentMessage = normalizeRuleText(message);
  const m = mergeUserContext(message, history);
  // Контекст нужен для модели/шкафа, но не должен превращать текущий
  // вопрос о количестве полок в вопрос о нагрузке из предыдущей реплики.
  if (isShelfLoadQuery(currentMessage)) {
    return false;
  }
  if (hasTerm(m, "shelf") && /(?:\bмм\b|миллиметр|регулир.*высот|на\s+сколько|шаг.*полк)/iu.test(m)) {
    return false;
  }
  const kitShelfSignal =
    (hasTerm(m, "quantity") && (hasTerm(m, "shelf") || hasTerm(m, "standard"))) ||
    (hasTerm(m, "shelf") && hasTerm(m, "kitSupply")) ||
    (hasTerm(m, "kitSupply") && (hasTerm(m, "shelf") || hasTerm(m, "standard")));
  if (!kitShelfSignal) {
    return false;
  }
  // В чате SDB1106NM «базовая поставка + полки» достаточно без явного «шкаф».
  if (hasTerm(m, "kitSupply") && hasTerm(m, "shelf")) {
    return true;
  }
  return hasTerm(m, "cabinet");
}

function isMassCabinetQuery(message) {
  const m = String(message || "");
  if (/осмотр|внешний|визуальн|проверк/i.test(m)) {
    return false; // Исключаем ложное срабатывание на слова вроде "произВЕСТИ" -> "вес" или "МАССштаб"
  }
  if (isShelfLoadQuery(m)) {
    return false;
  }
  return hasTerm(m, "massCabinet");
}

function isDimensionQuery(message) {
  const m = String(message || "");
  if (isShelfLoadQuery(m)) {
    return false;
  }
  if (isPowerCordLengthQuery(m)) {
    return false;
  }
  if (hasTerm(m, "shelf") && hasAnyTerm(m, ["height", "standard"])) {
    return false;
  }
  if (/длин(?!а\s+волны)/iu.test(m) && /шнур|кабел.*питан|питан.*кабел/iu.test(m)) {
    return false;
  }
  return hasAnyTerm(m, ["width", "height", "depth", "dimensions", "massCabinet"]);
}

function isLocationSwitchQuery(message) {
  const m = String(message || "");
  return hasTerm(m, "location") && hasTerm(m, "switch");
}

function isVoltageSurgeQuery(message) {
  const m = String(message || "");
  if (
    hasTerm(m, "humidity") &&
    !/(?:напряжен|220\s*в|вольт|электросет|сет(?:и|ев|ев)|перепад\s+напряжен|скачок\s+напряжен)/iu.test(m)
  ) {
    return false;
  }
  if (/скачок|перепад|стабилиз/iu.test(m) && /влажност|%rh|\brh\b/iu.test(m)) {
    return false;
  }
  return (
    (hasTerm(m, "voltage") && hasTerm(m, "surge")) ||
    /(?:перепад|скачок|просадк|миган).{0,40}(?:напряжен|электросет|сет(?:и|ев)|220\s*в|вольт)/iu.test(m) ||
    /(?:напряжен|электросет).{0,40}(?:перепад|скачок|просадк|миган)/iu.test(m) ||
    /стабилиз.{0,25}(?:напряжен|сет)/iu.test(m) ||
    /защит.{0,30}напряжен/iu.test(m)
  );
}

function isExternalInspectionProcedureQuery(message) {
  const m = String(message || "");
  if (!hasTerm(m, "inspection")) {
    return false;
  }
  if (
    hasTerm(m, "inspection") &&
    hasTerm(m, "powerOff") &&
    /можно|нужно|должен|при\s+включ|включен|под\s+напряжен/i.test(m)
  ) {
    return false;
  }
  return (
    /внешн|визуальн|как\s+произвест|порядок\s+осмотр|2\.2\.2/i.test(m) ||
    (/осмотр|проверк/i.test(m) && /шкаф|корпус|уплотн|осушител|замк/i.test(m))
  );
}

function isPanelGreenIndicatorQuery(message, history = []) {
  const raw = String(message || "").trim();
  const m = mergeUserContext(message, history);
  if (isTricolorIndicatorQuery(m) || isPanelIndicatorColorsQuery(m)) {
    return false;
  }
  if (/^а\s+если\s+зелен|^а\s+если\s+зелён|^если\s+зелен|^если\s+зелён/iu.test(raw)) {
    return /(?:желт|жёлт|красн|индикатор|ламп|мигает|горит)/iu.test(m);
  }
  return (
    /(?:зелен|зелён)/iu.test(m) &&
    /(?:индикатор|горит|свет|ламп|огон[её]к|мигает|означа|сигнал)/iu.test(m)
  );
}

function isDamperRelatedQuery(message) {
  return /заслонк/i.test(String(message || ""));
}

function isNitrogenSupplyContext(message) {
  const m = String(message || "");
  return hasTerm(m, "nitrogen") && /(?:питан|подач|давлен|бар|мпа|магистрал|опци)/iu.test(m);
}

function isDesiccantIdentityQuery(message) {
  const m = String(message || "");
  if (hasAnyTerm(m, ["regenDuration", "zeoliteMaintenance"]) || hasTerm(m, "liquidDesiccant")) {
    return false;
  }
  if (hasTerm(m, "regenMode") && hasTerm(m, "regenDuration")) {
    return false;
  }
  return hasTerm(m, "zeolite");
}

/** Материал корпуса шкафа (п. 1.1.4.2), не стекло в дверях и не цеолит. */
function isCabinetBodyMaterialQuery(message) {
  const m = String(message || "");
  if (
    /двер|стекл|вставк|прозрач|окон|смотров/i.test(m) &&
    !/(?:корпус|полк|навес)/i.test(m)
  ) {
    return false;
  }
  if (
    /из\s+какого\s+материал.*корпус|корпус.*из\s+какого\s+материал|из\s+чего\s+(?:сделан|выполнен)\s+корпус/i.test(
      m
    )
  ) {
    return true;
  }
  if (/корпус.*(?:стал|сталь)|(?:стал|сталь).*корпус/i.test(m) && !/покрыт|ral|окраск|цвет/i.test(m)) {
    return true;
  }
  return /материал/i.test(m) && /корпус|шкаф/i.test(m) && !/покрыт|ral|окраск|цвет/i.test(m);
}

function isRegenModeOverviewQuery(message) {
  const m = String(message || "");
  if (!/регенерац/iu.test(m)) {
    return false;
  }
  if (isRegenActivationQuery(m) || isRegenDurationQuery(m)) {
    return false;
  }
  if (/мощност|540\s*вт|(?<=\d)\s*вт/i.test(m) && !/(?:что\s+происход|опиш|кратко|расскаж)/iu.test(m)) {
    return false;
  }
  return /(?:что\s+происход|что\s+такое|опиш|кратко|расскаж|как\s+работ|для\s+чего|зачем|процесс|смысл|режим\s+«?регенерац)/iu.test(
    m
  );
}

function isRegenActivationQuery(message) {
  const m = String(message || "");
  if (!/(?:регенерац|восстановлен.*осуш)/iu.test(m)) {
    return false;
  }
  if (
    /цикл|длит|сколько\s+времен|полн.*цикл/iu.test(m) &&
    !/rh%|услов|когда|при\s+как|активир|запуск|30|−1|1\s*rh|порог/iu.test(m)
  ) {
    return false;
  }
  return /rh%|услов|когда|в\s+каком\s+случае|при\s+как|активир|запуск|30\s*мин|−1|1\s*rh|порог/iu.test(m);
}

function isRegenDurationQuery(message) {
  const m = String(message || "");
  if (/мощност|потребля|ватт|(?<=\d)\s*вт\b/iu.test(m)) {
    return false;
  }
  return (
    /регенерац/iu.test(m) &&
    /цикл|длит|сколько\s+времен|сколько\s+идет|как\s+долго|долго\s+ли|минут|полн|время\s+регенерац/iu.test(m) &&
    !isRegenActivationQuery(m)
  );
}

function isHeatingOptionMountQuery(message) {
  const m = String(message || "");
  if (isShelfLoadQuery(m)) {
    return false;
  }
  if (!/подогрев|нагрев\s+воздух/i.test(m)) {
    return false;
  }
  if (/(?:температур|градус|°\s*[сc]|максимальн.*темп|до\s+скольк)/iu.test(m)) {
    return false;
  }
  return /(?:монтаж|монтир|устанавл|ставится|замен|укорочен|вариант|1\.2\.1\.3|две\s+пол|2\s+пол|как\s+став)/iu.test(m);
}

function isNitrogenOptionDimensionsQuery(message) {
  const m = String(message || "");
  return hasTerm(m, "nitrogen") && /габарит|размер|ширин|высот|глубин/iu.test(m);
}

/** Контроль концентрации азота с датчиком (п. 1.2.2.5, 2.3.2.3) — не путать с таймером без датчика. */
function isNitrogenConcentrationControlQuery(message) {
  const m = String(message || "");
  const hasNitrogenTopic =
    hasTerm(m, "nitrogen") || /n2%|концентрац.*азот|азот.*концентрац/i.test(m);
  if (!hasNitrogenTopic) {
    return false;
  }
  if (/таймер/i.test(m) && !/контрол|как\s+работ|алгоритм/i.test(m)) {
    return false;
  }
  return (
    (/концентрац|процент\s*(?:азот|n2)|(?:азот|n2)\s*%/i.test(m) &&
      /(?:как\s+работ|контрол|алгоритм|принцип|систем|измеря)/iu.test(m)) ||
    (/датчик\s+(?:азот|n2)/i.test(m) && /(?:как\s+работ|контрол|измеря)/iu.test(m))
  );
}

/** Настройка ротаметров / постоянного расхода азота (п. 2.3.1.2) — не путать с таймером и датчиком N₂. */
function isNitrogenRotameterSetupQuery(message) {
  const m = String(message || "");
  if (
    /ротаметр|рпос|рпост|ррег/i.test(m) &&
    /(?:настро|установ|регулир|расход)/iu.test(m)
  ) {
    return true;
  }
  if (!hasTerm(m, "nitrogen")) {
    return false;
  }
  if (/концентрац|датчик\s+азот|n2%|как\s+работает\s+контрол/i.test(m)) {
    return false;
  }
  if (/таймер/i.test(m) && !/ротаметр|расход/i.test(m)) {
    return false;
  }
  if (/ротаметр/i.test(m)) {
    return true;
  }
  return /(?:настро|установ|регулир)/iu.test(m) && /(?:постоянн|расход)/iu.test(m);
}

/** Подключение опции азота (п. 2.2.1.5, 2.3.1.1) — не путать с вопросом только о давлении. */
function isNitrogenConnectQuery(message) {
  const m = String(message || "");
  if (!hasTerm(m, "nitrogen")) {
    return false;
  }
  if (!/(?:подключ|присоедин|подсоедин|подвест)/iu.test(m)) {
    return false;
  }
  if (
    /(?:сколько\s+бар|максимум.*бар|не\s+порв|макс\.?\s*давлен)/iu.test(m) &&
    !/(?:трубк|8\s*мм|как\s+подключ)/iu.test(m)
  ) {
    return false;
  }
  return (
    /как\s+(?:подключ|присоедин|подсоедин|подвести)/iu.test(m) ||
    /(?:систем|подач|опци|магистрал|трубк)/iu.test(m)
  );
}

function isWindowCleaningQuery(message) {
  const m = String(message || "");
  return /(?:протир|очист|мыть|мойк|чем\s+(?:протер|очист))/iu.test(m) && /(?:окн|стекл|смотров|двер)/iu.test(m);
}

function isEsdBraceletQuery(message) {
  const m = String(message || "");
  return /браслет/iu.test(m) && /(?:антистат|esd|комплект|надев|работ|плат|заземлен|провод)/iu.test(m);
}

function isDryStorageSoftwareQuery(message) {
  return /dry\s*storage/iu.test(String(message || ""));
}

function isTricolorIndicatorQuery(message) {
  const m = String(message || "");
  return (
    (/(?:трех|трёх)\s*цвет/iu.test(m) && /(?:индикатор|индикац|светофор|колонн)/iu.test(m)) ||
    /светофор/iu.test(m)
  );
}

function isPanelIndicatorColorsQuery(message) {
  const m = String(message || "");
  if (isTricolorIndicatorQuery(m)) {
    return false;
  }
  const hasYellow = /(?:желт|жёлт)/iu.test(m);
  const hasRed = /красн/iu.test(m);
  if (hasYellow && hasRed) {
    return /(?:индикатор|означа|сигнализ|свет|ламп|огон[её]к)/iu.test(m);
  }
  if (hasYellow || hasRed) {
    return false;
  }
  return (
    /(?:цвет[ао]\s+индикатор|расшифр.*индикатор)/iu.test(m) &&
    /(?:панел|шкаф|sdb)/iu.test(m)
  );
}

function isPanelYellowIndicatorQuery(message) {
  const m = String(message || "");
  if (isTricolorIndicatorQuery(m) || isPanelIndicatorColorsQuery(m)) {
    return false;
  }
  return (
    /(?:желт|жёлт)/iu.test(m) &&
    /(?:индикатор|горит|свет|ламп|огон[её]к|мигает|означа)/iu.test(m)
  );
}

function isPanelRedIndicatorQuery(message) {
  const m = String(message || "");
  if (isTricolorIndicatorQuery(m) || isPanelIndicatorColorsQuery(m)) {
    return false;
  }
  return (
    /красн/iu.test(m) &&
    /(?:индикатор|горит|свет|ламп|огон[её]к|мигает|означа)/iu.test(m)
  );
}

function isBasicKitSupplyQuery(message, history = []) {
  const m = mergeUserContext(message, history);
  if (
    isDesiccatorKitCountQuery(m) ||
    isLockKeysKitQuery(m) ||
    isDocumentPocketQuery(m) ||
    isDryStorageSoftwareQuery(m) ||
    isTricolorIndicatorQuery(m)
  ) {
    return false;
  }
  if (isKitShelfCountQuery(m, history)) {
    return false;
  }
  if (!hasTerm(m, "kitSupply")) {
    return false;
  }
  if (hasTerm(m, "shelf")) {
    return false;
  }
  return /(?:что\s+(?:полностью\s+)?входит|полностью\s+входит|что\s+(?:лежит|положили)|состав|перечень|что\s+ид[её]т|входит\s+в\s+(?:базов|комплект)|комплект\s+поставк)/iu.test(
    m
  );
}

function isDocumentPocketQuery(message) {
  const m = String(message || "");
  return (
    (/карман/iu.test(m) && /документ|а4/iu.test(m)) ||
    (/бумаг/iu.test(m) && /а4/iu.test(m) && /куда\s+(?:полож|убрат|класть)/iu.test(m))
  );
}

function isDesiccatorKitCountQuery(message) {
  const m = String(message || "");
  return (
    /(?:осушител|модул[\p{L}]*\s+осуш)/iu.test(m) &&
    /(?:сколько|количеств|число|входит|комплект)/iu.test(m) &&
    !/(?:замен|ресурс|\bто\b|часов|тысяч)/iu.test(m)
  );
}

function isLockKeysKitQuery(message) {
  const m = String(message || "");
  if (/(?:замен|дубликат|изготовител|заказать)/iu.test(m)) {
    return false;
  }
  return (
    (/ключ/iu.test(m) && /замок|замк/iu.test(m)) ||
    (/комплект\s+ключ/iu.test(m) && /(?:сколько|количеств|число|входит|замок|замк)/iu.test(m))
  );
}

function isShelfMaterialQuery(message) {
  const m = String(message || "");
  return /материал/iu.test(m) && /(?:полк|навес)/iu.test(m) && !/двер|стекл|вставк/i.test(m);
}

function isLoadingWallClearanceQuery(message) {
  const m = String(message || "");
  if (/50\s*мм.*стен|стен.*50\s*мм/iu.test(m)) {
    return true;
  }
  return (
    /(?:минимальн|расстояни|зазор|отступ)/iu.test(m) &&
    /(?:стенок|стен(?:ы|у|а)?\s+шкаф)/iu.test(m) &&
    /(?:загруз|погруз|разгруз|размещ|класт|полож|уклад)/iu.test(m)
  );
}

function isLoadingRulesQuery(message) {
  const m = String(message || "");
  if (isLoadingWallClearanceQuery(m)) {
    return false;
  }
  return (
    /(?:погрузочн|разгрузочн|загрузк.*шкаф|50\s*мм.*стен)/iu.test(m) ||
    (/(?:запрещ|нельзя|не\s+следует)/iu.test(m) && /(?:погруз|разгруз|размещ|полк|выдвижн)/iu.test(m)) ||
    (/выступа[а-яё]*\s+за\s+кра[а-яё]*\s+полк/iu.test(m) &&
      /(?:что\s+ещ[её]|2\.1|п\.?\s*2\.1)/iu.test(m))
  );
}

function isKitWheelsFeetQuery(message) {
  const m = String(message || "");
  return (
    /(?:колес|колёс|ножк)/iu.test(m) &&
    /(?:сколько|зачем|комплект|табл|1\.2|50\s*мм|регулир)/iu.test(m)
  );
}

function isWheelsUpgradeQuery(message) {
  const m = String(message || "");
  return /(?:дооснаст|установ|постав)/iu.test(m) && /(?:колес|колёс)/iu.test(m);
}

function isCabinetWeldedConstructionQuery(message) {
  const m = String(message || "");
  return /сварн|сборн.*конструкц/i.test(m) && /1\.1\.4\.2|конструкц|шкаф/i.test(m);
}

function isDoorMagneticSealsQuery(message) {
  const m = String(message || "");
  return /магнитн/i.test(m) && /уплотнит/i.test(m);
}

function isDoorSensorPurposeQuery(message) {
  const m = String(message || "");
  return (
    /датчик/i.test(m) &&
    /(?:открыт|закрыт|косяк|двер)/i.test(m) &&
    /(?:зачем|для\s+чего|назначен|нужн)/i.test(m)
  );
}

function isNitrogenTimerRangeQuery(message) {
  const m = String(message || "");
  if (isNitrogenConcentrationControlQuery(m)) {
    return false;
  }
  return /таймер/i.test(m) && hasTerm(m, "nitrogen");
}

function isEthernetFaultQuery(message) {
  const m = String(message || "");
  return (
    /ethernet/i.test(m) &&
    /(?:нет\s+связ|не\s+работ|неисправ|причин|действ|табл.*3\.2|устран)/iu.test(m)
  );
}

function isBrokenDoorGlassQuery(message, history = []) {
  const { isUnsupportedReplacementQuery } = require("./unsupported-replacement-scope");
  const current = String(message || "").trim();
  const ctx = mergeUserContext(current, history);
  return isUnsupportedReplacementQuery(current, history) && /стекл/iu.test(ctx);
}

function buildBrokenDoorGlassAnswer(model) {
  const { buildUnsupportedReplacementAnswer } = require("./unsupported-replacement-scope");
  return buildUnsupportedReplacementAnswer(model, "Разбилось стекло в двери");
}

function isContactSupportQuery(message) {
  const m = String(message || "").trim();
  if (!m || m.length < 4) {
    return false;
  }

  const hasSupportTopic =
    /(?:техподдерж|тех\.?\s*поддерж|поддержк(?:а|и|у|ой)?|служб[ае]\s+поддерж|сервис(?:н\w*\s+служб)?|совтест|sovtest(?:\s+ate)?|info@sovtest|service@sovtest|dalutin@sovtest|оператор|производител|изготовител|предприят(?:и|ия)[\p{L}]*-изготовител)/iu.test(
      m
    );
  const hasContactIntent =
    /(?:связ|обрат|контакт|реквизит|напис|позвон|звон|телефон|почт|email|e-?mail|адрес|офис|график\s+работ|часы\s+работ|отправ|форм|заявк|обращени|куда\s+(?:мне\s+|можно\s+|нужно\s+)?(?:писать|звонить|отправить|обратиться)|как\s+(?:связаться|обратиться|написать|позвонить|отправить))/iu.test(
      m
    );

  if (hasSupportTopic && hasContactIntent) {
    return true;
  }

  if (
    /(?:как\s+(?:связаться|обратиться|написать|позвонить)|куда\s+(?:мне\s+|можно\s+|нужно\s+)?(?:обратиться|написать|отправить|звонить)|где\s+(?:форма|отправить|написать))/iu.test(
      m
    ) &&
    /(?:поддерж|сервис|совтест|sovtest|с\s+сайта|через\s+сайт|на\s+портал)/iu.test(m)
  ) {
    return true;
  }

  // «Куда мне обратиться, чтобы починили» — запрос контактов, не раздел РЭ про текущий ремонт.
  if (
    /(?:куда|к\s+кому|кому)\s+(?:мне\s+|можно\s+|нужно\s+)?(?:обратиться|писать|звонить|сдать|отнести|отправить)|куда\s+звонить/iu.test(
      m,
    ) &&
    /(?:почин|отремонтир|ремонт|сервис|поломк|сломал)/iu.test(m) &&
    !/(?:где\s+описан|в\s+каком\s+раздел|какие\s+действи|самостоятельн)/iu.test(m)
  ) {
    return true;
  }

  if (
    /(?:форма\s+(?:обращ|заявк|запрос)|запрос\s+в\s+поддерж|обращени[ея]\s+в\s+(?:тех)?поддерж)/iu.test(
      m
    )
  ) {
    return true;
  }

  if (
    /(?:отправ|направ|создат|оформ)/iu.test(m) &&
    /(?:обращени|заявк|запрос)/iu.test(m) &&
    /(?:инженер|сервис)/iu.test(m)
  ) {
    return true;
  }

  if (
    /(?:номер\s+телефона|телефон\s+(?:поддерж|сервис|sovtest)|почта\s+(?:поддерж|sovtest)|email\s+(?:поддерж|sovtest))/iu.test(
      m
    )
  ) {
    return true;
  }

  if (
    /(?:куда\s+позвонить|кому\s+позвонить|к\s+кому\s+обратиться)/iu.test(m) &&
    /(?:помощ|поддерж|совтест|sovtest|сервис|оборудован)/iu.test(m)
  ) {
    return true;
  }

  if (/^контакты?(?:\s+(?:sovtest|поддерж|компании))?$/iu.test(m)) {
    return true;
  }

  // «Номер Совтест» — телефон компании SOVTEST ATE, не серийный номер оборудования.
  if (
    /(?:^|\s)номер\s+совтест/iu.test(m) &&
    !/(?:серийн|заводск|табличк|маркиров|шкаф|экземпляр)/iu.test(m)
  ) {
    return true;
  }
  if (
    /(?:как|куда)\s+(?:позвонить|звонить|обратиться|написать|связаться)(?:\s+(?:в|с|к))?[\s\S]{0,24}(?:совтест|sovtest)/iu.test(
      m,
    )
  ) {
    return true;
  }
  if (
    /(?:телефон|позвон|звон).*(?:совтест|sovtest)|(?:совтест|sovtest).*(?:телефон|номер\s+телефона)/iu.test(
      m,
    )
  ) {
    return true;
  }

  return false;
}

function isFirstStartupGuideQuery(message) {
  const m = String(message || "");
  if (/полн|алгоритм.*перв/i.test(m)) {
    return false;
  }
  return (
    /(?:с\s+чего\s+начать|купил\s+шкаф|только\s+(?:купил|получил|привезли)|перв(?:ый|ого)\s+(?:пуск|запуск|включ)|начать\s+эксплуатац|как\s+начать(?:\s+работу)?|начать\s+работ)/iu.test(
      m
    ) && /(?:шкаф|sdb1106|эксплуатац)/iu.test(m)
  );
}

function isFirstStartupFullQuery(message) {
  const m = String(message || "");
  if (isDryingModeAfterPowerOnQuery(m)) {
    return false;
  }
  return (
    /(?:полн|алгоритм|порядок)/iu.test(m) &&
    /(?:перв(?:ого|ый|ом)\s+включ|перв(?:ый|ого)\s+пуск|ввод.*эксплуатац)/iu.test(m) &&
    !/только.*осуш|осушен.*после\s+включ/i.test(m)
  );
}

function isMaintenanceScheduleQuery(message) {
  const m = String(message || "");
  if (/ежегодн|раз\s+в\s+год|12\s+месяц/i.test(m) && !/всего\s+шкаф/i.test(m)) {
    return false;
  }
  return (
    /(?:как\s+часто|когда\s+(?:обслуж|делать\s+то)|периодичн|регламент|\bто\b)/iu.test(m) &&
    /(?:шкаф|обслужив|техническ)/iu.test(m) &&
    !/цеолит|осушител|блок.*осуш|калибр/i.test(m)
  );
}

function isMaintenanceAnnualQuery(message) {
  const m = String(message || "");
  return (
    /(?:ежегодн|раз\s+в\s+год|12\s+месяц|каждый\s+год)/iu.test(m) &&
    /(?:обслужив|регламент|\bто\b|входит)/iu.test(m)
  );
}

function isFaultHumidityTable32Query(message) {
  const m = String(message || "");
  return (
    /(?:табл|таблиц).*3\.2|3\.2/i.test(m) &&
    /(?:влажност|осуш|не\s+выходит|не\s+падает)/iu.test(m)
  );
}

function isIntermittentSoundMeaningQuery(message) {
  const m = String(message || "");
  return (
    /прерывист/i.test(m) &&
    hasTerm(m, "doorSound") &&
    /(?:что\s+означ|когда\s+срабатыв|что\s+это)/iu.test(m)
  );
}

function isRhSetpointDefinitionsQuery(message) {
  const m = String(message || "");
  return (
    /rh%[тpп]/iu.test(m) ||
    (/rh%/iu.test(m) && /отлича|что\s+такое|означа|расшифр/iu.test(m)) ||
    (/(?:текущ|целев|задан|установлен)/iu.test(m) &&
      /(?:rh|влажност)/iu.test(m) &&
      /(?:отлича|что\s+такое|означа|расшифр)/iu.test(m))
  );
}

function isHumidityTimeToSetpointQuery(message) {
  const m = String(message || "");
  if (/регенерац/iu.test(m)) {
    return false;
  }
  if (
    /(?:выход|выйти|выйдет).*(?:на\s+)?режим|режим.*(?:после\s+)?(?:включ|запуск)|выйти\s+на\s+режим\s+осушен|осушен.*после\s+включ|выйдет\s+на\s+(?:задан|установлен)|когда.{0,30}(?:просуш|осушит)|дойдет\s+до\s+(?:задан|установлен)/iu.test(
      m
    ) &&
    /(?:сколько\s+(?:времен|часов)|за\s+сколько|когда|время\s+выход|3\s*час)/iu.test(m)
  ) {
    return true;
  }
  return (
    hasTerm(m, "humidity") &&
    /(?:сколько\s+(?:времен|часов)|за\s+сколько|как\s+быстро|время\s+выход|3\s*час|5\s*%?\s*rh)/iu.test(m)
  );
}

function isEthernetCommissioningQuery(message) {
  const m = String(message || "");
  return /(?:ethernet|сетев(?:ой|ого)\s+(?:порт|кабел|подключен)|локальн\w*\s+сет)/iu.test(m) &&
    /(?:обязательн|нужно\s+ли|подключ|ввод|эксплуатац|требу)/iu.test(m);
}

function isHumidityCalibrationQuery(message) {
  const m = String(message || "");
  return /калибр/iu.test(m) && /(?:влажност|rh|датчик)/iu.test(m);
}

function isLightingOptionQuery(message) {
  const m = String(message || "");
  return /(?:освещен|подсвет)/iu.test(m) && /(?:опци|рабоч|объем|объём|внутр|шкаф)/iu.test(m);
}

function isWarrantyTermQuery(message) {
  const m = String(message || "");
  return (
    /гарантийн|гарантия/iu.test(m) &&
    /(?:срок|действ|длит|какая\s+гарантия|есть\s+гарантия)/iu.test(m) &&
    !/(?:служб|наработк|mtbf|отказ)/iu.test(m)
  );
}

function isDoorOpenBehaviorQuery(message) {
  const m = String(message || "");
  return (
    /(?:двер|створк)/iu.test(m) &&
    ((/(?:открыт|распахнут)/iu.test(m) &&
      /(?:минут|долго|больше|надолго|что\s+(?:произойд|будет|случит))/iu.test(m)) ||
      /(?:заб(?:ыл|ыть)|оставил).{0,25}(?:закрыт|двер)/iu.test(m))
  );
}

function isTotalShelfLoadQuery(message) {
  const m = String(message || "");
  return (
    /(?:суммарн|общая|на\s+все\s+полк|все\s+полк|всех\s+полок|весь\s+комплект\s+полок)/iu.test(m) &&
    /(?:нагрузк|грузопод|выдерж|вес)/iu.test(m)
  );
}

function isDesiccantReplaceProcedureQuery(message) {
  const m = String(message || "");
  return (
    /(?:пошаг|алгоритм|как\s+(?:именно\s+)?(?:замен|поменя)|порядок\s+(?:замен|смен))/iu.test(m) &&
    /(?:цеолит|осушител|осушающ|блок.*осуш)/iu.test(m)
  );
}

function isDryingModeAfterPowerOnQuery(message) {
  const m = String(message || "");
  if (/(?:сколько\s+(?:времен|часов)|за\s+сколько|время\s+выход)/iu.test(m)) {
    return false;
  }
  if (/(?:неисправ|табл.*3\.2|что\s+проверить|уплотнител.*поврежд|возможн\w*\s+неисправ)/iu.test(m)) {
    return false;
  }
  if (
    /(?:после\s+)?включен|после\s+включ|перв(ый|ом)\s+(?:пуск|включ)|наработк/i.test(m) &&
    /(?:осушен|выйти\s+на\s+режим|выход\s+на\s+режим|режим\s+осушен)/iu.test(m)
  ) {
    return true;
  }
  return (
    /(?:что\s+делать|как\s+(?:выйти|перейти)|алгоритм|с\s+чего\s+начать)/iu.test(m) &&
    /(?:после\s+)?включен|включени|перв(ый|ом)\s+пуск/i.test(m) &&
    /осушен/i.test(m)
  );
}

function isHumidityMenuProcedureQuery(message) {
  const m = String(message || "");
  if (/(?:шаг|дискретност|точност)/iu.test(m)) {
    return false;
  }
  return (
    /(?:меню|порог|задать|выстав|настро|как\s+установ)/iu.test(m) &&
    hasTerm(m, "humidity") &&
    /(?:пошаг|как\s+(?:задать|установ|выстав|настро)|(?:задать|выстав|настро).*(?:уров|порог|влажност|rh)|установить.*(?:уров|порог|значени))/iu.test(
      m
    )
  );
}

function isDoorSoundFaultQuery(message) {
  const m = String(message || "");
  return (
    hasTerm(m, "doorSound") &&
    (/постоянн|без\s+открыт|не\s+открыт|не\s+выключ|не\s+отключ|всё\s+время|все\s+время/i.test(m) ||
      (/неисправ|табл.*3\.2|что\s+проверить/i.test(m) && /двер/iu.test(m)))
  );
}

function isChamberTemperatureRangeQuery(message) {
  const m = String(message || "");
  if (hasTerm(m, "sensorBrand") && hasTerm(m, "sensor")) {
    return false;
  }
  if (hasTerm(m, "sensor") && !hasAnyTerm(m, ["chamberTemp", "humidity"])) {
    return false;
  }
  if (hasTerm(m, "humidity") && !hasTerm(m, "chamberTemp") && !/температур/i.test(m)) {
    return false;
  }
  return hasTerm(m, "chamberTemp") || (hasTerm(m, "humidity") && /внутр|рабоч|камер/i.test(m) && /температур/i.test(m));
}

function isHeatingAirTemperatureQuery(message) {
  const m = String(message || "");
  if (isHeatingOptionMountQuery(m)) {
    return false;
  }
  if (isShelfLoadQuery(m)) {
    return false;
  }
  if (/регенерац/i.test(m)) {
    return false;
  }
  if (hasTerm(m, "power") && hasTerm(m, "options")) {
    return false;
  }
  if (/полк|нагрузк|\bкг\b/i.test(m) && /подогрев/i.test(m)) {
    return false;
  }
  return (
    hasTerm(m, "heatingAirTemp") ||
    (/подогрев|нагрев/i.test(m) &&
      /температур|градус|°\s*[сc]|максимальн|выстав/i.test(m) &&
      !/мощност|вт\b|ватт|потребля/i.test(m))
  );
}

function isClimaticExecutionQuery(message) {
  const m = String(message || "");
  return hasTerm(m, "climatic") && /(?:исполнен|категори|гост|ухл|15150)/iu.test(m);
}

function isMainPowerSwitchLocationQuery(message) {
  const m = String(message || "");
  if (hasTerm(m, "powerOn")) {
    return false;
  }
  return (
    (hasTerm(m, "location") && hasTerm(m, "switch")) ||
    (hasTerm(m, "mainSwitch") && hasTerm(m, "location")) ||
    (hasTerm(m, "mainSwitch") && /располож|находится|корпус/i.test(m))
  );
}

function isShelfConvectionSpacingQuery(message) {
  const m = String(message || "");
  if (isShelfLoadQuery(m)) {
    return false;
  }
  return (
    (hasTerm(m, "shelf") &&
      (/конвекц|между\s+полк|расстояни.*полк|полк.*расстояни|шаг.*полк|миллиметр|\bмм\b|регулир.*высот|на\s+сколько/i.test(
        m
      ))) ||
    (/расстояни|зазор/i.test(m) &&
      /(?:конвекц|циркуляц).*(?:воздух|воздуш)/i.test(m) &&
      /издел|загруз|размещ/i.test(m))
  );
}

function isHumidityIncreaseForbiddenQuery(message) {
  const m = String(message || "");
  return (
    /(?:повыш|увелич|поднять|нараст).*(?:влажност|rh\b)|(?:влажност|rh\b).*(?:повыш|увелич|поднять|сделать.{0,20}выше)|сделать.{0,20}(?:влажност|rh\b).{0,20}выше/iu.test(
      m
    ) && /можно|допуск|предназнач|шкаф/i.test(m)
  );
}

function isAtmosphericPressureQuery(message) {
  const m = String(message || "");
  return hasTerm(m, "atmosphericPressure");
}

function isLowAmbientOperatingQuery(message) {
  const m = String(message || "");
  if (isShelfLoadQuery(m) || /\d+\s*(?:кг|килограм)/iu.test(m)) {
    return false;
  }
  if (hasTerm(m, "humidity") && /90\s*%|%rh|\brh\b/i.test(m) && !hasTerm(m, "lowAmbientTemp")) {
    return false;
  }
  return (
    (hasTerm(m, "ambientTemp") && hasTerm(m, "lowAmbientTemp")) ||
    (hasTerm(m, "lowAmbientTemp") && /можно|штатн|эксплуат|работ|продолж/i.test(m)) ||
    (/(?:температур)/iu.test(m) &&
      hasTerm(m, "lowAmbientTemp") &&
      /эксплуат|можно|штатн/i.test(m))
  );
}

module.exports = {
  TERM,
  normalizeRuleText,
  mergeUserContext,
  hasTerm,
  hasAnyTerm,
  hasAllTerms,
  hasCabinetContext,
  isShelfLoadQuery,
  isKitShelfCountQuery,
  isMassCabinetQuery,
  isDimensionQuery,
  isLocationSwitchQuery,
  isVoltageSurgeQuery,
  isNitrogenSupplyContext,
  isDesiccantIdentityQuery,
  isCabinetBodyMaterialQuery,
  isChamberTemperatureRangeQuery,
  isHeatingAirTemperatureQuery,
  isLowAmbientOperatingQuery,
  isAtmosphericPressureQuery,
  isHumidityIncreaseForbiddenQuery,
  isClimaticExecutionQuery,
  isMainPowerSwitchLocationQuery,
  isShelfConvectionSpacingQuery,
  isPowerCordLengthQuery,
  isRegenModeOverviewQuery,
  isRegenActivationQuery,
  isRegenDurationQuery,
  isHeatingOptionMountQuery,
  isNitrogenConnectQuery,
  isNitrogenConcentrationControlQuery,
  isNitrogenRotameterSetupQuery,
  isNitrogenOptionDimensionsQuery,
  isWindowCleaningQuery,
  isEsdBraceletQuery,
  isDryStorageSoftwareQuery,
  isTricolorIndicatorQuery,
  isPanelIndicatorColorsQuery,
  isPanelYellowIndicatorQuery,
  isPanelRedIndicatorQuery,
  isPanelGreenIndicatorQuery,
  isExternalInspectionProcedureQuery,
  isDamperRelatedQuery,
  isBasicKitSupplyQuery,
  isDocumentPocketQuery,
  isDesiccatorKitCountQuery,
  isLockKeysKitQuery,
  isShelfMaterialQuery,
  isLoadingWallClearanceQuery,
  isLoadingRulesQuery,
  isKitWheelsFeetQuery,
  isWheelsUpgradeQuery,
  isCabinetWeldedConstructionQuery,
  isDoorMagneticSealsQuery,
  isDoorSensorPurposeQuery,
  isNitrogenTimerRangeQuery,
  isEthernetFaultQuery,
  isBrokenDoorGlassQuery,
  buildBrokenDoorGlassAnswer,
  isContactSupportQuery,
  isFirstStartupGuideQuery,
  isFirstStartupFullQuery,
  isMaintenanceScheduleQuery,
  isMaintenanceAnnualQuery,
  isFaultHumidityTable32Query,
  isIntermittentSoundMeaningQuery,
  isRhSetpointDefinitionsQuery,
  isHumidityTimeToSetpointQuery,
  isEthernetCommissioningQuery,
  isHumidityCalibrationQuery,
  isLightingOptionQuery,
  isWarrantyTermQuery,
  isDoorOpenBehaviorQuery,
  isTotalShelfLoadQuery,
  isDesiccantReplaceProcedureQuery,
  isDryingModeAfterPowerOnQuery,
  isHumidityMenuProcedureQuery,
  isDoorSoundFaultQuery,
};
