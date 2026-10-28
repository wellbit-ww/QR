/**
 * Создание учётных записей для наклеек с QR.
 *
 * QR на наклейке (пример):
 *   https://<ваш-домен>/login?equipment=sdb1106-nm
 *
 * На наклейке печатаются: URL, логин, пароль.
 *
 * Переменные: POSTGRES_URL (обязательно), при запуске сервера — SESSION_SECRET.
 *
 * Примеры:
 *   node scripts/create-portal-user.js --login acme01 --password "Secret1!" --equipment sdb1106-nm --label "ООО Ромашка"
 *   node scripts/create-portal-user.js --login acme01 --generate-password --equipment sdb1106-nm --base-url https://support.example.com
 *   node scripts/create-portal-user.js --login acme01 --reset-password --password "New1!" 
 *   node scripts/create-portal-user.js --login acme01 --deactivate
 *   node scripts/create-portal-user.js --login acme01 --add-equipment w-700
 *   node scripts/create-portal-user.js --login acme01 --add-equipment sdb1560m
 *
 * Журнал событий аккаунтов без plaintext-паролей (не в git): data/portal-accounts.jsonl
 * Переопределение: PORTAL_ACCOUNTS_LOG=C:\path\to\file.jsonl
 */
require("./load-env-file").loadEnvFile();
const equipmentCatalog = require("../data/equipment.json");
const { getPool } = require("../src/rag/pg-client");
const { getRagConfig } = require("../src/rag/config");
const { ensurePortalSchema } = require("../src/auth/portal-schema");
const {
  createPortalUser,
  updatePortalUserPassword,
  appendEquipmentToUser,
  removeEquipmentFromUser,
  setPortalUserEquipment,
  updatePortalUserLabel,
  setPortalUserActive,
  findUserByLogin,
  normalizeEquipmentIds,
} = require("../src/auth/portal-users");
const { generateRandomPassword } = require("../src/auth/password");
const {
  appendPortalAccountRecord,
  buildLoginUrl,
  resolveAccountsLogPath,
} = require("../src/auth/portal-accounts-log");
const {
  saveStickerPassword,
} = require("../src/auth/portal-sticker-secrets");
const { regenerateSticker } = require("../src/portal-admin/portal-admin-service");
const { renderPortalSticker } = require("../src/sticker/render-portal-sticker");

function parseArgs(argv) {
  const out = { equipment: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--login") {
      out.login = argv[++i];
    } else if (arg === "--password") {
      out.password = argv[++i];
    } else if (arg === "--equipment") {
      out.equipment.push(argv[++i]);
    } else if (arg === "--label") {
      out.label = argv[++i];
    } else if (arg === "--base-url") {
      out.baseUrl = argv[++i];
    } else if (arg === "--sticker-title") {
      out.stickerTitle = argv[++i];
    } else if (arg === "--generate-password") {
      out.generatePassword = true;
    } else if (arg === "--reset-password") {
      out.resetPassword = true;
    } else if (arg === "--generate-sticker") {
      out.generateSticker = true;
    } else if (arg === "--deactivate") {
      out.deactivate = true;
    } else if (arg === "--activate") {
      out.activate = true;
    } else if (arg === "--add-equipment") {
      out.addEquipment = argv[++i];
    } else if (arg === "--remove-equipment") {
      out.removeEquipment = argv[++i];
    } else if (arg === "--set-equipment") {
      out.setEquipment = true;
    } else if (arg === "--set-label") {
      out.setLabel = argv[++i];
    } else if (arg === "--show") {
      out.show = true;
    } else if (arg === "--journal-only") {
      out.journalOnly = true;
    } else if (arg === "--help" || arg === "-h") {
      out.help = true;
    }
  }
  return out;
}

function buildStickerTitle(equipmentIds, explicitTitle) {
  if (String(explicitTitle || "").trim()) {
    return String(explicitTitle).trim();
  }
  const equipmentId = equipmentIds?.[0] || "sdb1106-nm";
  const item = equipmentCatalog[equipmentId];
  if (!item) {
    return equipmentId;
  }
  const stickerTitle = String(item.stickerTitle || "").trim();
  if (stickerTitle) {
    return stickerTitle;
  }
  return `${item.type || ""}\n${item.name || item.id}`.trim();
}

