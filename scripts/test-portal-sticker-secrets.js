/**
 * Unit tests for encrypted sticker password storage.
 * Run: node scripts/test-portal-sticker-secrets.js
 */
require("./load-env-file").loadEnvFile();

const fs = require("fs");
const path = require("path");
const os = require("os");
const {
  saveStickerPassword,
  getStickerPassword,
  removeStickerPassword,
} = require("../src/auth/portal-sticker-secrets");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function withTempStore(run) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "portal-sticker-secrets-"));
  const storePath = path.join(tempDir, "secrets.json");
  const previous = process.env.PORTAL_STICKER_SECRETS_PATH;
  const previousSecret = process.env.SESSION_SECRET;
  process.env.PORTAL_STICKER_SECRETS_PATH = storePath;
  process.env.SESSION_SECRET = "01234567890123456789012345678901";
  try {
    run(storePath);
  } finally {
    if (previous === undefined) {
      delete process.env.PORTAL_STICKER_SECRETS_PATH;
    } else {
      process.env.PORTAL_STICKER_SECRETS_PATH = previous;
    }
    if (previousSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = previousSecret;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function main() {
  withTempStore((storePath) => {
    saveStickerPassword("Acme01", "SecretPass1234");
    assert(fs.existsSync(storePath), "secrets file should be created");
    assert(getStickerPassword("acme01") === "SecretPass1234", "password should round-trip");
    assert(getStickerPassword("missing") === null, "missing login returns null");

    removeStickerPassword("Acme01");
    assert(getStickerPassword("acme01") === null, "password should be removed");
  });

  console.log("OK: portal sticker secrets tests passed.");
}

main();
