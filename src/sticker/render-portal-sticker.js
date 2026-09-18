const { spawnSync } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const PYTHON_SCRIPT = path.join(ROOT, "scripts", "generate-portal-sticker.py");
const DEFAULT_OUTPUT_DIR = path.join(ROOT, "stickers");

function resolvePythonCommand() {
  const fromEnv = process.env.PYTHON || process.env.PYTHON_EXE;
  if (fromEnv && String(fromEnv).trim()) {
    return String(fromEnv).trim();
  }
  return process.platform === "win32" ? "python" : "python3";
}

function sanitizeFilename(value) {
  return String(value || "sticker")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_") || "sticker";
}

function renderPortalSticker({ title, login, password, outputPath } = {}) {
  const normalizedTitle = String(title || "").trim();
  const normalizedLogin = String(login || "").trim();
  const normalizedPassword = String(password || "");
  if (!normalizedLogin || !normalizedPassword) {
    throw new Error("Login and password are required to render a sticker.");
  }

  const args = [
    PYTHON_SCRIPT,
    "--title",
    normalizedTitle,
    "--login",
    normalizedLogin,
    "--password",
    normalizedPassword,
  ];

  if (outputPath) {
    args.push("--output", outputPath);
  }

  const result = spawnSync(resolvePythonCommand(), args, {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
  });

  if (result.error) {
    throw new Error(
      `Sticker generator failed to start Python (${result.error.message}). ` +
        "Install Pillow: python -m pip install -r scripts/requirements-sticker.txt",
    );
  }

  const stderr = String(result.stderr || "").trim();
  const stdout = String(result.stdout || "").trim();
  if (result.status !== 0) {
    throw new Error(stderr || stdout || "Sticker generation failed.");
  }

  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const savedPath = lines[lines.length - 1] || outputPath || path.join(DEFAULT_OUTPUT_DIR, `${sanitizeFilename(normalizedLogin)}.png`);
  return savedPath;
}

module.exports = {
  renderPortalSticker,
  DEFAULT_OUTPUT_DIR,
};
