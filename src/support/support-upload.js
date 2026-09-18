const multer = require("multer");
const { MAX_FILES, MAX_FILE_BYTES, SUPPORT_ATTACHMENT_TYPES_LABEL } = require("./validate-support-attachments");

const supportUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: MAX_FILES,
    fileSize: MAX_FILE_BYTES,
    fieldSize: 64 * 1024,
  },
});

function supportUploadMiddleware(req, res, next) {
  supportUpload.array("attachments", MAX_FILES)(req, res, (err) => {
    if (!err) {
      return next();
    }
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        error: "Каждый файл не должен превышать 10 МБ.",
      });
    }
    if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        error: `Можно прикрепить не более ${MAX_FILES} файлов (${SUPPORT_ATTACHMENT_TYPES_LABEL}).`,
      });
    }
    return res.status(400).json({
      error: "Не удалось загрузить вложения.",
    });
  });
}

module.exports = {
  supportUploadMiddleware,
};
