const params = new URLSearchParams(window.location.search);
window.equipmentId = params.get("equipment");

const testSessionParams = {
  block: Number(params.get("testBlock")) || null,
  question: Number(params.get("testQ")) || null,
  sessionLabel: params.get("testSession") || null,
};

function redirectToLogin() {
  const loginParams = new URLSearchParams();
  if (window.equipmentId) {
    loginParams.set("next", `/equipment/${window.equipmentId}`);
    loginParams.set("equipment", window.equipmentId);
  } else {
    loginParams.set("next", "/");
  }
  window.location.href = `/login?${loginParams.toString()}`;
}

function buildTestMetaPayload() {
  const meta = {};
  if (Number.isFinite(testSessionParams.block) && testSessionParams.block > 0) {
    meta.block = testSessionParams.block;
  }
  if (Number.isFinite(testSessionParams.question) && testSessionParams.question > 0) {
    meta.question = testSessionParams.question;
  }
  if (testSessionParams.sessionLabel) {
    meta.sessionLabel = testSessionParams.sessionLabel;
  }
  return Object.keys(meta).length ? meta : null;
}

function showTestSessionHint() {
  const meta = buildTestMetaPayload();
  if (!meta || !chatSubtitle) {
    return;
  }
  const parts = [];
  if (meta.block) {
    parts.push(`блок ${meta.block}`);
  }
  if (meta.question) {
    parts.push(`вопрос ${meta.question}`);
  }
  if (meta.sessionLabel) {
    parts.push(meta.sessionLabel);
  }
  chatSubtitle.textContent = `Ручной тест: ${parts.join(", ")}`;
}

const equipmentBadge = document.getElementById("equipmentBadge");
const chatSubtitle = document.getElementById("chatSubtitle");
const backToEquipmentLink = document.getElementById("backToEquipmentLink");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatMessages = document.getElementById("chatMessages");
const chatSupportButton = document.getElementById("chatSupportButton");
const chatHeader = document.getElementById("chatHeader");
const chatHeaderToggle = document.getElementById("chatHeaderToggle");
const conversationHistory = [];
let currentEquipment = null;

function isMobileChatLayout() {
  return window.matchMedia("(max-width: 640px)").matches;
}

