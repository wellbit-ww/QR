function isAuthRequired() {
  const raw = String(process.env.AUTH_REQUIRED ?? "1").trim().toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "no" || raw === "off");
}

function isProductionRuntime() {
  const raw = String(process.env.NODE_ENV || "").trim().toLowerCase();
  return raw === "production" || raw === "prod";
}

function isKnownWeakSessionSecret(secret) {
  const value = String(secret || "").trim();
  if (!value || value.length < 32) {
    return true;
  }
  return (
    value === "change_me_to_random_string_at_least_32_chars" ||
    value.toLowerCase().includes("change_me")
  );
}

function isKnownDefaultPostgresUrl(postgresUrl) {
  const value = String(postgresUrl || "").trim().toLowerCase();
  return (
    value.includes("rag_secret_change_me") ||
    value.includes("change_me")
  );
}

const DEFAULT_SESSION_MAX_AGE_MS = 30 * 60 * 1000;

function getAuthConfig() {
  const sessionSecret = String(process.env.SESSION_SECRET || "").trim();
  const maxAgeMs = Math.max(
    60_000,
    Number(process.env.SESSION_MAX_AGE_MS || DEFAULT_SESSION_MAX_AGE_MS)
  );
  const trustProxy =
    String(process.env.TRUST_PROXY || "").trim() === "1" ||
    String(process.env.TRUST_PROXY || "").trim().toLowerCase() === "true";
  const cookieSecure =
    trustProxy ||
    String(process.env.SESSION_COOKIE_SECURE || "").trim() === "1";

  return {
    authRequired: isAuthRequired(),
    sessionSecret,
    sessionMaxAgeMs: maxAgeMs,
    trustProxy,
    cookieSecure,
  };
}

module.exports = {
  isAuthRequired,
  isProductionRuntime,
  isKnownWeakSessionSecret,
  isKnownDefaultPostgresUrl,
  getAuthConfig,
};
