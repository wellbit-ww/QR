/**
 * Интерактивное меню управления аккаунтами портала.
 * Запуск: npm run user:menu
 */
require("./load-env-file").loadEnvFile();

const readline = require("readline");
const equipmentCatalog = require("../data/equipment.json");
const { getPool } = require("../src/rag/pg-client");
const { getRagConfig } = require("../src/rag/config");
const { ensurePortalSchema } = require("../src/auth/portal-schema");
const {
  listPortalUsers,
  findUserByLogin,
  createPortalUser,
  updatePortalUserPassword,
  appendEquipmentToUser,
  removeEquipmentFromUser,
  setPortalUserEquipment,
  updatePortalUserLabel,
  setPortalUserActive,
} = require("../src/auth/portal-users");
const { generateRandomPassword } = require("../src/auth/password");
const {
  appendPortalAccountRecord,
  buildLoginUrl,
  resolveAccountsLogPath,
} = require("../src/auth/portal-accounts-log");
const { renderPortalSticker } = require("../src/sticker/render-portal-sticker");

const EQUIPMENT_LIST = Object.values(equipmentCatalog).map((item) => ({
  id: item.id,
  publicId: item.publicId || item.id,
  name: item.name,
  type: item.type,
}));

function createPrompter() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return {
    ask(question) {
      return new Promise((resolve) => {
        rl.question(question, (answer) => resolve(answer.trim()));
      });
    },
    close() {
      rl.close();
    },
  };
}

function printLine(text = "") {
  console.log(text);
}

function printMenu() {
  printLine();
  printLine("=== Управление аккаунтами портала ===");
  printLine(" 1 — Создать новый аккаунт");
  printLine(" 2 — Добавить оборудование к аккаунту");
  printLine(" 3 — Убрать оборудование из аккаунта");
  printLine(" 4 — Заменить список оборудования (полностью)");
  printLine(" 5 — Изменить название организации");
  printLine(" 6 — Сбросить пароль");
  printLine(" 7 — Показать данные аккаунта");
  printLine(" 8 — Отключить вход (деактивация)");
  printLine(" 9 — Включить вход снова");
  printLine("10 — Список всех аккаунтов");
  printLine(" 0 — Выход");
  printLine();
}

function printEquipmentCatalog({ title, items = EQUIPMENT_LIST }) {
  printLine(title);
  items.forEach((item, index) => {
    printLine(`  ${index + 1}. ${item.name} — ${item.type}  [${item.publicId || item.id}]`);
  });
  printLine("  (можно несколько: 1,3  или  1 3)");
}

function parseNumberSelection(input, max) {
  const raw = String(input || "")
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const indexes = new Set();
  for (const part of raw) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 1 || n > max) {
      return null;
    }
    indexes.add(n - 1);
  }
  return [...indexes];
}

async function pickEquipmentIds(prompter, { title, allowMultiple = true } = {}) {
  printEquipmentCatalog({ title: title || "Доступное оборудование:" });
  const hint = allowMultiple
    ? "Введите номер(а) оборудования: "
    : "Введите номер оборудования: ";
  const input = await prompter.ask(hint);
  const indexes = parseNumberSelection(input, EQUIPMENT_LIST.length);
  if (!indexes?.length) {
    printLine("Неверный выбор.");
    return null;
  }
  if (!allowMultiple && indexes.length > 1) {
    printLine("Выберите только один номер.");
    return null;
  }
  return indexes.map((i) => EQUIPMENT_LIST[i].id);
}

async function pickLogin(prompter, pool) {
  const users = await listPortalUsers(pool);
  if (!users.length) {
    printLine("Аккаунтов пока нет. Введите логин для нового:");
    const login = await prompter.ask("Логин: ");
    return login || null;
  }

  printLine("Аккаунты:");
  users.forEach((user, index) => {
    const status = user.active ? "активен" : "отключён";
    const label = user.label ? ` — ${user.label}` : "";
    printLine(
      `  ${index + 1}. ${user.login}${label}  [${user.equipmentIds.join(", ")}] (${status})`
    );
  });
  printLine("  0 — ввести логин вручную");
  const choice = await prompter.ask("Выберите номер аккаунта (или 0): ");
  if (choice === "0") {
    const login = await prompter.ask("Логин: ");
    return login || null;
  }
  const index = Number(choice) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= users.length) {
    printLine("Неверный выбор.");
    return null;
  }
  return users[index].login;
}