function scrollChatToBottom() {
  if (chatMessages) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

let mobileViewportSyncTimer = null;

function syncMobileChatViewport() {
  const viewport = window.visualViewport;
  if (!isMobileChatLayout() || !viewport) {
    document.documentElement.style.removeProperty("--chat-viewport-height");
    return;
  }

  document.documentElement.style.setProperty(
    "--chat-viewport-height",
    `${Math.round(viewport.height)}px`,
  );

  window.clearTimeout(mobileViewportSyncTimer);
  mobileViewportSyncTimer = window.setTimeout(scrollChatToBottom, 100);
}

function setChatHeaderCollapsed(collapsed) {
  if (!chatHeader) {
    return;
  }
  chatHeader.classList.toggle("chat-header--collapsed", collapsed);
  if (chatHeaderToggle) {
    chatHeaderToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    chatHeaderToggle.title = collapsed ? "Развернуть шапку" : "Свернуть шапку";
  }
}

function syncChatHeaderCompact() {
  if (!isMobileChatLayout()) {
    chatHeader?.classList.remove("chat-header--collapsed");
    return;
  }
  const hasUserMessages =
    chatMessages?.querySelectorAll(".message--user").length > 0;
  if (hasUserMessages) {
    setChatHeaderCollapsed(true);
  }
}

function updateChatSupportButtonVisibility() {
  if (!chatSupportButton) {
    return;
  }
  const hasUserMessages =
    chatMessages?.querySelectorAll(".message--user").length > 0;
  chatSupportButton.hidden = !hasUserMessages || !currentEquipment;
}

if (chatHeaderToggle) {
  chatHeaderToggle.addEventListener("click", () => {
    setChatHeaderCollapsed(!chatHeader?.classList.contains("chat-header--collapsed"));
  });
}

window.addEventListener("resize", () => {
  if (!isMobileChatLayout()) {
    chatHeader?.classList.remove("chat-header--collapsed");
  }
  syncMobileChatViewport();
});

window.visualViewport?.addEventListener("resize", syncMobileChatViewport);
window.visualViewport?.addEventListener("scroll", syncMobileChatViewport);

function autoResizeChatInput() {
  const maxHeight = isMobileChatLayout() ? 140 : 220;
  chatInput.style.height = "auto";
  chatInput.style.height = `${Math.min(chatInput.scrollHeight, maxHeight)}px`;
}

function setEquipmentUi(equipment) {
  currentEquipment = equipment;
  equipmentBadge.textContent = equipment.name;
  if (chatSubtitle) {
    chatSubtitle.textContent = "";
  }
  backToEquipmentLink.href = `/equipment/${equipment.publicId || equipment.id}`;
}

function normalizeAssistantText(text) {
  if (typeof text !== "string") {
    return "";
  }

  let t = text
    .replace(/\$\\Rightarrow\$/g, "⇒")
    .replace(/\$\\Leftarrow\$/g, "⇐")
    .replace(/\$\\leftrightarrow\$/g, "↔")
    .replace(/\$\\Leftrightarrow\$/g, "⇔")
    .replace(/\$\\downarrow\$/g, "↓")
    .replace(/\$\\uparrow\$/g, "↑")
    .replace(/\$\\to\$/g, "→")
    .replace(/\$\\rightarrow\$/g, "→")
    .replace(/\$\\leftarrow\$/g, "←")
    .replace(/\$\\approx\$/g, "≈")
    .replace(/\$\\infty\$/g, "∞")
    .replace(/\$\\pm\$/g, "±")
    .replace(/\$\\times\$/g, "×")
    .replace(/\$\\degree\$/g, "°")
    .replace(/\$\\text\{>\}\$/g, ">")
    .replace(/\$\\text\{<\}\$/g, "<")
    .replace(/\$\\text\{\>=\}\$/g, ">=")
    .replace(/\$\\text\{\<=\}\$/g, "<=")
    .replace(/\\Rightarrow/g, "⇒")
    .replace(/\\Leftarrow/g, "⇐")
    .replace(/\\leftrightarrow/g, "↔")
    .replace(/\\Leftrightarrow/g, "⇔")
    .replace(/\\downarrow/g, "↓")
    .replace(/\\uparrow/g, "↑")
    .replace(/\\to/g, "→")
    .replace(/\\rightarrow/g, "→")
    .replace(/\\leftarrow/g, "←")
    .replace(/\\approx/g, "≈")
    .replace(/\\infty/g, "∞")
    .replace(/\\pm/g, "±")
    .replace(/\\times/g, "×")
    .replace(/\\degree/g, "°")
    .replace(/\\text\{>\}/g, ">")
    .replace(/\\text\{<\}/g, "<")
    .replace(/\\text\{\>=\}/g, ">=")
    .replace(/\\text\{\<=\}/g, "<=")
    .replace(/\$/g, "");

  t = t.replace(
    /^\s*\*{0,2}\s*(fact|interpretation|факт|интерпретация)\s*(?:\([^)]*\))?\s*\*{0,2}\s*:\s*/gim,
    ""
  );

  const sourcesIdx = t.search(/\n\s*(?:Источники|Sources)\s*:/i);
  if (sourcesIdx !== -1) {
    t = t.slice(0, sourcesIdx).trimEnd();
  }

  return t;
}

function renderMarkdownToSafeHtml(markdown) {
  const raw = typeof markdown === "string" ? markdown : "";
  try {
    if (typeof marked !== "undefined" && typeof DOMPurify !== "undefined") {
      const html = marked.parse(raw, { breaks: true });
      return DOMPurify.sanitize(html);
    }
  } catch (e) {
    console.warn("Markdown render failed:", e);
  }
  const fallback = document.createElement("div");
  fallback.textContent = raw;
  return fallback.innerHTML.replace(/\n/g, "<br>");
}

/**
 * Модель не всегда следует Markdown-инструкции. Для обычных RAG-ответов
 * добавляем лёгкое выделение технических значений и шагов; готовая разметка
 * deterministic-ответов при этом остаётся нетронутой.
 */
