const { hashPassword, verifyPassword } = require("./password");
const { resolveEquipmentId } = require("../equipment/equipment-runtime");

function normalizeLogin(login) {
  return String(login || "").trim().toLowerCase();
}

function normalizeEquipmentIds(equipmentIds) {
  const raw = Array.isArray(equipmentIds) ? equipmentIds : [equipmentIds];
  const out = [];
  for (const id of raw) {
    const v = String(id || "").trim();
    if (v && !out.includes(v)) {
      out.push(v);
    }
  }
  return out;
}

function normalizeEquipmentQuantity(value) {
  const quantity = Number.parseInt(value, 10);
  if (!Number.isFinite(quantity) || quantity < 1) {
    return 1;
  }
  return quantity;
}

function normalizeEquipmentQuantities(equipmentIds, quantities = {}, fallbackQuantity = 1) {
  const ids = normalizeEquipmentIds(equipmentIds);
  const source = quantities && typeof quantities === "object" && !Array.isArray(quantities)
    ? quantities
    : {};
  const fallback = normalizeEquipmentQuantity(fallbackQuantity);
  const out = {};

  for (const id of ids) {
    out[id] = normalizeEquipmentQuantity(source[id] ?? fallback);
  }
  return out;
}

const MAX_EQUIPMENT_SERIAL_LEN = 80;

function normalizeEquipmentSerialNumber(value) {
  return String(value ?? "").trim().slice(0, MAX_EQUIPMENT_SERIAL_LEN);
}

function normalizeEquipmentSerials(equipmentIds, quantities = {}, serials = {}) {
  const ids = normalizeEquipmentIds(equipmentIds);
  const qtyMap = normalizeEquipmentQuantities(ids, quantities, 1);
  const source =
    serials && typeof serials === "object" && !Array.isArray(serials) ? serials : {};
  const out = {};

  for (const id of ids) {
    const count = qtyMap[id];
    const existing = Array.isArray(source[id]) ? source[id] : [];
    const row = [];
    for (let index = 0; index < count; index += 1) {
      row.push(normalizeEquipmentSerialNumber(existing[index]));
    }
    out[id] = row;
  }
  return out;
}

function sumEquipmentQuantities(equipmentIds, quantities) {
  const ids = normalizeEquipmentIds(equipmentIds);
  const normalized = normalizeEquipmentQuantities(ids, quantities, 1);
  return ids.reduce((total, id) => total + normalized[id], 0);
}

function rowToUser(row) {
  if (!row) {
    return null;
  }
  const equipmentIds = Array.isArray(row.equipment_ids) ? row.equipment_ids : [];
  const equipmentQuantities = normalizeEquipmentQuantities(
    equipmentIds,
    row.equipment_quantities,
    row.equipment_quantity
  );
  const equipmentSerials = normalizeEquipmentSerials(
    equipmentIds,
    equipmentQuantities,
    row.equipment_serials
  );
  return {
    id: row.id,
    login: row.login,
    passwordHash: row.password_hash,
    equipmentIds,
    equipmentQuantities,
    equipmentSerials,
    equipmentQuantity: sumEquipmentQuantities(equipmentIds, equipmentQuantities),
    label: row.label || null,
    active: row.active !== false,
  };
}

async function listPortalUsers(pool) {
  const result = await pool.query(
    `SELECT login, equipment_ids, equipment_quantity, equipment_quantities, equipment_serials, label, active
     FROM portal_users
     ORDER BY LOWER(login)`
  );
  return result.rows.map((row) => rowToUser(row));
}

async function findUserByLogin(pool, login) {
  const normalized = normalizeLogin(login);
  if (!normalized) {
    return null;
  }
  const result = await pool.query(
    `SELECT id, login, password_hash, equipment_ids, equipment_quantity, equipment_quantities, equipment_serials, label, active
     FROM portal_users
     WHERE LOWER(login) = $1
     LIMIT 1`,
    [normalized]
  );
  return rowToUser(result.rows[0]);
}

async function authenticateUser(pool, login, plainPassword) {
  const user = await findUserByLogin(pool, login);
  if (!user || !user.active) {
    return null;
  }
  const ok = verifyPassword(plainPassword, user.passwordHash);
  if (!ok) {
    return null;
  }
  return {
    id: user.id,
    login: user.login,
    equipmentIds: user.equipmentIds,
    label: user.label,
  };
}