function writePortalSticker({ login, password }) {
  try {
    const stickerPath = renderPortalSticker({ login, password });
    printLine(`Наклейка сохранена: ${stickerPath}`);
    return stickerPath;
  } catch (error) {
    printLine(
      `Не удалось сгенерировать PNG наклейки: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}

function printSticker({ baseUrl, login, password, equipmentIds, label }) {
  const origin = String(baseUrl || "http://127.0.0.1:3000").replace(/\/$/, "");
  const equipment = equipmentIds[0] || "sdb1106-nm";
  const loginUrl = `${origin}/login?equipment=${encodeURIComponent(equipment)}`;

  printLine("\n--- Данные для наклейки ---");
  if (label) {
    printLine(`Организация: ${label}`);
  }
  printLine(`URL: ${loginUrl}`);
  printLine(`Логин: ${login}`);
  printLine(`Пароль: ${password}`);
  printLine(`Оборудование: ${equipmentIds.join(", ")}`);
  printLine("---------------------------\n");
}

async function requirePool() {
  const pool = getPool(getRagConfig().postgresUrl);
  if (!pool) {
    printLine("Задайте POSTGRES_URL в .env или в окружении (см. .env.example).");
    printLine("Postgres: npm run docker:db");
    return null;
  }
  await ensurePortalSchema(pool);
  return pool;
}

async function actionCreate(prompter, pool) {
  printLine("\n--- Создание аккаунта ---");
  const login = await prompter.ask("Логин: ");
  if (!login) {
    printLine("Логин обязателен.");
    return;
  }
  const existing = await findUserByLogin(pool, login);
  if (existing) {
    printLine(`Аккаунт «${existing.login}» уже есть.`);
    return;
  }

  const label = await prompter.ask("Организация (Enter — пропустить): ");
  const baseUrl =
    (await prompter.ask("Базовый URL для QR (Enter — http://127.0.0.1:3000): ")) ||
    "http://127.0.0.1:3000";

  const genAnswer = await prompter.ask("Сгенерировать пароль автоматически? (Y/n): ");
  let password;
  if (genAnswer.toLowerCase() === "n") {
    password = await prompter.ask("Пароль: ");
    if (!password) {
      printLine("Пароль обязателен.");
      return;
    }
  } else {
    password = generateRandomPassword(12);
  }

  const equipmentIds = await pickEquipmentIds(prompter, {
    title: "К какому оборудованию дать доступ:",
    allowMultiple: true,
  });
  if (!equipmentIds?.length) {
    return;
  }

  const confirm = await prompter.ask(
    `Создать «${login}» с доступом к [${equipmentIds.join(", ")}]? (Y/n): `
  );
  if (confirm.toLowerCase() === "n") {
    printLine("Отменено.");
    return;
  }

  const user = await createPortalUser(pool, {
    login,
    password,
    equipmentIds,
    label: label || null,
  });

  appendPortalAccountRecord({
    action: "create",
    login: user.login,
    password,
    equipmentIds: user.equipmentIds,
    label: label || null,
    baseUrl,
    loginUrl: buildLoginUrl(baseUrl, user.equipmentIds),
  });

  printLine(`\nСоздан: ${user.login}`);
  printSticker({
    baseUrl,
    login: user.login,
    password,
    equipmentIds: user.equipmentIds,
    label: label || null,
  });
  writePortalSticker({ login: user.login, password });
  printLine(`Журнал: ${resolveAccountsLogPath()}`);
}

async function actionAddEquipment(prompter, pool) {
  printLine("\n--- Добавить оборудование ---");
  const login = await pickLogin(prompter, pool);
  if (!login) {
    return;
  }
  const user = await findUserByLogin(pool, login);
  if (!user) {
    printLine("Аккаунт не найден.");
    return;
  }
  printLine(`Текущий доступ: ${user.equipmentIds.join(", ") || "(пусто)"}`);

  const available = EQUIPMENT_LIST.filter((item) => !user.equipmentIds.includes(item.id));
  if (!available.length) {
    printLine("Все модели из каталога уже добавлены.");
    return;
  }

  const equipmentIds = await pickEquipmentIds(prompter, {
    title: "Что добавить:",
    allowMultiple: true,
  });
  if (!equipmentIds?.length) {
    return;
  }

  const updated = await appendEquipmentToUser(pool, login, equipmentIds);
  appendPortalAccountRecord({
    action: "add_equipment",
    login: updated.login,
    equipmentIds: updated.equipmentIds,
    label: updated.label,
  });
  printLine(`Готово. Доступ: ${updated.equipmentIds.join(", ")}`);
}

async function actionRemoveEquipment(prompter, pool) {
  printLine("\n--- Убрать оборудование ---");
  const login = await pickLogin(prompter, pool);
  if (!login) {
    return;
  }
  const user = await findUserByLogin(pool, login);
  if (!user?.equipmentIds?.length) {
    printLine("У аккаунта нет оборудования.");
    return;
  }

  const current = user.equipmentIds.map((id) => {
    const meta = EQUIPMENT_LIST.find((e) => e.id === id);
    return { id, name: meta?.name || id, type: meta?.type || "" };
  });

  printLine("Текущий доступ (что убрать):");
  current.forEach((item, index) => {
    printLine(`  ${index + 1}. ${item.name}  [${item.publicId || item.id}]`);
  });

  const input = await prompter.ask("Номер для удаления: ");
  const indexes = parseNumberSelection(input, current.length);
  if (!indexes?.length || indexes.length !== 1) {
    printLine("Укажите один номер.");
    return;
  }

  const removeId = current[indexes[0]].id;
  try {
    const updated = await removeEquipmentFromUser(pool, login, removeId);
    appendPortalAccountRecord({
      action: "remove_equipment",
      login: updated.login,
      equipmentIds: updated.equipmentIds,
      label: updated.label,
    });
    printLine(`Убрано «${removeId}». Осталось: ${updated.equipmentIds.join(", ")}`);
  } catch (error) {
    printLine(error instanceof Error ? error.message : String(error));
  }
}

async function actionSetEquipment(prompter, pool) {
  printLine("\n--- Заменить список оборудования ---");
  const login = await pickLogin(prompter, pool);
  if (!login) {
    return;
  }

  const equipmentIds = await pickEquipmentIds(prompter, {
    title: "Новый полный список доступа:",
    allowMultiple: true,
  });
  if (!equipmentIds?.length) {
    return;
  }

  const confirm = await prompter.ask(
    `Заменить доступ на [${equipmentIds.join(", ")}]? (Y/n): `
  );
  if (confirm.toLowerCase() === "n") {
    return;
  }

  const updated = await setPortalUserEquipment(pool, login, equipmentIds);
  appendPortalAccountRecord({
    action: "set_equipment",
    login: updated.login,
    equipmentIds: updated.equipmentIds,
    label: updated.label,
  });
  printLine(`Новый список: ${updated.equipmentIds.join(", ")}`);
}

async function actionSetLabel(prompter, pool) {
  printLine("\n--- Название организации ---");
  const login = await pickLogin(prompter, pool);
  if (!login) {
    return;
  }
  const label = await prompter.ask("Новое название (Enter — очистить): ");
  const updated = await updatePortalUserLabel(pool, login, label);
  if (!updated) {
    printLine("Аккаунт не найден.");
    return;
  }
  appendPortalAccountRecord({
    action: "set_label",
    login: updated.login,
    equipmentIds: updated.equipmentIds,
    label: updated.label,
  });
  printLine(`Сохранено: ${updated.label || "(пусто)"}`);
}

async function actionResetPassword(prompter, pool) {
  printLine("\n--- Сброс пароля ---");
  const login = await pickLogin(prompter, pool);
  if (!login) {
    return;
  }
  const user = await findUserByLogin(pool, login);
  if (!user) {
    printLine("Аккаунт не найден.");
    return;
  }

  const baseUrl =
    (await prompter.ask("Базовый URL для QR (Enter — http://127.0.0.1:3000): ")) ||
    "http://127.0.0.1:3000";
  const genAnswer = await prompter.ask("Сгенерировать новый пароль? (Y/n): ");
  let password;
  if (genAnswer.toLowerCase() === "n") {
    password = await prompter.ask("Новый пароль: ");
    if (!password) {
      return;
    }
  } else {
    password = generateRandomPassword(12);
  }

  await updatePortalUserPassword(pool, login, password);
  appendPortalAccountRecord({
    action: "password_reset",
    login: user.login,
    password,
    equipmentIds: user.equipmentIds,
    label: user.label,
    baseUrl,
    loginUrl: buildLoginUrl(baseUrl, user.equipmentIds),
  });

  printLine("Пароль обновлён.");
  printSticker({
    baseUrl,
    login: user.login,
    password,
    equipmentIds: user.equipmentIds,
    label: user.label,
  });
  writePortalSticker({ login: user.login, password });
}

async function actionShow(prompter, pool) {
  printLine("\n--- Данные аккаунта ---");
  const login = await pickLogin(prompter, pool);
  if (!login) {
    return;
  }
  const user = await findUserByLogin(pool, login);
  if (!user) {
    printLine("Аккаунт не найден.");
    return;
  }

  printLine(JSON.stringify({
    login: user.login,
    label: user.label,
    active: user.active,
    equipmentIds: user.equipmentIds,
  }, null, 2));
}

async function actionSetActive(prompter, pool, active) {
  printLine(active ? "\n--- Включить аккаунт ---" : "\n--- Отключить аккаунт ---");
  const login = await pickLogin(prompter, pool);
  if (!login) {
    return;
  }
  const updated = await setPortalUserActive(pool, login, active);
  if (!updated) {
    printLine("Аккаунт не найден.");
    return;
  }
  appendPortalAccountRecord({
    action: active ? "activate" : "deactivate",
    login: updated.login,
    equipmentIds: updated.equipmentIds,
    label: updated.label,
    active: updated.active,
  });
  printLine(`${updated.login}: ${updated.active ? "включён" : "отключён"}`);
}

async function actionListAll(pool) {
  printLine("\n--- Все аккаунты ---");
  const users = await listPortalUsers(pool);
  if (!users.length) {
    printLine("(нет аккаунтов)");
    return;
  }
  for (const user of users) {
    const status = user.active ? "активен" : "ОТКЛЮЧЁН";
    const label = user.label ? ` | ${user.label}` : "";
    printLine(
      `• ${user.login}${label} — ${user.equipmentIds.join(", ")} (${status})`
    );
  }
}

async function main() {
  const pool = await requirePool();
  if (!pool) {
    process.exit(1);
  }

  const prompter = createPrompter();
  printLine(`Журнал учётных записей: ${resolveAccountsLogPath()}`);

  try {
    while (true) {
      printMenu();
      const choice = await prompter.ask("Выберите действие: ");

      switch (choice) {
        case "1":
          await actionCreate(prompter, pool);
          break;
        case "2":
          await actionAddEquipment(prompter, pool);
          break;
        case "3":
          await actionRemoveEquipment(prompter, pool);
          break;
        case "4":
          await actionSetEquipment(prompter, pool);
          break;
        case "5":
          await actionSetLabel(prompter, pool);
          break;
        case "6":
          await actionResetPassword(prompter, pool);
          break;
        case "7":
          await actionShow(prompter, pool);
          break;
        case "8":
          await actionSetActive(prompter, pool, false);
          break;
        case "9":
          await actionSetActive(prompter, pool, true);
          break;
        case "10":
          await actionListAll(pool);
          break;
        case "0":
          printLine("Выход.");
          return;
        default:
          printLine("Неизвестный пункт. Введите число из меню.");
      }
    }
  } finally {
    prompter.close();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