function enhancePlainAssistantMarkdown(markdown) {
  const text = String(markdown || "");
  if (!text || text.includes("**")) {
    return text;
  }

  return text
    .replace(
      /^(\s*\d+\.\s+)(Проверьте|Убедитесь|Подключите|Вставьте|Установите|Откройте|Закройте|Нажмите|Выберите|Задайте)(?=\s|[,:.]|$)/gimu,
      "$1**$2**"
    )
    .replace(
      /\b(?:SDB\d+\s*NM|SDB\d+|Ethernet|RH%?[тп]?|IP\d+|SET|UP|DN|ВКЛ|ВЫКЛ)\b/giu,
      "**$&**"
    )
    .replace(
      /(?<![\p{L}\p{N}])\d+(?:[.,]\d+)?\s*(?:%RH|кг|Вт|В|Гц|мм|см|м|мин(?:ут[аы]?)?|час(?:а|ов)?)(?![\p{L}\p{N}])/giu,
      "**$&**"
    );
}

function appendMessage(author, text) {
  const message = document.createElement("article");
  message.className = `message message--${author}`;

  const content = document.createElement("div");
  content.className = "message-body md-body";
  const normalized =
    author === "assistant" ? normalizeAssistantText(text) : text;
  const presentable =
    author === "assistant" ? enhancePlainAssistantMarkdown(normalized) : normalized;
  content.innerHTML = renderMarkdownToSafeHtml(presentable);

  if (author === "assistant") {
    const meta = document.createElement("div");
    meta.className = "message-meta";
    meta.textContent = "SOVA";
    message.append(meta);
  }

  message.append(content);

  chatMessages.append(message);
  scrollChatToBottom();
  syncChatHeaderCompact();
  updateChatSupportButtonVisibility();
}

const CHAT_THINKING_ID = "chatThinkingIndicator";
/** Минимум показа «SOVA думает» для мгновенных golden/deterministic ответов. */
const MIN_DETERMINISTIC_THINKING_MS = 900;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isDeterministicChatMode(payload) {
  const mode = payload?.chatMode?.mode || payload?.ragTrace?.mode || "";
  return String(mode).includes("DETERMINISTIC");
}

async function ensureMinThinkingDelay(payload, startedAtMs) {
  if (!isDeterministicChatMode(payload)) {
    return;
  }
  const remaining = MIN_DETERMINISTIC_THINKING_MS - (Date.now() - startedAtMs);
  if (remaining > 0) {
    await sleep(remaining);
  }
}

function showThinkingIndicator() {
  if (document.getElementById(CHAT_THINKING_ID)) {
    return;
  }

  const message = document.createElement("article");
  message.id = CHAT_THINKING_ID;
  message.className = "message message--assistant message--thinking";
  message.setAttribute("aria-live", "polite");
  message.setAttribute("aria-busy", "true");

  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.textContent = "SOVA";

  const content = document.createElement("div");
  content.className = "message-body chat-thinking";
  content.innerHTML = `
    <span class="chat-thinking__label">SOVA думает</span>
    <span class="chat-thinking__dots" aria-hidden="true">
      <span></span><span></span><span></span>
    </span>
  `;

  message.append(meta, content);
  chatMessages.append(message);
  scrollChatToBottom();
}

function hideThinkingIndicator() {
  document.getElementById(CHAT_THINKING_ID)?.remove();
}

function setFormState(isLoading) {
  chatInput.disabled = isLoading;

  const submitButton = chatForm.querySelector('button[type="submit"]');

  if (submitButton) {
    submitButton.disabled = isLoading;
    submitButton.setAttribute(
      "aria-label",
      isLoading ? "SOVA думает…" : "Отправить вопрос"
    );
    submitButton.title = isLoading ? "SOVA думает…" : "Отправить вопрос";
  }

  if (isLoading) {
    showThinkingIndicator();
  } else {
    hideThinkingIndicator();
  }
}

function disableChatForm() {
  chatInput.disabled = true;

  const submitButton = chatForm.querySelector('button[type="submit"]');

  if (submitButton) {
    submitButton.disabled = true;
  }
}

async function fetchEquipment(equipmentId) {
  const response = await fetch(`/api/equipment/${equipmentId}`, {
    credentials: "include",
  });
  const payload = await response.json().catch(() => ({}));

  if (response.status === 401) {
    redirectToLogin();
    throw new Error("Требуется вход.");
  }

  if (!response.ok) {
    throw new Error(payload.error || "Не удалось загрузить оборудование.");
  }

  return payload;
}

