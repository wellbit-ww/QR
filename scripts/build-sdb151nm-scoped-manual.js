/**
 * Собирает knowledge/sdb151-nm/Руководство SDB151NM.md из семейного .doc.
 * Только SDB151NM: чужие строки таблиц и опция подогрева не попадают в файл.
 *
 * node scripts/build-sdb151nm-scoped-manual.js
 */
const fs = require("fs");
const path = require("path");
const WordExtractor = require("word-extractor");
const { buildSdb151nmScopedManual } = require("../src/rag/sdb151nm-context-filter");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "knowledge", "sdb151-nm", "Руководство SDB151NM.doc");
const DEST = path.join(ROOT, "knowledge", "sdb151-nm", "Руководство SDB151NM.md");

async function main() {
  if (!fs.existsSync(SRC)) {
    throw new Error(`Нет исходного РЭ: ${SRC}`);
  }
  const extracted = await new WordExtractor().extract(SRC);
  const raw = extracted.getBody() || "";
  if (raw.trim().length < 200) {
    throw new Error("Извлечение .doc дало слишком короткий текст");
  }
  const md = buildSdb151nmScopedManual(raw);
  fs.writeFileSync(DEST, md, "utf8");
  console.log(`[SDB151NM] Wrote ${DEST} (${md.length} chars, from ${raw.length} source chars)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
