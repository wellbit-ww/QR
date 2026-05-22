/**
 * Загрузка текста руководства для offline-диагностики (те же источники, что ingest).
 */
const fs = require("fs");
const fsSync = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");
const pdfParse = require("pdf-parse");

const ROOT_DIR = path.join(__dirname, "..");
const KNOWLEDGE_DIR = path.join(ROOT_DIR, "knowledge");
const SUPPORTED_FILE_EXT = new Set([".md", ".txt", ".pdf"]);
const { extractMandatoryManualExcerpts } = require("../src/rag/sdb1106nm-direct-facts");

function tryConvertPdfToMarkdownViaPython(pdfPath) {
  const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
  const scriptPath = path.join(ROOT_DIR, "scripts", "pdf_to_markdown.py");
  if (!fsSync.existsSync(scriptPath)) {
    return null;
  }
  const outPath = path.join(os.tmpdir(), `rag-debug-md-${Date.now()}.md`);
  const res = spawnSync(python, [scriptPath, pdfPath, outPath], {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    timeout: 900_000,
  });
  if (res.status !== 0 || res.error) {
    try {
      fsSync.unlinkSync(outPath);
    } catch (_e) {
      /* ignore */
    }
    return null;
  }
  try {
    const md = fsSync.readFileSync(outPath, "utf8");
    return md && md.trim().length > 40 ? md : null;
  } finally {
    try {
      fsSync.unlinkSync(outPath);
    } catch (_e) {
      /* ignore */
    }
  }
}

async function loadPdfText(absolutePath) {
  const md = tryConvertPdfToMarkdownViaPython(absolutePath);
  if (md) {
    return { text: md, sourceType: "pdf_md" };
  }
  const raw = await fs.promises.readFile(absolutePath);
  const pdf = await pdfParse(raw);
  return { text: pdf.text || "", sourceType: "pdf_parse" };
}

function listKnowledgeFiles(equipmentId) {
  const dir = path.join(KNOWLEDGE_DIR, equipmentId);
  if (!fsSync.existsSync(dir)) {
    return [];
  }
  const out = [];
  const walk = (absDir, relBase) => {
    for (const name of fsSync.readdirSync(absDir)) {
      const abs = path.join(absDir, name);
      const st = fsSync.statSync(abs);
      if (st.isDirectory()) {
        walk(abs, path.join(relBase, name));
        continue;
      }
      const ext = path.extname(name).toLowerCase();
      if (!SUPPORTED_FILE_EXT.has(ext)) {
        continue;
      }
      out.push({
        absolutePath: abs,
        relativePath: path.join(relBase, name).split(path.sep).join("/"),
        ext,
        mtimeMs: st.mtimeMs,
      });
    }
  };
  walk(dir, "");
  return out;
}

function scoreManualFile(ref) {
  const name = ref.relativePath.toLowerCase();
  let score = 0;
  if (/руководств|manual|sdb1106/i.test(name)) {
    score += 50;
  }
  if (/1106nm|sdb1106nm/i.test(name)) {
    score += 40;
  }
  if (ref.ext === ".md") {
    score += 30;
  }
  if (ref.ext === ".pdf") {
    score += 20;
  }
  if (/rag_/i.test(name)) {
    score -= 100;
  }
  if (/golden-table/i.test(name)) {
    score += 60;
  }
  return score + ref.mtimeMs / 1e15;
}

/**
 * @param {string} equipmentId
 * @returns {Promise<{ text: string, sourcePath: string, sourceType: string }|null>}
 */
async function loadPrimaryKnowledgeText(equipmentId) {
  const files = listKnowledgeFiles(equipmentId);
  if (!files.length) {
    return null;
  }
  const sorted = [...files].sort((a, b) => scoreManualFile(b) - scoreManualFile(a));
  const best = sorted[0];

  if (best.ext === ".pdf") {
    const loaded = await loadPdfText(best.absolutePath);
    return {
      text: loaded.text,
      sourcePath: best.relativePath,
      sourceType: loaded.sourceType,
    };
  }

  const text = await fs.promises.readFile(best.absolutePath, "utf8");
  return {
    text: text || "",
    sourcePath: best.relativePath,
    sourceType: best.ext.slice(1),
  };
}

