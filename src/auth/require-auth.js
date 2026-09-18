const { getAuthConfig } = require("./auth-config");
const { resolveEquipmentId } = require("../equipment/equipment-runtime");

const PUBLIC_PATHS = new Set([
  "/login",
  "/styles.css",
  "/favicon.svg",
  "/login.js",
]);

const PUBLIC_API_PREFIXES = ["/api/auth/login", "/api/auth/logout"];

const PUBLIC_ASSET_RE = /\.(?:png|jpe?g|webp|gif|svg|ico|css|js)$/i;

function isPublicPath(req) {
  const pathOnly = req.path || req.url?.split("?")[0] || "";
  if (PUBLIC_ASSET_RE.test(pathOnly)) {
    return true;
  }
  if (PUBLIC_PATHS.has(pathOnly)) {
    return true;
  }
  if (req.method === "POST" && pathOnly === "/api/auth/login") {
    return true;
  }
  if (req.method === "POST" && pathOnly === "/api/auth/logout") {
    return true;
  }
  return PUBLIC_API_PREFIXES.some((p) => pathOnly === p);
}

function buildLoginRedirectUrl(req) {
  const pathOnly = req.path || "";
  let next = `${req.originalUrl || req.url || "/"}`;

  if (
    pathOnly === "/chat" ||
    pathOnly.startsWith("/chat/") ||
    pathOnly === "/support" ||
    pathOnly.startsWith("/support/")
  ) {
    const equipment = req.query?.equipment;
    if (typeof equipment === "string" && equipment.trim()) {
      next = `/equipment/${equipment.trim()}`;
    } else {
      next = "/";
    }
  }

  const params = new URLSearchParams();
  params.set("next", next);
  const equipment = req.query?.equipment;
  if (typeof equipment === "string" && equipment.trim()) {
    params.set("equipment", equipment.trim());
  }
  return `/login?${params.toString()}`;
}

function wantsJson(req) {
  const accept = String(req.headers.accept || "");
  return (
    req.path.startsWith("/api/") ||
    accept.includes("application/json") ||
    req.get("content-type") === "application/json"
  );
}

function requireAuth(req, res, next) {
  const authConfig = getAuthConfig();
  if (!authConfig.authRequired) {
    return next();
  }
  if (isPublicPath(req)) {
    return next();
  }
  if (req.session?.user?.id) {
    return next();
  }
  if (wantsJson(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return res.redirect(302, buildLoginRedirectUrl(req));
}

function getSessionUser(req) {
  if (!getAuthConfig().authRequired) {
    return null;
  }
  return req.session?.user || null;
}

function equipmentAllowedForRequest(req, equipmentId) {
  const user = getSessionUser(req);
  if (!user) {
    return true;
  }
  if (!equipmentId) {
    return false;
  }
  const ids = Array.isArray(user.equipmentIds) ? user.equipmentIds : [];
  const canonical = resolveEquipmentId(equipmentId);
  return ids.includes(equipmentId) || ids.includes(canonical);
}

function filterEquipmentListForUser(list, req) {
  const user = getSessionUser(req);
  if (!user || !Array.isArray(user.equipmentIds) || !user.equipmentIds.length) {
    return list;
  }
  const allowed = new Set(user.equipmentIds);
  return list.filter(
    (item) => allowed.has(item.id) || (item.publicId && allowed.has(item.publicId))
  );
}

module.exports = {
  requireAuth,
  getSessionUser,
  equipmentAllowedForRequest,
  filterEquipmentListForUser,
  buildLoginRedirectUrl,
  isPublicPath,
};
