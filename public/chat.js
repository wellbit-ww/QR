const params = new URLSearchParams(window.location.search);
window.equipmentId = params.get("equipment");

const equipmentBadge = document.getElementById("equipmentBadge");
const chatSubtitle = document.getElementById("chatSubtitle");
const backToEquipmentLink = document.getElementById("backToEquipmentLink");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatMessages = document.getElementById("chatMessages");
const conversationHistory = [];
let currentEquipment = null;

function autoResizeChatInput() {
  chatInput.style.height = "auto";
  chatInput.style.height = `${Math.min(chatInput.scrollHeight, 220)}px`;
}

function setEquipmentUi(equipment) {
  currentEquipment = equipment;
  equipmentBadge.textContent = `Оборудование: ${equipment.name}`;
  if (chatSubtitle) {
    chatSubtitle.textContent = `SOVA отвечает только по оборудованию: ${equipment.name}.`;
  }
  backToEquipmentLink.href = `/equipment/${equipment.id}`;
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

function appendMessage(author, text) {
  const message = document.createElement("article");
  message.className = `message message--${author}`;

  const content = document.createElement("div");
  content.className = "message-body md-body";
  const normalized =
    author === "assistant" ? normalizeAssistantText(text) : text;
  content.innerHTML = renderMarkdownToSafeHtml(normalized);

  if (author === "assistant") {
    const meta = document.createElement("div");
    meta.className = "message-meta";
    meta.textContent = "SOVA";
    message.append(meta);
  }

  message.append(content);

  chatMessages.append(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function setFormState(isLoading) {
  chatInput.disabled = isLoading;

  const submitButton = chatForm.querySelector('button[type="submit"]');

  if (submitButton) {
    submitButton.disabled = isLoading;
    submitButton.setAttribute(
      "aria-label",
      isLoading ? "Отправка..." : "Отправить вопрос"
    );
    submitButton.title = isLoading ? "Отправка..." : "Отправить вопрос";
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
  const response = await fetch(`/api/equipment/${equipmentId}`);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Не удалось загрузить оборудование.");
  }

  return payload;
}

async function requestAssistantReply(question) {
  const chatUrl = new URL("/api/chat", window.location.origin).href;

  let response;
  try {
    response = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        equipmentId: window.equipmentId,
        message: question,
        history: conversationHistory,
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
    setEquipmentUi(equipment);
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

  chatInput.value = "";
  autoResizeChatInput();

  setFormState(true);

  try {
    const payload = await requestAssistantReply(question);
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
    chatInput.focus();
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
initChat();