async function createPortalUser(pool, {
  login,
  password,
  equipmentIds,
  equipmentQuantities,
  equipmentQuantity,
  equipmentSerials,
  label,
}) {
  const normalizedLogin = normalizeLogin(login);
  const ids = normalizeEquipmentIds(equipmentIds);
  if (!normalizedLogin) {
    throw new Error("Login is required.");
  }
  if (!ids.length) {
    throw new Error("At least one equipment id is required.");
  }
  const passwordHash = hashPassword(password);
  const quantities = normalizeEquipmentQuantities(ids, equipmentQuantities, equipmentQuantity);
  const serials = normalizeEquipmentSerials(ids, quantities, equipmentSerials);
  const quantity = sumEquipmentQuantities(ids, quantities);
  const result = await pool.query(
    `INSERT INTO portal_users (login, password_hash, equipment_ids, equipment_quantity, equipment_quantities, equipment_serials, label)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, login, equipment_ids, equipment_quantity, equipment_quantities, equipment_serials, label, active`,
    [normalizedLogin, passwordHash, ids, quantity, quantities, serials, label || null]
  );
  return rowToUser(result.rows[0]);
}

async function updatePortalUserPassword(pool, login, password) {
  const normalizedLogin = normalizeLogin(login);
  const passwordHash = hashPassword(password);
  const result = await pool.query(
    `UPDATE portal_users
     SET password_hash = $2, updated_at = NOW()
     WHERE LOWER(login) = $1
     RETURNING id, login, equipment_ids, equipment_quantity, equipment_quantities, equipment_serials, label, active`,
    [normalizedLogin, passwordHash]
  );
  return rowToUser(result.rows[0]);
}

async function appendEquipmentToUser(pool, login, equipmentIds) {
  const normalizedLogin = normalizeLogin(login);
  const add = normalizeEquipmentIds(equipmentIds);
  const user = await findUserByLogin(pool, login);
  if (!user) {
    return null;
  }
  const next = normalizeEquipmentIds([...user.equipmentIds, ...add]);
  const quantities = normalizeEquipmentQuantities(next, user.equipmentQuantities, 1);
  const serials = normalizeEquipmentSerials(next, quantities, user.equipmentSerials);
  const quantity = sumEquipmentQuantities(next, quantities);
  const result = await pool.query(
    `UPDATE portal_users
     SET equipment_ids = $2,
         equipment_quantity = $3,
         equipment_quantities = $4,
         equipment_serials = $5,
         updated_at = NOW()
     WHERE LOWER(login) = $1
     RETURNING id, login, equipment_ids, equipment_quantity, equipment_quantities, equipment_serials, label, active`,
    [normalizedLogin, next, quantity, quantities, serials]
  );
  return rowToUser(result.rows[0]);
}

async function removeEquipmentFromUser(pool, login, equipmentIds) {
  const normalizedLogin = normalizeLogin(login);
  const remove = new Set(normalizeEquipmentIds(equipmentIds));
  const user = await findUserByLogin(pool, login);
  if (!user) {
    return null;
  }
  const next = user.equipmentIds.filter((id) => !remove.has(id));
  if (!next.length) {
    throw new Error("Cannot remove all equipment from an account.");
  }
  const quantities = normalizeEquipmentQuantities(next, user.equipmentQuantities, 1);
  const serials = normalizeEquipmentSerials(next, quantities, user.equipmentSerials);
  const quantity = sumEquipmentQuantities(next, quantities);
  const result = await pool.query(
    `UPDATE portal_users
     SET equipment_ids = $2,
         equipment_quantity = $3,
         equipment_quantities = $4,
         equipment_serials = $5,
         updated_at = NOW()
     WHERE LOWER(login) = $1
     RETURNING id, login, equipment_ids, equipment_quantity, equipment_quantities, equipment_serials, label, active`,
    [normalizedLogin, next, quantity, quantities, serials]
  );
  return rowToUser(result.rows[0]);
}