function writePortalSticker({ login, password, equipmentIds, stickerTitle }) {
  try {
    const title = buildStickerTitle(equipmentIds, stickerTitle);
    const stickerPath = renderPortalSticker({ title, login, password });
    console.log(`Наклейка сохранена: ${stickerPath}`);
    return stickerPath;
  } catch (error) {
    console.warn(
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

  console.log("\n--- Данные для наклейки ---");
  if (label) {
    console.log(`Организация: ${label}`);
  }
  console.log(`URL: ${loginUrl}`);
  console.log(`Логин: ${login}`);
  console.log(`Пароль: ${password}`);
  console.log(`Оборудование: ${equipmentIds.join(", ")}`);
  console.log("---------------------------\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(`Usage:
  node scripts/create-portal-user.js --login NAME --password PASS --equipment ID [--label TEXT] [--base-url URL] [--sticker-title TEXT]
  node scripts/create-portal-user.js --login NAME --generate-password --equipment ID [--base-url URL] [--sticker-title TEXT]
  node scripts/create-portal-user.js --login NAME --reset-password --password PASS
  node scripts/create-portal-user.js --login NAME --generate-sticker [--password PASS] [--sticker-title TEXT]
  node scripts/create-portal-user.js --login NAME --add-equipment ID
  node scripts/create-portal-user.js --login NAME --remove-equipment ID
  node scripts/create-portal-user.js --login NAME --set-equipment --equipment ID [--equipment ID2 ...]
  node scripts/create-portal-user.js --login NAME --set-label "Организация"
  node scripts/create-portal-user.js --login NAME --show
  node scripts/create-portal-user.js --login NAME --deactivate | --activate
  node scripts/create-portal-user.js --journal-only --login NAME --equipment ID [--label TEXT] [--base-url URL]
    (только строка в журнал без пароля, без изменений в БД)`);
    process.exit(0);
  }

  if (!args.login) {
    console.error("Укажите --login.");
    process.exit(1);
  }

  const equipmentIds = normalizeEquipmentIds(args.equipment);
  let password = args.password;
  if (args.generatePassword) {
    password = generateRandomPassword(12);
  }

  if (args.journalOnly) {
    if (!equipmentIds.length) {
      console.error("Укажите --equipment.");
      process.exit(1);
    }
    const logPath = appendPortalAccountRecord({
      action: "create",
      login: args.login,
      equipmentIds,
      label: args.label,
      baseUrl: args.baseUrl,
      loginUrl: buildLoginUrl(args.baseUrl, equipmentIds),
    });
    console.log(`Добавлена запись в журнал (без БД): ${logPath}`);
    console.log("Пароль в журнал не сохраняется; если он неизвестен, выполните --reset-password.");
    process.exit(0);
  }

  const ragConfig = getRagConfig();
  const pool = getPool(ragConfig.postgresUrl);
  if (!pool) {
    console.error(
      "Задайте POSTGRES_URL (переменная окружения или файл .env в корне проекта).",
    );
    console.error(
      'Пример: $env:POSTGRES_URL = "postgresql://rag:rag_secret_change_me@127.0.0.1:5432/equipment_rag"',
    );
    console.error("Или: copy .env.example .env");
    process.exit(1);
  }

  await ensurePortalSchema(pool);

  if (args.deactivate || args.activate) {
    const user = await setPortalUserActive(pool, args.login, args.activate === true);
    if (!user) {
      console.error("Пользователь не найден.");
      process.exit(1);
    }
    const logPath = appendPortalAccountRecord({
      action: args.activate ? "activate" : "deactivate",
      login: user.login,
      equipmentIds: user.equipmentIds,
      label: user.label,
      baseUrl: args.baseUrl,
      active: user.active,
    });
    console.log(`Пользователь ${args.login}: active=${user.active}`);
    console.log(`Запись в журнале: ${logPath}`);
    await pool.end();
    return;
  }

  if (args.show) {
    const user = await findUserByLogin(pool, args.login);
    if (!user) {
      console.error("Пользователь не найден.");
      process.exit(1);
    }
    console.log(JSON.stringify({
      login: user.login,
      label: user.label,
      active: user.active,
      equipmentIds: user.equipmentIds,
    }, null, 2));
    await pool.end();
    return;
  }

  if (args.setLabel !== undefined) {
    const user = await updatePortalUserLabel(pool, args.login, args.setLabel);
    if (!user) {
      console.error("Пользователь не найден.");
      process.exit(1);
    }
    appendPortalAccountRecord({
      action: "set_label",
      login: user.login,
      equipmentIds: user.equipmentIds,
      label: user.label,
      baseUrl: args.baseUrl,
    });
    console.log(`Метка обновлена: ${user.label || "(пусто)"}`);
    await pool.end();
    return;
  }

  if (args.setEquipment) {
    if (!equipmentIds.length) {
      console.error("Укажите полный список: --set-equipment --equipment ID [--equipment ID2 ...]");
      process.exit(1);
    }
    const user = await setPortalUserEquipment(pool, args.login, equipmentIds);
    if (!user) {
      console.error("Пользователь не найден.");
      process.exit(1);
    }
    appendPortalAccountRecord({
      action: "set_equipment",
      login: user.login,
      equipmentIds: user.equipmentIds,
      label: user.label,
      baseUrl: args.baseUrl,
    });
    console.log(`Список оборудования заменён: ${user.equipmentIds.join(", ")}`);
    await pool.end();
    return;
  }

  if (args.addEquipment) {
    const user = await appendEquipmentToUser(pool, args.login, args.addEquipment);
    if (!user) {
      console.error("Пользователь не найден.");
      process.exit(1);
    }
    appendPortalAccountRecord({
      action: "add_equipment",
      login: user.login,
      equipmentIds: user.equipmentIds,
      label: user.label,
      baseUrl: args.baseUrl,
    });
    console.log(`Добавлено оборудование. Список: ${user.equipmentIds.join(", ")}`);
    await pool.end();
    return;
  }

  if (args.removeEquipment) {
    try {
      const user = await removeEquipmentFromUser(pool, args.login, args.removeEquipment);
      if (!user) {
        console.error("Пользователь не найден.");
        process.exit(1);
      }
      appendPortalAccountRecord({
        action: "remove_equipment",
        login: user.login,
        equipmentIds: user.equipmentIds,
        label: user.label,
        baseUrl: args.baseUrl,
      });
      console.log(`Удалено из доступа. Осталось: ${user.equipmentIds.join(", ")}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
    await pool.end();
    return;
  }

  if (args.resetPassword) {
    if (!password) {
      console.error("Для --reset-password укажите --password или --generate-password.");
      process.exit(1);
    }
    const updated = await updatePortalUserPassword(pool, args.login, password);
    if (!updated) {
      console.error("Пользователь не найден.");
      process.exit(1);
    }
    const existing = await findUserByLogin(pool, args.login);
    saveStickerPassword(existing.login, password);
    const logPath = appendPortalAccountRecord({
      action: "password_reset",
      login: existing.login,
      password,
      equipmentIds: existing.equipmentIds,
      label: existing.label,
      baseUrl: args.baseUrl,
      loginUrl: buildLoginUrl(args.baseUrl, existing.equipmentIds),
    });
    printSticker({
      baseUrl: args.baseUrl,
      login: existing.login,
      password,
      equipmentIds: existing.equipmentIds,
      label: existing.label,
    });
    writePortalSticker({
      login: existing.login,
      password,
      equipmentIds: existing.equipmentIds,
      stickerTitle: args.stickerTitle,
    });
    console.log(`Запись в журнале: ${logPath}`);
    await pool.end();
    return;
  }

  if (args.generateSticker) {
    await pool.end();
    const result = await regenerateSticker({
      login: args.login,
      password: args.password,
      stickerTitle: args.stickerTitle,
      baseUrl: args.baseUrl,
    });
    printSticker({
      baseUrl: args.baseUrl,
      login: result.user.login,
      password: result.credentials.password,
      equipmentIds: result.user.equipmentIds,
      label: result.user.label,
    });
    if (result.stickerPath) {
      console.log(`Наклейка сохранена: ${result.stickerPath}`);
    } else if (result.stickerError) {
      console.warn(`Не удалось сгенерировать PNG наклейки: ${result.stickerError}`);
    }
    return;
  }

  if (!equipmentIds.length) {
    console.error("Укажите хотя бы один --equipment ID.");
    process.exit(1);
  }

  if (!password) {
    console.error("Укажите --password или --generate-password.");
    process.exit(1);
  }

  const existing = await findUserByLogin(pool, args.login);
  if (existing) {
    console.error(
      "Пользователь уже существует. Используйте --reset-password или --add-equipment."
    );
    process.exit(1);
  }

  const user = await createPortalUser(pool, {
    login: args.login,
    password,
    equipmentIds,
    label: args.label,
  });

  console.log(`Создан пользователь: ${user.login}`);
  saveStickerPassword(user.login, password);
  const logPath = appendPortalAccountRecord({
    action: "create",
    login: user.login,
    password,
    equipmentIds: user.equipmentIds,
    label: args.label,
    baseUrl: args.baseUrl,
    loginUrl: buildLoginUrl(args.baseUrl, user.equipmentIds),
  });
  printSticker({
    baseUrl: args.baseUrl,
    login: user.login,
    password,
    equipmentIds: user.equipmentIds,
    label: args.label,
  });
  writePortalSticker({
    login: user.login,
    password,
    equipmentIds: user.equipmentIds,
    stickerTitle: args.stickerTitle,
  });
  console.log(`Журнал аккаунтов: ${logPath}`);
  console.log(`(все записи: ${resolveAccountsLogPath()})`);

  await pool.end();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