async function loadSdb1106nmKnowledgeText(files, maxTotalChars) {
  const sorted = [...files].sort((a, b) => scoreManualFile(b) - scoreManualFile(a));
  const chunks = [];
  const usedPaths = [];
  let currentLength = 0;

  const goldenFiles = sorted.filter(
    (f) => f.ext !== ".pdf" && /golden-table/i.test(f.relativePath)
  );
  for (const file of goldenFiles) {
    const fileText = await fs.promises.readFile(file.absolutePath, "utf8");
    const fileContent = `[Документ: ${file.relativePath}]\n\n${fileText.trim()}`;
    chunks.push(fileContent);
    usedPaths.push(file.relativePath);
    currentLength += fileContent.length;
  }

  const manualPdf = sorted.find(
    (f) =>
      f.ext === ".pdf" &&
      !/rag_/i.test(f.relativePath) &&
      /1106|руководств/i.test(f.relativePath)
  );

  if (manualPdf) {
    const loaded = await loadPdfText(manualPdf.absolutePath);
    let fileText = loaded.text || "";
    const mandatory = extractMandatoryManualExcerpts(fileText);
    const header = `[Документ: ${manualPdf.relativePath}]\n\n`;
    const footer = mandatory ? `\n\n${mandatory}` : "";
    const budget = Math.max(8000, maxTotalChars - currentLength - header.length - footer.length - 200);

    if (fileText.length > budget) {
      console.warn(
        `[LOADER] ${manualPdf.relativePath}: текст сокращён до ${budget} симв.; табл. 1.2 сохранена в хвосте`
      );
      fileText =
        fileText.slice(0, budget) +
        "\n\n[…основной текст руководства сокращён; полная табл. 1.2 — ниже]\n";
    }

    const fileContent = `${header}${fileText.trim()}${footer}`;
    chunks.push(fileContent);
    usedPaths.push(manualPdf.relativePath);
    currentLength += fileContent.length;

    if (loaded.sourceType === "pdf_parse") {
      console.warn(
        `[LOADER] ${manualPdf.relativePath}: pdf-parse (низкое качество). pip install pymupdf`
      );
    }
  }

  if (!chunks.length) {
    return null;
  }

  return {
    text: chunks.join("\n\n---\n\n"),
    sourcePath: usedPaths.join(", "),
    sourceType: "combined",
  };
}

async function loadAllKnowledgeText(equipmentId) {
  const files = listKnowledgeFiles(equipmentId);
  if (!files.length) {
    return null;
  }

  const maxTotalChars = Number(process.env.DIRECT_CONTEXT_MAX_CHARS) || 52000;

  if (equipmentId === "sdb1106-nm") {
    return loadSdb1106nmKnowledgeText(files, maxTotalChars);
  }

  const sorted = [...files].sort((a, b) => scoreManualFile(b) - scoreManualFile(a));
  const chunks = [];
  let currentLength = 0;

  for (const file of sorted) {
    if (/rag_/i.test(file.relativePath)) {
      continue;
    }
    try {
      let fileText = "";
      if (file.ext === ".pdf") {
        const loaded = await loadPdfText(file.absolutePath);
        fileText = loaded.text || "";
      } else {
        fileText = await fs.promises.readFile(file.absolutePath, "utf8");
      }

      const fileContent = `[Документ: ${file.relativePath}]\n\n${fileText.trim()}`;
      const budgetLeft = maxTotalChars - currentLength;

      if (fileContent.length > budgetLeft) {
        if (file.ext === ".pdf" && budgetLeft > 4000) {
          const truncated =
            fileContent.slice(0, budgetLeft - 80) + "\n\n[…документ сокращён по лимиту контекста]";
          chunks.push(truncated);
          currentLength += truncated.length;
          console.warn(`[LOADER] ${file.relativePath}: усечён до ${budgetLeft} симв.`);
          break;
        }
        console.warn(`[LOADER] Skipping ${file.relativePath} (лимит ${maxTotalChars})`);
        continue;
      }

      chunks.push(fileContent);
      currentLength += fileContent.length;
    } catch (err) {
      console.error(`Failed to load file ${file.absolutePath}`, err);
    }
  }

  if (!chunks.length) {
    return null;
  }

  return {
    text: chunks.join("\n\n---\n\n"),
    sourcePath: sorted
      .filter((f) => !/rag_/i.test(f.relativePath))
      .slice(0, chunks.length)
      .map((f) => f.relativePath)
      .join(", "),
    sourceType: "combined",
  };
}

module.exports = {
  KNOWLEDGE_DIR,
  listKnowledgeFiles,
  loadPrimaryKnowledgeText,
  loadAllKnowledgeText,
};
