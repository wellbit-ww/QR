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
    chatSubtitle.textContent = `Ассистент отвечает только по оборудованию: ${equipment.name}.`;
  }
  backToEquipmentLink.href = `/equipment/${equipment.id}`;
}

function normalizeAssistantText(text) {
  if (typeof text !== "string") {
    return "";
  }

  return text
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
}

function appendMessage(author, text, sources = []) {
  const message = document.createElement("article");
  message.className = `message message--${author}`;

  const content = document.createElement("div");
  content.textContent =
    author === "assistant" ? normalizeAssistantText(text) : text;

  if (author === "assistant") {
    const meta = document.createElement("div");
    meta.className = "message-meta";
    meta.textContent = "Ассистент";
    message.append(meta);
  }

  message.append(content);

  if (author === "assistant" && Array.isArray(sources) && sources.length > 0) {
    const sourcesTitle = document.createElement("div");
    sourcesTitle.className = "message-sources-title";
    sourcesTitle.textContent = "Источники:";
    message.append(sourcesTitle);

    const sourcesList = document.createElement("ul");
    sourcesList.className = "message-sources-list";

    sources.forEach((source) => {
      const item = document.createElement("li");
      const pageText =
        Number.isInteger(source.page) && source.page > 0 ? `, стр. ${source.page}` : "";
      const sectionText = source.section ? `, раздел: ${source.section}` : "";
      item.textContent = `${source.sourceDoc}${sectionText}${pageText}`;
      sourcesList.append(item);
    });

    message.append(sourcesList);
  }

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
  const response = await fetch("/api/chat", {
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

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.details || payload.error || "Ошибка запроса к чату.");
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

  setFormState(true);

  try {
    const payload = await requestAssistantReply(question);
    const answer = payload.answer || "";
    const sources = Array.isArray(payload.sources) ? payload.sources : [];

    appendMessage("assistant", answer, sources);
    conversationHistory.push({
      role: "assistant",
      content: answer,
    });
    chatInput.value = "";
    autoResizeChatInput();
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Не удалось получить ответ от ассистента.";

    appendMessage(
      "assistant",
      `Не удалось получить ответ от локальной модели.\n\n${errorMessage}`
    );
  } finally {
    setFormState(false);
    chatInput.focus();
  }
});

chatInput.addEventListener("input", autoResizeChatInput);

autoResizeChatInput();
initChat();
