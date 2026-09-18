const equipmentCatalog = require("../../data/equipment.json");
const { getPool } = require("../rag/pg-client");
const { getRagConfig } = require("../rag/config");
const { ensurePortalSchema } = require("../auth/portal-schema");
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
  updatePortalUserEquipmentQuantities,
  updatePortalUserEquipmentSerials,
  deletePortalUser,
} = require("../auth/portal-users");
const { generateRandomPassword, verifyPassword } = require("../auth/password");
const {
  appendPortalAccountRecord,
  buildLoginUrl,
} = require("../auth/portal-accounts-log");
const {
  saveStickerPassword,
  getStickerPassword,
  removeStickerPassword,
} = require("../auth/portal-sticker-secrets");
const { renderPortalSticker } = require("../sticker/render-portal-sticker");

const EQUIPMENT_LIST = Object.values(equipmentCatalog).map((item) => ({
  id: item.id,
  publicId: item.publicId || item.id,
  name: item.name,
  type: item.type,
}));

let poolPromise = null;

async function getAdminPool() {
  if (!poolPromise) {
    poolPromise = (async () => {
      const pool = getPool(getRagConfig().postgresUrl);
      if (!pool) {
        throw new Error("POSTGRES_URL не задан. Скопируйте .env.example в .env и запустите Postgres.");
      }
      await ensurePortalSchema(pool);
      return pool;
    })();
  }
  return poolPromise;
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || process.env.PORTAL_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
}

function normalizeEquipmentQuantity(value) {
  const quantity = Number.parseInt(value, 10);
  if (!Number.isFinite(quantity) || quantity < 1) {
    return 1;
  }
  return quantity;
}

function normalizeEquipmentQuantities(equipmentIds, quantities = {}) {
  const source = quantities && typeof quantities === "object" && !Array.isArray(quantities)
    ? quantities
    : {};
  const out = {};
  for (const id of equipmentIds || []) {
    out[id] = normalizeEquipmentQuantity(source[id]);
  }
  return out;
}

function buildStickerPayload({ baseUrl, login, password, equipmentIds, label }) {
  const origin = normalizeBaseUrl(baseUrl);
  const equipment = equipmentIds?.[0] || "sdb1106-nm";
  return {
    login,
    password,
    label: label || null,
    equipmentIds: equipmentIds || [],
    loginUrl: `${origin}/login?equipment=${encodeURIComponent(equipment)}`,
  };
}

function buildEquipmentTitle(equipmentId) {
  const item = equipmentCatalog[equipmentId];
  if (!item) {
    return String(equipmentId || "").trim();
  }
  const stickerTitle = String(item.stickerTitle || "").trim();
  if (stickerTitle) {
    return stickerTitle;
  }
  return `${item.type || ""}\n${item.name || item.id}`.trim();
}

function resolveStickerTitle({ stickerTitle, equipmentIds }) {
  const explicit = String(stickerTitle || "").trim();
  if (explicit) {
    return explicit;
  }
  return buildEquipmentTitle(equipmentIds?.[0] || "sdb1106-nm");
}

function tryRenderSticker(login, password, title) {
  try {
    const stickerPath = renderPortalSticker({ title, login, password });
    return { stickerPath, stickerError: null };
  } catch (error) {
    return {
      stickerPath: null,
      stickerError: error instanceof Error ? error.message : String(error),
    };
  }
}

async function listEquipment() {
  return EQUIPMENT_LIST;
}

async function listUsers() {
  const pool = await getAdminPool();
  return listPortalUsers(pool);
}

async function getUser(login) {
  const pool = await getAdminPool();
  const user = await findUserByLogin(pool, login);
  if (!user) {
    const error = new Error("Аккаунт не найден.");
    error.statusCode = 404;
    throw error;
  }
  return {
    login: user.login,
    label: user.label,
    active: user.active,
    equipmentIds: user.equipmentIds,
    equipmentQuantity: user.equipmentQuantity,
    equipmentQuantities: user.equipmentQuantities,
    equipmentSerials: user.equipmentSerials,
  };
}

