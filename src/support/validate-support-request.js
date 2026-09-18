const SUPPORT_RECIPIENTS = Object.freeze([
  "info@sovtest-ate.ru",
  "service@sovtest-ate.ru",
  "dalutin@sovtest-ate.ru",
]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseConsent(value) {
  if (value === true) {
    return true;
  }
  const s = String(value ?? "")
    .trim()
    .toLowerCase();
  return s === "true" || s === "on" || s === "1" || s === "yes";
}

/** Нормализация полей из JSON или multipart (организация — из label аккаунта). */
function normalizeSupportBody(rawBody, sessionUser) {
  const label = cleanText(sessionUser?.label, 200);
  return {
    organization: label || cleanText(rawBody?.organization, 200),
    contactName: rawBody?.contactName,
    position: rawBody?.position,
    phone: rawBody?.phone,
    email: rawBody?.email,
    equipmentModel: rawBody?.equipmentModel,
    equipmentId: rawBody?.equipmentId,
    serialNumber: rawBody?.serialNumber,
    message: rawBody?.message,
    consent: parseConsent(rawBody?.consent),
    portalLogin: cleanText(sessionUser?.login, 80),
    organizationFromAccount: Boolean(label),
  };
}

function cleanText(value, maxLen) {
  const s = String(value ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!s) {
    return "";
  }
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function validateSupportRequest(body) {
  const errors = [];
  const data = {
    organization: cleanText(body?.organization, 200),
    contactName: cleanText(body?.contactName, 200),
    position: cleanText(body?.position, 120),
    phone: cleanText(body?.phone, 40),
    email: cleanText(body?.email, 120).toLowerCase(),
    equipmentModel: cleanText(body?.equipmentModel, 120),
    equipmentId: cleanText(body?.equipmentId, 80),
    serialNumber: cleanText(body?.serialNumber, 80),
    message: cleanText(body?.message, 8000),
    consent: Boolean(body?.consent),
    portalLogin: cleanText(body?.portalLogin, 80),
    organizationFromAccount: Boolean(body?.organizationFromAccount),
  };

  if (!data.organization) {
    errors.push(
      data.organizationFromAccount
        ? "Для учётной записи не задана организация. Обратитесь к администратору."
        : "Укажите название организации."
    );
  }
  if (!data.contactName) {
    errors.push("Укажите контактное лицо (ФИО).");
  }
  if (!data.phone) {
    errors.push("Укажите телефон.");
  }
  if (!data.email || !EMAIL_RE.test(data.email)) {
    errors.push("Укажите корректный адрес электронной почты.");
  }
  if (!data.equipmentModel) {
    errors.push("Укажите модель оборудования.");
  }
  if (!data.message || data.message.length < 10) {
    errors.push("Опишите вопрос (не менее 10 символов).");
  }
  if (!data.consent) {
    errors.push("Необходимо согласие на обработку персональных данных.");
  }

  return { ok: errors.length === 0, errors, data };
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildSupportEmailContent(data) {
  const rows = [
    ["Организация", data.organization],
    ...(data.portalLogin ? [["Аккаунт портала", data.portalLogin]] : []),
    ["Контактное лицо", data.contactName],
    ["Должность", data.position || "—"],
    ["Телефон", data.phone],
    ["E-mail", data.email],
    ["Модель оборудования", data.equipmentModel],
    ["ID в портале", data.equipmentId || "—"],
    ["Серийный номер", data.serialNumber || "—"],
  ];

  const textLines = [
    "Новый запрос в техподдержку с портала SOVA.",
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    "Вопрос:",
    data.message,
  ];

  const htmlRows = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#616161;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:6px 0;"><strong>${escapeHtml(value)}</strong></td></tr>`
    )
    .join("");

  const html = `
    <p>Новый запрос в техподдержку с портала SOVA.</p>
    <table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;">${htmlRows}</table>
    <p style="margin-top:16px;font-weight:700;">Вопрос:</p>
    <p style="white-space:pre-wrap;">${escapeHtml(data.message)}</p>
  `.trim();

  const subject = `[Техподдержка] ${data.equipmentModel} — ${data.organization}`;

  return { subject, text: textLines.join("\n"), html };
}

module.exports = {
  SUPPORT_RECIPIENTS,
  normalizeSupportBody,
  validateSupportRequest,
  buildSupportEmailContent,
};
