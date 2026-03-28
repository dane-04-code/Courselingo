"""PDF builder service — reconstructs a translated PDF using PyMuPDF redact+rewrite.

Strategy:
  1. Open the original PDF (preserves images, backgrounds, shapes).
  2. For each translated text block, draw a white redact annotation over the
     original text area.
  3. Apply redacts — erases original text pixels, images untouched.
  4. Insert translated text at the same position, shrinking font size to fit.
"""

from __future__ import annotations

import io
import os
from collections import defaultdict
from typing import Any

import fitz  # PyMuPDF


# ── Font mapping ─────────────────────────────────────────────────────
# PyMuPDF insert_textbox() uses short Base14 font codes:
#   helv/heit/hebo/hebi  → Helvetica family
#   tiro/tiit/tibo/tibi  → Times family
#   cour/coit/cobo/cobi  → Courier family

def _map_font(pdf_font_name: str) -> str:
    """Map an embedded PDF font name to a PyMuPDF Base14 font code."""
    lower = pdf_font_name.lower()

    # Strip subset prefix e.g. "BCDGEE+Calibri-Bold" → "calibri-bold"
    if "+" in lower:
        lower = lower.split("+", 1)[1]

    is_bold = "bold" in lower
    is_italic = "italic" in lower or "oblique" in lower

    if any(k in lower for k in ("times", "timesnewroman", "georgia")):
        if is_bold and is_italic:
            return "tibi"
        if is_bold:
            return "tibo"
        if is_italic:
            return "tiit"
        return "tiro"

    if any(k in lower for k in ("courier", "couriernew", "mono")):
        if is_bold and is_italic:
            return "cobi"
        if is_bold:
            return "cobo"
        if is_italic:
            return "coit"
        return "cour"

    # Default: Helvetica family (covers Arial, Calibri, and unknowns)
    if is_bold and is_italic:
        return "hebi"
    if is_bold:
        return "hebo"
    if is_italic:
        return "heit"
    return "helv"


# ── Unicode font resolution ──────────────────────────────────────────

_TTF_CANDIDATES = [
    "C:/Windows/Fonts/arial.ttf",
    "C:/Windows/Fonts/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans.ttf",
]


def _find_unicode_font() -> str | None:
    """Return path to a Unicode TTF on this system, or None."""
    for path in _TTF_CANDIDATES:
        if os.path.exists(path):
            return path
    return None


def _needs_unicode(text: str) -> bool:
    try:
        text.encode("latin-1")
        return False
    except (UnicodeEncodeError, UnicodeDecodeError):
        return True


# ── Text insertion with font-size fitting ────────────────────────────

MIN_FONT_SIZE = 7.0


def _insert_fitted_text(
    page: fitz.Page,
    rect: fitz.Rect,
    text: str,
    fontname: str,
    fontsize: float,
    unicode_font_path: str | None,
) -> None:
    """
    Insert *text* into *rect*, shrinking font size until it fits.
    Falls back to clipping at MIN_FONT_SIZE if nothing fits.

    insert_textbox() returns the unused vertical space (>=0) when text fits,
    or a negative number when it overflows.
    """
    use_unicode = _needs_unicode(text)
    size = fontsize

    while size >= MIN_FONT_SIZE:
        if use_unicode and unicode_font_path:
            rc = page.insert_textbox(
                rect, text,
                fontsize=size,
                fontfile=unicode_font_path,
                fontname="unifont",
            )
        else:
            rc = page.insert_textbox(
                rect, text,
                fontsize=size,
                fontname=fontname,
            )
        if rc >= 0:
            return  # text fit
        size -= 0.5

    # Last resort: insert at minimum size (text will be clipped by rect)
    if use_unicode and unicode_font_path:
        page.insert_textbox(
            rect, text,
            fontsize=MIN_FONT_SIZE,
            fontfile=unicode_font_path,
            fontname="unifont",
        )
    else:
        page.insert_textbox(rect, text, fontsize=MIN_FONT_SIZE, fontname=fontname)


# ── Public API ───────────────────────────────────────────────────────

def build_translated_pdf(
    blocks: list[dict[str, Any]],
    page_dims: list[dict[str, float]],
    original_pdf_bytes: bytes,
) -> bytes:
    """
    Build a translated PDF by redacting original text and inserting
    translated text, preserving all images and non-text content.

    Args:
        blocks:            Translated text blocks from pdf_parser + deepl.
        page_dims:         Per-page {width, height} from get_page_dimensions().
        original_pdf_bytes: Raw bytes of the uploaded PDF.

    Returns:
        Raw bytes of the translated PDF.
    """
    doc = fitz.open(stream=original_pdf_bytes, filetype="pdf")
    unicode_font_path = _find_unicode_font()

    # Group blocks by page
    pages: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for block in blocks:
        pages[block["page_number"]].append(block)

    for page_idx in range(len(doc)):
        page_blocks = pages.get(page_idx, [])
        if not page_blocks:
            continue

        page = doc[page_idx]

        # 1. Mark all text areas for redaction (white fill erases original text)
        for block in page_blocks:
            rect = fitz.Rect(block["x0"], block["y0"], block["x1"], block["y1"])
            page.add_redact_annot(rect, fill=(1, 1, 1))

        # 2. Apply redactions — removes text pixels, images=0 preserves images
        page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)

        # 3. Insert translated text into each cleared area
        for block in page_blocks:
            text = block["text"].strip()
            if not text:
                continue
            rect = fitz.Rect(block["x0"], block["y0"], block["x1"], block["y1"])
            fontname = _map_font(block["font_name"])
            fontsize = block["font_size"]
            _insert_fitted_text(page, rect, text, fontname, fontsize, unicode_font_path)

    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()
