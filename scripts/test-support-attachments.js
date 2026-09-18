/**
 * node scripts/test-support-attachments.js
 */
const assert = require("assert");
const { validateSupportAttachments } = require("../src/support/validate-support-attachments");

function file(name, buffer, mimetype = "application/octet-stream") {
  return {
    originalname: name,
    buffer,
    size: buffer.length,
    mimetype,
  };
}

const png = file(
  "screen.png",
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
  "image/png",
);
const jpeg = file(
  "photo.jpg",
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]),
  "image/jpeg",
);
const pdf = file("manual.pdf", Buffer.from("%PDF-1.4\n"), "application/pdf");
const fakePdf = file("virus.exe.pdf", Buffer.from("MZ"), "application/pdf");

assert.equal(validateSupportAttachments([png]).ok, true);
assert.equal(validateSupportAttachments([jpeg]).ok, true);
assert.equal(validateSupportAttachments([pdf]).ok, true);
assert.equal(validateSupportAttachments([fakePdf]).ok, false);

console.log("support attachment checks passed");
