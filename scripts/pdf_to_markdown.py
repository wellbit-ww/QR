#!/usr/bin/env python3
"""
Convert PDF to Markdown-ish text with better layout preservation than pdf-parse.
Requires: pip install pymupdf

Usage: python pdf_to_markdown.py <input.pdf> <output.md>
"""
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) < 3:
        print("Usage: pdf_to_markdown.py <input.pdf> <output.md>", file=sys.stderr)
        return 2
    src = Path(sys.argv[1])
    dst = Path(sys.argv[2])
    if not src.is_file():
        print(f"Not found: {src}", file=sys.stderr)
        return 1
    try:
        import fitz  # PyMuPDF
    except ImportError as e:
        print("Missing dependency: pip install pymupdf", file=sys.stderr)
        print(str(e), file=sys.stderr)
        return 1

    doc = fitz.open(str(src))
    parts = []
    for page in doc:
        text = ""
        try:
            text = page.get_text("markdown")  # PyMuPDF >= 1.24
        except (TypeError, ValueError, AttributeError, AssertionError):
            try:
                text = page.get_text("text")
            except Exception:
                text = ""
        if not str(text).strip():
            try:
                text = page.get_text("text")
            except Exception:
                text = ""
        parts.append(str(text).rstrip())
    doc.close()
    body = "\n\n".join(p for p in parts if p.strip())
    dst.write_text(body if body.strip() else "", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
