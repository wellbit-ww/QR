/**
 * Лёгкий логгер RAG-слоя (без зависимости от server.js).
 * В production можно подменить через process.env.SOVA_RAG_LOG_JSON=1 для одной строки JSON.
 */

function emit(level, stage, details = {}) {
  const payload = { level, stage, ts: new Date().toISOString(), ...details };
  if (process.env.SOVA_RAG_LOG_JSON === "1") {
    const line = JSON.stringify(payload);
    if (level === "warn") {
      console.warn(line);
    } else {
      console.info(line);
    }
    return;
  }
  const prefix = `[SOVA/RAG][${level.toUpperCase()}] ${stage}`;
  if (level === "warn") {
    console.warn(prefix, details);
  } else {
    console.info(prefix, details);
  }
}

function ragInfo(stage, details) {
  emit("info", stage, details);
}

function ragWarn(stage, details) {
  emit("warn", stage, details);
}

module.exports = {
  ragInfo,
  ragWarn,
};
