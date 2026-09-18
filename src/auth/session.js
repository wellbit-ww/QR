const session = require("express-session");
const connectPgSimple = require("connect-pg-simple");

function createSessionMiddleware(pool, authConfig) {
  const PgSession = connectPgSimple(session);
  return session({
    store: new PgSession({
      pool,
      tableName: "portal_session_store",
      createTableIfMissing: true,
    }),
    name: "portal.sid",
    secret: authConfig.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    proxy: authConfig.trustProxy,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: authConfig.cookieSecure,
      maxAge: authConfig.sessionMaxAgeMs,
    },
  });
}

module.exports = {
  createSessionMiddleware,
};
