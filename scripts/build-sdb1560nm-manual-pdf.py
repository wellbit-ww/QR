#!/usr/bin/env python3
"""
Семейное РЭ (как SDB1106NM.pdf): меняется только код модели на титульном листе.

  python scripts/build-sdb1560nm-manual-pdf.py

Выход:
  public/manuals/SDB1560NM.pdf
  knowledge/sdb1560m/Руководство SDB1560NM.pdf
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "manuals" / "SDB1106NM.pdf"
TITLE_FROM = "SDB1106NM"
TITLE_TO = "SDB1560NM"
OUT_PATHS = [
    ROOT / "public" / "manuals" / "SDB1560NM.pdf",
    ROOT / "knowledge" / "sdb1560m" / "Руководство SDB1560NM.pdf",
]


def main() -> int:
    if not SOURCE.is_file():
        print(f"Not found: {SOURCE}", file=sys.stderr)
        return 1
    try:
        import fitz  # PyMuPDF
    except ImportError:
        print("pip install pymupdf", file=sys.stderr)
        return 1

    for out in OUT_PATHS:
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(SOURCE, out)

        doc = fitz.open(str(out))
        page = doc[0]
        hits = page.search_for(TITLE_FROM)
        if not hits:
            doc.close()
            print(f"No title '{TITLE_FROM}' on page 1 in {out}", file=sys.stderr)
            return 1
        if len(hits) > 1:
            print(f"Warning: multiple hits on page 1, replacing all in {out.name}", file=sys.stderr)
        for rect in hits:
            page.add_redact_annot(rect, fill=(1, 1, 1))
        page.apply_redactions()
        rect = hits[0]
        font_size = max(14.0, min(22.0, rect.height * 0.85))
        page.insert_text(
            (rect.x0, rect.y1 - rect.height * 0.12),
            TITLE_TO,
            fontsize=font_size,
            fontname="helv",
            color=(0, 0, 0),
        )
        tmp = out.with_suffix(out.suffix + ".tmp")
        doc.save(str(tmp), garbage=4, deflate=True)
        doc.close()
        tmp.replace(out)
        print(f"Wrote {out} ({out.stat().st_size} bytes)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
