const crypto = require("crypto");

const SCRYPT_PARAMS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
};
const SALT_BYTES = 16;
const KEY_BYTES = 64;
const MIN_PASSWORD_LENGTH = 12;

function hashPassword(plainPassword) {
  const password = String(plainPassword || "");
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  const salt = crypto.randomBytes(SALT_BYTES);
  const derived = crypto.scryptSync(password, salt, KEY_BYTES, SCRYPT_PARAMS);
  return [
    "scrypt",
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

function verifyPassword(plainPassword, storedHash) {
  const password = String(plainPassword || "");
  const parts = String(storedHash || "").split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }
  const salt = Buffer.from(parts[1], "base64url");
  const expected = Buffer.from(parts[2], "base64url");
  const derived = crypto.scryptSync(password, salt, expected.length, SCRYPT_PARAMS);
  if (derived.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(derived, expected);
}

function generateRandomPassword(length = 12) {
  const targetLength = Math.max(MIN_PASSWORD_LENGTH, Number(length) || MIN_PASSWORD_LENGTH);
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(targetLength);
  let out = "";
  for (let i = 0; i < targetLength; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

module.exports = {
  MIN_PASSWORD_LENGTH,
  hashPassword,
  verifyPassword,
  generateRandomPassword,
};
