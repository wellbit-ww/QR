const path = require("path");
const { getAuthConfig } = require("./auth-config");
const { resolveEquipmentId } = require("../equipment/equipment-runtime");
const {
  authenticateUser,
  userHasEquipmentAccess,
  findUserByLogin,
} = require("./portal-users");
const {
  isLoginRateLimited,
  recordFailedLogin,
  failedLoginDelay,
} = require("./login-rate-limit");

function equipmentIdFromAppPath(path) {
  if (typeof path !== "string") {
    return null;
  }
  if (!path.startsWith("/chat") && !path.startsWith("/support")) {
    return null;
  }
  const u = new URL(path, "http://local");
  const eq = u.searchParams.get("equipment");
  return typeof eq === "string" && eq.trim() ? eq.trim() : null;
}

/** После входа — карточка оборудования или каталог, не чат/форма. */
function resolvePostLoginRedirect({ equipmentHint, nextPath, equipmentIds }) {
  const allowed = new Set(equipmentIds || []);
  const hintCanonical = equipmentHint ? resolveEquipmentId(equipmentHint) : null;
  const safeNext =
    typeof nextPath === "string" && nextPath.startsWith("/") && !nextPath.startsWith("//")
      ? nextPath
      : null;

  if (equipmentHint && (allowed.has(equipmentHint) || (hintCanonical && allowed.has(hintCanonical)))) {
    return `/equipment/${equipmentHint}`;
  }

  if (safeNext) {
    const fromApp = equipmentIdFromAppPath(safeNext);
    const fromCanonical = fromApp ? resolveEquipmentId(fromApp) : null;
    if (fromApp && (allowed.has(fromApp) || (fromCanonical && allowed.has(fromCanonical)))) {
      return `/equipment/${fromApp}`;
    }

    const equipmentMatch = safeNext.match(/^\/equipment\/([^/?#]+)/);
    if (
      equipmentMatch &&
      (allowed.has(equipmentMatch[1]) || allowed.has(resolveEquipmentId(equipmentMatch[1])))
    ) {
      return safeNext.split("?")[0];
    }

    if (safeNext === "/" || safeNext.startsWith("/?")) {
      return "/";
    }
  }

  if (allowed.size === 1) {
    const [only] = allowed;
    return `/equipment/${only}`;
  }

  return "/";
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function mountAuthRoutes(app, { publicDir, getPool }) {
  const loginHtmlPath = path.join(publicDir, "login.html");

  app.get("/login", (req, res) => {
    return res.sendFile(loginHtmlPath);
  });

  app.get("/api/auth/me", async (req, res) => {
    const authConfig = getAuthConfig();
    if (!authConfig.authRequired) {
      return res.json({ authRequired: false });
    }
    const user = req.session?.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    let equipmentSerials = {};
    const pool = getPool();
    if (pool) {
      try {
        const freshUser = await findUserByLogin(pool, user.login);
        if (freshUser?.equipmentSerials) {
          equipmentSerials = freshUser.equipmentSerials;
        }
      } catch {
        /* keep empty serials */
      }
    }

    return res.json({
      authRequired: true,
      login: user.login,
      equipmentIds: user.equipmentIds,
      label: user.label || null,
      equipmentSerials,
    });
  });

  app.post("/api/auth/login", async (req, res) => {
    const authConfig = getAuthConfig();
    if (!authConfig.authRequired) {
      return res.json({ ok: true, authRequired: false });
    }

    if (isLoginRateLimited(req)) {
      return res.status(429).json({
        error: "Слишком много попыток входа. Повторите позже.",
      });
    }

    const pool = getPool();
    if (!pool) {
      return res.status(503).json({
        error: "Сервис входа временно недоступен.",
      });
    }

    const login = req.body?.login;
    const password = req.body?.password;
    const equipmentHint =
      typeof req.body?.equipment === "string"
        ? req.body.equipment.trim()
        : typeof req.query?.equipment === "string"
          ? req.query.equipment.trim()
          : null;
    const nextPath =
      typeof req.body?.next === "string" ? req.body.next.trim() : null;

    try {
      const user = await authenticateUser(pool, login, password);
      if (!user) {
        recordFailedLogin(req);
        await failedLoginDelay();
        return res.status(401).json({
          error: "Неверный логин или пароль.",
        });
      }

      if (
        equipmentHint &&
        !userHasEquipmentAccess(user, equipmentHint)
      ) {
        return res.status(403).json({
          error: "У этой учётной записи нет доступа к указанному оборудованию.",
        });
      }

      await regenerateSession(req);
      req.session.user = {
        id: user.id,
        login: user.login,
        equipmentIds: user.equipmentIds,
        label: user.label,
      };

      const redirectTo = resolvePostLoginRedirect({
        equipmentHint,
        nextPath,
        equipmentIds: user.equipmentIds,
      });

      return res.json({
        ok: true,
        redirectTo,
        login: user.login,
        equipmentIds: user.equipmentIds,
      });
    } catch (error) {
      return res.status(500).json({
        error: "Не удалось выполнить вход.",
      });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    if (!req.session) {
      return res.json({ ok: true });
    }
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Не удалось выйти." });
      }
      res.clearCookie("portal.sid", {
        path: "/",
        sameSite: "lax",
        secure: getAuthConfig().cookieSecure,
      });
      return res.json({ ok: true });
    });
  });
}

module.exports = {
  mountAuthRoutes,
  resolvePostLoginRedirect,
};