async function createUser({
  login,
  password,
  generatePassword = true,
  equipmentIds,
  equipmentQuantities,
  label,
  baseUrl,
  stickerTitle,
}) {
  const pool = await getAdminPool();
  const normalizedLogin = String(login || "").trim();
  if (!normalizedLogin) {
    throw new Error("Логин обязателен.");
  }
  const existing = await findUserByLogin(pool, normalizedLogin);
  if (existing) {
    const error = new Error(`Аккаунт «${existing.login}» уже существует.`);
    error.statusCode = 409;
    throw error;
  }

  const ids = Array.isArray(equipmentIds) ? equipmentIds.filter(Boolean) : [];
  if (!ids.length) {
    throw new Error("Выберите хотя бы одно оборудование.");
  }

  const finalPassword = generatePassword
    ? generateRandomPassword(12)
    : String(password || "");
  if (!finalPassword) {
    throw new Error("Пароль обязателен.");
  }

  const user = await createPortalUser(pool, {
    login: normalizedLogin,
    password: finalPassword,
    equipmentIds: ids,
    equipmentQuantities: normalizeEquipmentQuantities(ids, equipmentQuantities),
    label: label || null,
  });

  appendPortalAccountRecord({
    action: "create",
    login: user.login,
    equipmentIds: user.equipmentIds,
    equipmentQuantity: user.equipmentQuantity,
    equipmentQuantities: user.equipmentQuantities,
    label: label || null,
    baseUrl: normalizeBaseUrl(baseUrl),
    loginUrl: buildLoginUrl(baseUrl, user.equipmentIds),
  });
  saveStickerPassword(user.login, finalPassword);

  const title = resolveStickerTitle({ stickerTitle, equipmentIds: user.equipmentIds });
  const sticker = tryRenderSticker(user.login, finalPassword, title);
  return {
    user: {
      login: user.login,
      label: user.label,
      active: user.active,
      equipmentIds: user.equipmentIds,
      equipmentQuantity: user.equipmentQuantity,
      equipmentQuantities: user.equipmentQuantities,
      equipmentSerials: user.equipmentSerials,
    },
    credentials: buildStickerPayload({
      baseUrl,
      login: user.login,
      password: finalPassword,
      equipmentIds: user.equipmentIds,
      label: user.label,
    }),
    stickerTitle: title,
    ...sticker,
  };
}

async function resetUserPassword({ login, password, generatePassword = true, baseUrl, stickerTitle }) {
  const pool = await getAdminPool();
  const user = await findUserByLogin(pool, login);
  if (!user) {
    const error = new Error("Аккаунт не найден.");
    error.statusCode = 404;
    throw error;
  }

  const finalPassword = generatePassword
    ? generateRandomPassword(12)
    : String(password || "");
  if (!finalPassword) {
    throw new Error("Пароль обязателен.");
  }

  await updatePortalUserPassword(pool, login, finalPassword);
  appendPortalAccountRecord({
    action: "password_reset",
    login: user.login,
    equipmentIds: user.equipmentIds,
    label: user.label,
    baseUrl: normalizeBaseUrl(baseUrl),
    loginUrl: buildLoginUrl(baseUrl, user.equipmentIds),
  });
  saveStickerPassword(user.login, finalPassword);

  const title = resolveStickerTitle({ stickerTitle, equipmentIds: user.equipmentIds });
  const sticker = tryRenderSticker(user.login, finalPassword, title);
  return {
    user: {
      login: user.login,
      label: user.label,
      active: user.active,
      equipmentIds: user.equipmentIds,
      equipmentQuantity: user.equipmentQuantity,
      equipmentQuantities: user.equipmentQuantities,
      equipmentSerials: user.equipmentSerials,
    },
    credentials: buildStickerPayload({
      baseUrl,
      login: user.login,
      password: finalPassword,
      equipmentIds: user.equipmentIds,
      label: user.label,
    }),
    stickerTitle: title,
    ...sticker,
  };
}

async function regenerateSticker({ login, password, stickerTitle, baseUrl }) {
  const pool = await getAdminPool();
  const user = await findUserByLogin(pool, login);
  if (!user) {
    const error = new Error("Аккаунт не найден.");
    error.statusCode = 404;
    throw error;
  }

  let finalPassword = String(password || "").trim();
  if (!finalPassword) {
    finalPassword = getStickerPassword(user.login) || "";
  }
  if (!finalPassword) {
    throw new Error(
      "Пароль для наклейки не сохранён. Укажите текущий пароль или выполните «Сбросить пароль»."
    );
  }
  if (!verifyPassword(finalPassword, user.passwordHash)) {
    throw new Error("Указанный пароль не совпадает с паролем аккаунта.");
  }
  saveStickerPassword(user.login, finalPassword);

  const title = resolveStickerTitle({ stickerTitle, equipmentIds: user.equipmentIds });
  const sticker = tryRenderSticker(user.login, finalPassword, title);
  if (!sticker.stickerPath) {
    const error = new Error(sticker.stickerError || "Не удалось сгенерировать наклейку.");
    error.statusCode = 500;
    throw error;
  }

  appendPortalAccountRecord({
    action: "regenerate_sticker",
    login: user.login,
    equipmentIds: user.equipmentIds,
    equipmentQuantity: user.equipmentQuantity,
    equipmentQuantities: user.equipmentQuantities,
    label: user.label,
    baseUrl: normalizeBaseUrl(baseUrl),
    loginUrl: buildLoginUrl(baseUrl, user.equipmentIds),
  });

  return {
    user: {
      login: user.login,
      label: user.label,
      active: user.active,
      equipmentIds: user.equipmentIds,
      equipmentQuantity: user.equipmentQuantity,
      equipmentQuantities: user.equipmentQuantities,
      equipmentSerials: user.equipmentSerials,
    },
    credentials: buildStickerPayload({
      baseUrl,
      login: user.login,
      password: finalPassword,
      equipmentIds: user.equipmentIds,
      label: user.label,
    }),
    stickerTitle: title,
    ...sticker,
  };
}

