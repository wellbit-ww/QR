const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DEFAULT_STORE_PATH = path.join(__dirname, "..", "..", "data", "portal-sticker-secrets.json");
const KEY_SALT = "portal-sticker-secrets-v1";

function resolveStorePath() {
  const fromEnv = process.env.PORTAL_STICKER_SECRETS_PATH;
  if (typeof fromEnv === "string" && fromEnv.trim()) {
    return path.resolve(fromEnv.trim());
  }
  return DEFAULT_STORE_PATH;
}

function deriveEncryptionKey() {
  const secret = String(process.env.PORTAL_STICKER_SECRET || process.env.SESSION_SECRET || "").trim();
  if (secret.length < 16) {
    throw new Error(
      "Для повторной печати наклеек задайте SESSION_SECRET (≥16 символов) в .env."
    );
  }
  return crypto.scryptSync(secret, KEY_SALT, 32);
}

function encryptPassword(plainPassword) {
  const key = deriveEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(plainPassword || ""), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptPassword(payload) {
  const parts = String(payload || "").split(".");
  if (parts.length !== 3) {
    return null;
  }
  try {
    const key = deriveEncryptionKey();
    const iv = Buffer.from(parts[0], "base64url");
    const tag = Buffer.from(parts[1], "base64url");
    const encrypted = Buffer.from(parts[2], "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  } catch (_) {
    return null;
  }
}

function normalizeLogin(login) {
  return String(login || "").trim().toLowerCase();
}

function readStore() {
  const storePath = resolveStorePath();
  if (!fs.existsSync(storePath)) {
    return { version: 1, accounts: {} };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath, "utf8"));
    if (!parsed || typeof parsed !== "object" || typeof parsed.accounts !== "object") {
      return { version: 1, accounts: {} };
    }
    return parsed;
  } catch (_) {
    return { version: 1, accounts: {} };
  }
}

function writeStore(store) {
  const storePath = resolveStorePath();
  const dir = path.dirname(storePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  try {
    fs.chmodSync(storePath, 0o600);
  } catch (_) {
    // Windows may ignore POSIX modes.
  }
}

function saveStickerPassword(login, password) {
  const normalized = normalizeLogin(login);
  if (!normalized || !password) {
    return resolveStorePath();
  }
  const store = readStore();
  store.accounts[normalized] = {
    enc: encryptPassword(password),
    updatedAt: new Date().toISOString(),
  };
  writeStore(store);
  return resolveStorePath();
}

function getStickerPassword(login) {
  const normalized = normalizeLogin(login);
  if (!normalized) {
    return null;
  }
  const store = readStore();
  const entry = store.accounts[normalized];
  if (!entry?.enc) {
    return null;
  }
  return decryptPassword(entry.enc);
}

function removeStickerPassword(login) {
  const normalized = normalizeLogin(login);
  if (!normalized) {
    return resolveStorePath();
  }
  const store = readStore();
  if (store.accounts[normalized]) {
    delete store.accounts[normalized];
    writeStore(store);
  }
  return resolveStorePath();
}

module.exports = {
  resolveStorePath,
  saveStickerPassword,
  getStickerPassword,
  removeStickerPassword,
};
