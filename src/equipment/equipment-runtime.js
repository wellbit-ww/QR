/**
 * Equipment runtime — resolves per-model profiles (Phase F).
 * New models add a profile module and register it here.
 */
const sdb1106nmProfile = require("./profiles/sdb1106-nm");

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
});

/**
 * @param {string|null|undefined} equipmentId
 * @returns {EquipmentProfile|null}
 */
function resolveEquipmentProfile(equipmentId) {
  if (!equipmentId) {
    return null;
  }
  return PROFILES[String(equipmentId)] || null;
}

function listEquipmentProfileIds() {
  return Object.keys(PROFILES);
}

module.exports = {
  resolveEquipmentProfile,
  listEquipmentProfileIds,
  PROFILES,
};