async function requestAssistantReply(question) {
  const chatUrl = new URL("/api/chat", window.location.origin).href;
  const testMeta = buildTestMetaPayload();

  let response;
  try {
    // No AbortSignal / client timeout — RAG + Ollama can take 60s+; server timeouts are in server.js.
    response = await fetch(chatUrl, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        equipmentId: window.equipmentId,
        message: question,
        directContextMode: false,
        ...(testMeta ? { testMeta } : {}),
      }),
    });
  } catch (networkError) {
    const hint =
      "Не удалось связаться с сервером приложения. Убедитесь, что он запущен (`npm start`), страница открыта по тому же адресу (не файлом с диска), и повторите запрос. Если ответ всё равно не приходит — запрос может выполняться слишком долго из‑за очереди вызовов к локальной модели.";
    const original =
      networkError instanceof Error ? networkError.message : String(networkError);
    throw new Error(`${hint}\n\n(${original})`);
  }

  const payload = await response.json().catch(() => ({}));

  if (response.status === 401) {
    redirectToLogin();
    throw new Error("Требуется вход.");
  }

  if (!response.ok) {
    const combined = [payload.error, payload.details].filter(Boolean).join("\n\n");
    throw new Error(combined || "Ошибка запроса к чату.");
  }

  return payload;
}

async function initChat() {
  if (!window.equipmentId) {
    equipmentBadge.textContent = "Оборудование: не выбрано";
    if (chatSubtitle) {
      chatSubtitle.textContent =
        "Откройте чат из карточки конкретного оборудования.";
    }
    backToEquipmentLink.href = "/";
    disableChatForm();
    appendMessage(
      "assistant",
      "Контекст оборудования не найден. Откройте чат из карточки конкретного оборудования."
    );
    return;
  }

  try {
    const equipment = await fetchEquipment(window.equipmentId);
    if (equipment?.id) {
      window.equipmentId = equipment.id;
    }
    setEquipmentUi(equipment);
    showTestSessionHint();
    appendMessage(
      "assistant",
      `Здравствуйте. Я работаю только с оборудованием ${equipment.name}. Задайте вопрос по этой модели.`
    );
  } catch (error) {
    equipmentBadge.textContent = "Оборудование: не найдено";
    if (chatSubtitle) {
      chatSubtitle.textContent =
        "Чат недоступен, потому что указанное оборудование не найдено.";
    }
    backToEquipmentLink.href = "/";
    disableChatForm();
    appendMessage(
      "assistant",
      error instanceof Error
        ? `Не удалось открыть чат по этому оборудованию.\n\n${error.message}`
        : "Не удалось открыть чат по этому оборудованию."
    );
  }
}

chatSupportButton?.addEventListener("click", () => {
  if (!currentEquipment || !window.SovaSupportModal) {
    return;
  }
  window.SovaSupportModal.open(currentEquipment);
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentEquipment) {
    return;
  }

  const question = chatInput.value.trim();

  if (!question) {
    return;
  }

  appendMessage("user", question);
  conversationHistory.push({
    role: "user",
    content: question,
  });

  if (isMobileChatLayout()) {
    chatInput.blur();
  }

  chatInput.value = "";
  autoResizeChatInput();

  const thinkingStartedAt = Date.now();
  setFormState(true);

  try {
    const payload = await requestAssistantReply(question);
    await ensureMinThinkingDelay(payload, thinkingStartedAt);
    const answer = payload.answer || "";

    appendMessage("assistant", answer);
    conversationHistory.push({
      role: "assistant",
      content: answer,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Не удалось получить ответ от ассистента.";

    appendMessage("assistant", errorMessage);
  } finally {
    setFormState(false);
    if (!isMobileChatLayout()) {
      chatInput.focus();
    }
  }
});

chatInput.addEventListener("input", autoResizeChatInput);

chatInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey) {
    return;
  }
  if (event.isComposing) {
    return;
  }
  if (chatInput.disabled || !currentEquipment) {
    return;
  }
  event.preventDefault();
  if (typeof chatForm.requestSubmit === "function") {
    chatForm.requestSubmit();
  } else {
    chatForm.dispatchEvent(
      new Event("submit", { cancelable: true, bubbles: true })
    );
  }
});

autoResizeChatInput();
syncMobileChatViewport();
initChat();