async function updateLabel(login, label) {
  const pool = await getAdminPool();
  const updated = await updatePortalUserLabel(pool, login, label);
  if (!updated) {
    const error = new Error("Аккаунт не найден.");
    error.statusCode = 404;
    throw error;
  }
  appendPortalAccountRecord({
    action: "set_label",
    login: updated.login,
    equipmentIds: updated.equipmentIds,
    equipmentQuantity: updated.equipmentQuantity,
    equipmentQuantities: updated.equipmentQuantities,
    label: updated.label,
  });
  return updated;
}

async function replaceEquipment(login, equipmentIds, equipmentQuantities) {
  const pool = await getAdminPool();
  const ids = Array.isArray(equipmentIds) ? equipmentIds.filter(Boolean) : [];
  if (!ids.length) {
    throw new Error("Выберите хотя бы одно оборудование.");
  }
  const updated = await setPortalUserEquipment(
    pool,
    login,
    ids,
    normalizeEquipmentQuantities(ids, equipmentQuantities)
  );
  if (!updated) {
    const error = new Error("Аккаунт не найден.");
    error.statusCode = 404;
    throw error;
  }
  appendPortalAccountRecord({
    action: "set_equipment",
    login: updated.login,
    equipmentIds: updated.equipmentIds,
    equipmentQuantity: updated.equipmentQuantity,
    equipmentQuantities: updated.equipmentQuantities,
    label: updated.label,
  });
  return updated;
}

async function updateEquipmentQuantities(login, equipmentQuantities) {
  const pool = await getAdminPool();
  const user = await findUserByLogin(pool, login);
  if (!user) {
    const error = new Error("Аккаунт не найден.");
    error.statusCode = 404;
    throw error;
  }
  const updated = await updatePortalUserEquipmentQuantities(
    pool,
    login,
    normalizeEquipmentQuantities(user.equipmentIds, equipmentQuantities)
  );
  if (!updated) {
    const error = new Error("Аккаунт не найден.");
    error.statusCode = 404;
    throw error;
  }
  appendPortalAccountRecord({
    action: "set_equipment_quantity",
    login: updated.login,
    equipmentIds: updated.equipmentIds,
    equipmentQuantity: updated.equipmentQuantity,
    equipmentQuantities: updated.equipmentQuantities,
    label: updated.label,
  });
  return updated;
}

async function updateEquipmentSerials(login, equipmentSerials) {
  const pool = await getAdminPool();
  const user = await findUserByLogin(pool, login);
  if (!user) {
    const error = new Error("Аккаунт не найден.");
    error.statusCode = 404;
    throw error;
  }
  const updated = await updatePortalUserEquipmentSerials(pool, login, equipmentSerials || {});
  if (!updated) {
    const error = new Error("Аккаунт не найден.");
    error.statusCode = 404;
    throw error;
  }
  appendPortalAccountRecord({
    action: "set_equipment_serials",
    login: updated.login,
    equipmentIds: updated.equipmentIds,
    equipmentQuantity: updated.equipmentQuantity,
    equipmentQuantities: updated.equipmentQuantities,
    equipmentSerials: updated.equipmentSerials,
    label: updated.label,
  });
  return updated;
}

async function setActive(login, active) {
  const pool = await getAdminPool();
  const updated = await setPortalUserActive(pool, login, Boolean(active));
  if (!updated) {
    const error = new Error("Аккаунт не найден.");
    error.statusCode = 404;
    throw error;
  }
  appendPortalAccountRecord({
    action: updated.active ? "activate" : "deactivate",
    login: updated.login,
    equipmentIds: updated.equipmentIds,
    equipmentQuantity: updated.equipmentQuantity,
    equipmentQuantities: updated.equipmentQuantities,
    label: updated.label,
    active: updated.active,
  });
  return updated;
}

async function deleteUser(login) {
  const pool = await getAdminPool();
  const deleted = await deletePortalUser(pool, login);
  if (!deleted) {
    const error = new Error("Аккаунт не найден.");
    error.statusCode = 404;
    throw error;
  }
  appendPortalAccountRecord({
    action: "delete",
    login: deleted.login,
    equipmentIds: deleted.equipmentIds,
    equipmentQuantity: deleted.equipmentQuantity,
    equipmentQuantities: deleted.equipmentQuantities,
    label: deleted.label,
    active: deleted.active,
  });
  removeStickerPassword(deleted.login);
  return {
    login: deleted.login,
    label: deleted.label,
    active: deleted.active,
    equipmentIds: deleted.equipmentIds,
    equipmentQuantity: deleted.equipmentQuantity,
    equipmentQuantities: deleted.equipmentQuantities,
    equipmentSerials: deleted.equipmentSerials,
  };
}

module.exports = {
  EQUIPMENT_LIST,
  listEquipment,
  listUsers,
  getUser,
  createUser,
  resetUserPassword,
  regenerateSticker,
  updateLabel,
  replaceEquipment,
  updateEquipmentQuantities,
  updateEquipmentSerials,
  setActive,
  deleteUser,
};
