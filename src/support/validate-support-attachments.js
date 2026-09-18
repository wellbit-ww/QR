const path = require("path");

const ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".heic",
  ".heif",
]);

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const SUPPORT_ATTACHMENT_TYPES_LABEL = "PDF, DOC, JPG, PNG, WEBP, HEIC";
const SUPPORT_ATTACHMENT_ACCEPT =
  ".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp,image/heic,image/heif";

const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function isAllowedAttachment(file) {
  const original = String(file?.originalname || "");
  const ext = path.extname(original).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return false;
  }
  const mime = String(file?.mimetype || "").toLowerCase();
  if (!mime || mime === "application/octet-stream") {
    return true;
  }
  return ALLOWED_MIME.has(mime);
}

function hasPrefix(buffer, signature) {
  return Buffer.isBuffer(buffer) && buffer.subarray(0, signature.length).equals(signature);
}

function hasDocxStructure(buffer) {
  if (!hasPrefix(buffer, Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    return false;
  }
  const sample = buffer.subarray(0, Math.min(buffer.length, 1024 * 1024));
  return (
    sample.includes(Buffer.from("[Content_Types].xml")) &&
    sample.includes(Buffer.from("word/"))
  );
}

function isHeicBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return false;
  }
  const ftypIndex = buffer.indexOf(Buffer.from("ftyp"));
  if (ftypIndex < 0 || ftypIndex > 8) {
    return false;
  }
  const brand = buffer.subarray(ftypIndex + 4, ftypIndex + 8).toString("ascii");
  return /^(heic|heix|hevc|hevx|mif1|msf1|avif)$/i.test(brand);
}

function contentMatchesExtension(file) {
  const ext = path.extname(String(file?.originalname || "")).toLowerCase();
  const buffer = file?.buffer;

  if (ext === ".pdf") {
    return hasPrefix(buffer, Buffer.from("%PDF-"));
  }
  if (ext === ".doc") {
    return hasPrefix(
      buffer,
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    );
  }
  if (ext === ".docx") {
    return hasDocxStructure(buffer);
  }
  if (ext === ".jpg" || ext === ".jpeg") {
    return hasPrefix(buffer, Buffer.from([0xff, 0xd8, 0xff]));
  }
  if (ext === ".png") {
    return hasPrefix(
      buffer,
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  }
  if (ext === ".webp") {
    return (
      buffer.length >= 12 &&
      hasPrefix(buffer, Buffer.from("RIFF")) &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  if (ext === ".heic" || ext === ".heif") {
    return isHeicBuffer(buffer);
  }
  return false;
}

function safeFilename(original) {
  const base = path.basename(String(original || "file"));
  return base.replace(/[^\w.\-()а-яА-ЯёЁ\s]/gi, "_").slice(0, 120) || "attachment";
}

function validateSupportAttachments(files) {
  const list = Array.isArray(files) ? files : [];
  if (!list.length) {
    return { ok: true, attachments: [] };
  }
  if (list.length > MAX_FILES) {
    return {
      ok: false,
      errors: [`Можно прикрепить не более ${MAX_FILES} файлов.`],
    };
  }

  const errors = [];
  const attachments = [];

  for (const file of list) {
    if (!file?.buffer?.length) {
      errors.push("Пустой файл во вложениях.");
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      errors.push(`Файл «${file.originalname || "без имени"}» превышает 10 МБ.`);
      continue;
    }
    if (!isAllowedAttachment(file)) {
      errors.push(
        `Файл «${file.originalname || "без имени"}» не поддерживается. Разрешены ${SUPPORT_ATTACHMENT_TYPES_LABEL}.`,
      );
      continue;
    }
    if (!contentMatchesExtension(file)) {
      errors.push(
        `Содержимое файла «${file.originalname || "без имени"}» не соответствует заявленному формату.`,
      );
      continue;
    }
    attachments.push({
      filename: safeFilename(file.originalname),
      content: file.buffer,
      contentType: file.mimetype || undefined,
    });
  }

  if (errors.length) {
    return { ok: false, errors };
  }
  return { ok: true, attachments };
}

module.exports = {
  MAX_FILES,
  MAX_FILE_BYTES,
  SUPPORT_ATTACHMENT_TYPES_LABEL,
  SUPPORT_ATTACHMENT_ACCEPT,
  validateSupportAttachments,
};
