// В Node 24+ встроенный префикс `node:undici` может быть недоступен — используем пакет `undici`.
const { fetch, Agent } = require("undici");

/**
 * Глобальный fetch в Node использует Undici с bodyTimeout по умолчанию ~5 минут.
 * Цепочка вызовов к Ollama (чат, верификатор и т.д.) может ждать ответ дольше —
 * без своего Agent запрос обрывается с ошибкой сети и браузер видит «fetch failed».
 */
const longChatDispatcher = new Agent({
  connectTimeout: 120_000,
  headersTimeout: 180_000,
  bodyTimeout: 3_600_000,
});

function fetchOllama(url, init = {}) {
  return fetch(url, {
    ...init,
    dispatcher: longChatDispatcher,
  });
}

module.exports = {
  fetchOllama,
};
