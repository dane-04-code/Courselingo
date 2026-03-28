"""PDF builder service — reconstructs a translated PDF using PyMuPDF redact+rewrite.

Strategy:
  1. Open the original PDF (preserves images, backgrounds, shapes).
  2. Pass 1 — measure: calculate the fitted font size for every block using a
     scratch page. Each block is fitted independently.
  3. Pass 2 — render: redact original text and insert translated text at each
     block's individually fitted size.
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
# Always prefer a Unicode TTF over Base14 fonts so that bullet points,
# accented characters, and non-Latin glyphs all render correctly.

_TTF_CANDIDATES = [
    "C:/Windows/Fonts/arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans.ttf",
]

_UNIFONT_NAME = "unifont"


def _find_unicode_font() -> str | None:
    """Return path to a Unicode TTF on this system, or None."""
    for path in _TTF_CANDIDATES:
        if os.path.exists(path):
            return path
    return None


# ── Font-size fitting ────────────────────────────────────────────────

MIN_FONT_SIZE = 7.0


def _calc_fitted_size(
    scratch_page: fitz.Page,
    text: str,
    fontname: str,
    fontsize: float,
    box_width: float,
    box_height: float,
    unicode_font_path: str | None,
) -> float:
    """
    Return the largest font size <= *fontsize* at which *text* fits in the box.

    Uses *scratch_page* for accurate measurement via insert_textbox() without
    touching the real document. Multiple calls on the same scratch page are safe
    because insert_textbox() measures purely geometrically.
    """
    measure_rect = fitz.Rect(0, 0, box_width, box_height)
    size = fontsize

    while size > MIN_FONT_SIZE:
        if unicode_font_path:
            rc = scratch_page.insert_textbox(
                measure_rect, text,
                fontsize=size,
                fontfile=unicode_font_path,
                fontname=_UNIFONT_NAME,
            )
        else:
            rc = scratch_page.insert_textbox(
                measure_rect, text,
                fontsize=size,
                fontname=fontname,
            )
        if rc >= 0:
            return size
        size -= 0.5

    return MIN_FONT_SIZE


def _insert_text(
    page: fitz.Page,
    rect: fitz.Rect,
    text: str,
    fontname: str,
    fontsize: float,
    unicode_font_path: str | None,
) -> None:
    """Insert *text* into *rect* at exactly *fontsize*."""
    if unicode_font_path:
        page.insert_textbox(
            rect, text,
            fontsize=fontsize,
            fontfile=unicode_font_path,
            fontname=_UNIFONT_NAME,
        )
    else:
        page.insert_textbox(rect, text, fontsize=fontsize, fontname=fontname)


# ── Public API ───────────────────────────────────────────────────────

def build_translated_pdf(
    blocks: list[dict[str, Any]],
    page_dims: list[dict[str, float]],  # kept for call-site compatibility; dims read directly from doc
    original_pdf_bytes: bytes,
) -> bytes:
    """
    Build a translated PDF by redacting original text and inserting
    translated text, preserving all images and non-text content.

    Args:
        blocks:             Translated text blocks from pdf_parser + deepl.
        page_dims:          Per-page {width, height} (unused; kept for compat).
        original_pdf_bytes: Raw bytes of the uploaded PDF.

    Returns:
        Raw bytes of the translated PDF.
    """
    unicode_font_path = _find_unicode_font()

    # Index blocks by page for efficient lookup
    pages: dict[int, list[tuple[int, dict[str, Any]]]] = defaultdict(list)
    for i, block in enumerate(blocks):
        pages[block["page_number"]].append((i, block))

    # ── Pass 1: measure fitted sizes ─────────────────────────────────
    # A single scratch page is reused for all measurements. insert_textbox()
    # returns a geometric fit result regardless of existing content on the page.
    # Each block is fitted independently — no cross-block normalisation.

    fitted: list[float] = [0.0] * len(blocks)

    with fitz.open() as scratch_doc:
        scratch_page = scratch_doc.new_page(width=10000, height=10000)
        for i, block in enumerate(blocks):
            text = block["text"].strip()
            if not text:
                fitted[i] = block["font_size"]
                continue
            fitted[i] = _calc_fitted_size(
                scratch_page,
                text,
                _map_font(block["font_name"]),
                block["font_size"],
                block["x1"] - block["x0"],
                block["y1"] - block["y0"],
                unicode_font_path,
            )

    # ── Pass 2: redact + insert on the real document ─────────────────
    with fitz.open(stream=original_pdf_bytes, filetype="pdf") as doc:
        for page_idx in range(len(doc)):
            page_entries = pages.get(page_idx, [])
            if not page_entries:
                continue

            page = doc[page_idx]

            # Redact original text areas (white fill, images untouched)
            for _, block in page_entries:
                rect = fitz.Rect(block["x0"], block["y0"], block["x1"], block["y1"])
                page.add_redact_annot(rect, fill=(1, 1, 1))
            page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)

            # Insert translated text at each block's individually fitted size
            for i, block in page_entries:
                text = block["text"].strip()
                if not text:
                    continue
                rect = fitz.Rect(block["x0"], block["y0"], block["x1"], block["y1"])
                fontname = _map_font(block["font_name"])
                _insert_text(page, rect, text, fontname, fitted[i], unicode_font_path)

        buf = io.BytesIO()
        doc.save(buf)

    return buf.getvalue()
