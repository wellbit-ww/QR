const nodemailer = require("nodemailer");
const { SUPPORT_RECIPIENTS } = require("./validate-support-request");

function getSmtpConfig() {
  const host = String(process.env.SMTP_HOST || "").trim();
  if (!host) {
    return null;
  }
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure =
    String(process.env.SMTP_SECURE || "").trim() === "1" || port === 465;
  const from =
    String(process.env.SMTP_FROM || "").trim() ||
    user ||
    "noreply@sovtest-ate.com";

  const config = { host, port, secure, from };
  if (user && pass) {
    config.auth = { user, pass };
  }
  return config;
}

async function sendSupportEmail({ subject, text, html, replyTo, attachments }) {
  const smtp = getSmtpConfig();
  if (!smtp) {
    const err = new Error(
      "Отправка писем не настроена: задайте SMTP_HOST в .env (и при необходимости SMTP_USER/SMTP_PASS)."
    );
    err.code = "SMTP_NOT_CONFIGURED";
    throw err;
  }

  const transportOptions = {
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
  };
  if (smtp.auth) {
    transportOptions.auth = smtp.auth;
  }
  // Внутренний релей на :25 (как mail.sovtest-ate.com) обычно без TLS/логина
  if (smtp.port === 25) {
    transportOptions.secure = false;
    transportOptions.ignoreTLS = true;
  }

  const transporter = nodemailer.createTransport(transportOptions);

  const mailOptions = {
    from: smtp.from,
    to: SUPPORT_RECIPIENTS.join(", "),
    replyTo: replyTo || undefined,
    subject,
    text,
    html,
  };
  if (Array.isArray(attachments) && attachments.length) {
    mailOptions.attachments = attachments;
  }

  await transporter.sendMail(mailOptions);
}

module.exports = {
  getSmtpConfig,
  sendSupportEmail,
};