async function setPortalUserEquipment(pool, login, equipmentIds, equipmentQuantities) {
  const normalizedLogin = normalizeLogin(login);
  const ids = normalizeEquipmentIds(equipmentIds);
  if (!ids.length) {
    throw new Error("At least one equipment id is required.");
  }
  const user = await findUserByLogin(pool, login);
  const quantities = normalizeEquipmentQuantities(
    ids,
    equipmentQuantities || user?.equipmentQuantities,
    user?.equipmentQuantity || 1
  );
  const serials = normalizeEquipmentSerials(ids, quantities, user?.equipmentSerials);
  const quantity = sumEquipmentQuantities(ids, quantities);
  const result = await pool.query(
    `UPDATE portal_users
     SET equipment_ids = $2,
         equipment_quantity = $3,
         equipment_quantities = $4,
         equipment_serials = $5,
         updated_at = NOW()
     WHERE LOWER(login) = $1
     RETURNING id, login, equipment_ids, equipment_quantity, equipment_quantities, equipment_serials, label, active`,
    [normalizedLogin, ids, quantity, quantities, serials]
  );
  return rowToUser(result.rows[0]);
}

async function updatePortalUserLabel(pool, login, label) {
  const normalizedLogin = normalizeLogin(login);
  const result = await pool.query(
    `UPDATE portal_users
     SET label = $2, updated_at = NOW()
     WHERE LOWER(login) = $1
     RETURNING id, login, equipment_ids, equipment_quantity, equipment_quantities, equipment_serials, label, active`,
    [normalizedLogin, label || null]
  );
  return rowToUser(result.rows[0]);
}

async function setPortalUserActive(pool, login, active) {
  const normalizedLogin = normalizeLogin(login);
  const result = await pool.query(
    `UPDATE portal_users
     SET active = $2, updated_at = NOW()
     WHERE LOWER(login) = $1
     RETURNING id, login, equipment_ids, equipment_quantity, equipment_quantities, equipment_serials, label, active`,
    [normalizedLogin, Boolean(active)]
  );
  return rowToUser(result.rows[0]);
}

async function updatePortalUserEquipmentQuantities(pool, login, equipmentQuantities) {
  const normalizedLogin = normalizeLogin(login);
  const user = await findUserByLogin(pool, login);
  if (!user) {
    return null;
  }
  const quantities = normalizeEquipmentQuantities(
    user.equipmentIds,
    equipmentQuantities,
    user.equipmentQuantity
  );
  const serials = normalizeEquipmentSerials(user.equipmentIds, quantities, user.equipmentSerials);
  const quantity = sumEquipmentQuantities(user.equipmentIds, quantities);
  const result = await pool.query(
    `UPDATE portal_users
     SET equipment_quantity = $2,
         equipment_quantities = $3,
         equipment_serials = $4,
         updated_at = NOW()
     WHERE LOWER(login) = $1
     RETURNING id, login, equipment_ids, equipment_quantity, equipment_quantities, equipment_serials, label, active`,
    [normalizedLogin, quantity, quantities, serials]
  );
  return rowToUser(result.rows[0]);
}

async function updatePortalUserEquipmentSerials(pool, login, equipmentSerials) {
  const normalizedLogin = normalizeLogin(login);
  const user = await findUserByLogin(pool, login);
  if (!user) {
    return null;
  }
  const serials = normalizeEquipmentSerials(
    user.equipmentIds,
    user.equipmentQuantities,
    equipmentSerials
  );
  const result = await pool.query(
    `UPDATE portal_users
     SET equipment_serials = $2,
         updated_at = NOW()
     WHERE LOWER(login) = $1
     RETURNING id, login, equipment_ids, equipment_quantity, equipment_quantities, equipment_serials, label, active`,
    [normalizedLogin, serials]
  );
  return rowToUser(result.rows[0]);
}

async function deletePortalUser(pool, login) {
  const normalizedLogin = normalizeLogin(login);
  if (!normalizedLogin) {
    return null;
  }
  const result = await pool.query(
    `DELETE FROM portal_users
     WHERE LOWER(login) = $1
     RETURNING id, login, equipment_ids, equipment_quantity, equipment_quantities, equipment_serials, label, active`,
    [normalizedLogin]
  );
  return rowToUser(result.rows[0]);
}

function userHasEquipmentAccess(user, equipmentId) {
  if (!user || !Array.isArray(user.equipmentIds)) {
    return false;
  }
  const canonical = resolveEquipmentId(equipmentId);
  return user.equipmentIds.includes(equipmentId) || user.equipmentIds.includes(canonical);
}

module.exports = {
  normalizeLogin,
  normalizeEquipmentIds,
  normalizeEquipmentQuantity,
  normalizeEquipmentQuantities,
  normalizeEquipmentSerialNumber,
  normalizeEquipmentSerials,
  listPortalUsers,
  findUserByLogin,
  authenticateUser,
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
  userHasEquipmentAccess,
};
