/**
 * Equipment runtime — resolves per-model profiles (Phase F).
 * New models add a profile module and register it here.
 */
const sdb1106nmProfile = require("./profiles/sdb1106-nm");
const sdb702nmProfile = require("./profiles/sdb702-nm");
const sdb151nmProfile = require("./profiles/sdb151-nm");
const sdb1560mProfile = require("./profiles/sdb1560m");
const w700Profile = require("./profiles/w-700");

/** Public URL/label aliases → catalog id (Postgres / knowledge keep the canonical id). */
const EQUIPMENT_ID_ALIASES = Object.freeze({
  "sdb302-nm": "w-700",
});

/** @typedef {object} EquipmentProfile
 * @property {string} id
 * @property {string} [label]
 * @property {boolean} [autoDirectWhenNoPostgres]
 * @property {boolean} [deferGuardrailsToPostGate]
 * @property {(message: string, ctx?: object) => object|null} [classifyPreGate]
 * @property {(message: string, ctx?: object) => string|null} [tryDeterministicAnswer]
 * @property {(message: string, docText: string) => object} [buildSafetyDeterministicOrPrompt]
 * @property {(message: string) => string} [directContextHints]
 * @property {(systemPrompt: string, docText: string) => string} [buildDirectSystemContent]
 * @property {(docText: string, message: string) => string} [extractSafetyDocExcerpt]
 * @property {(params: object) => object} [applyPostGate]
 */

/** @type {Record<string, EquipmentProfile>} */
const PROFILES = Object.freeze({
  [sdb1106nmProfile.id]: sdb1106nmProfile,
  [sdb702nmProfile.id]: sdb702nmProfile,
  [sdb151nmProfile.id]: sdb151nmProfile,
  [sdb1560mProfile.id]: sdb1560mProfile,
  [w700Profile.id]: w700Profile,
});

function resolveEquipmentId(equipmentId) {
  const raw = String(equipmentId || "").trim();
  if (!raw) {
    return raw;
  }
  return EQUIPMENT_ID_ALIASES[raw] || raw;
}

/**
 * @param {string|null|undefined} equipmentId
 * @returns {EquipmentProfile|null}
 */
function resolveEquipmentProfile(equipmentId) {
  if (!equipmentId) {
    return null;
  }
  const canonical = resolveEquipmentId(equipmentId);
  return PROFILES[canonical] || PROFILES[String(equipmentId)] || null;
}

function listEquipmentProfileIds() {
  return Object.keys(PROFILES);
}

module.exports = {
  resolveEquipmentId,
  resolveEquipmentProfile,
  listEquipmentProfileIds,
  PROFILES,
};
