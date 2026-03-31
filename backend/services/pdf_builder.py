"""PDF builder service — reconstructs a translated PDF using PyMuPDF redact+rewrite.

Strategy:
  1. Open the original PDF (preserves images, backgrounds, shapes).
  2. Compute "safe rects" for each block: x1 (already widened 30% by the
     parser) and y1 (expanded 40% here) are clamped so they never intrude
     into a neighbouring block's original bounding box.  This prevents
     overlapping text in dense layouts.
  3. Pass 1 — measure: calculate the fitted font size per block using the
     safe rects.  Each block gets its own individually fitted size (no
     group normalisation that could drag every block down to one outlier's
     minimum).
  4. Pass 2 — render: redact the safe area with white, then insert text.
"""

from __future__ import annotations

import io
from collections import defaultdict
from pathlib import Path
from typing import Any

import fitz  # PyMuPDF


# ── Bundled NotoSans font registry ───────────────────────────────────
# Each key also becomes the fontname registered inside each PDF document,
# so they must be unique per file.  Fonts that don't exist on disk are
# silently omitted; callers fall back to "noto" (general Unicode).
_FONTS_DIR = Path(__file__).resolve().parent.parent / "fonts"

_FONT_REGISTRY: dict[str, str] = {}
for _key, _fname in [
    ("noto",    "NotoSans.ttf"),
    ("noto-jp", "NotoSansJP.ttf"),
    ("noto-kr", "NotoSansKR.ttf"),
    ("noto-sc", "NotoSansSC.ttf"),
    # Arabic/Hebrew: add ("noto-ar", "NotoSansArabic.ttf") etc. once those
    # font files are placed in backend/fonts/ and RTL rendering is handled.
]:
    _p = _FONTS_DIR / _fname
    if _p.exists():
        _FONT_REGISTRY[_key] = str(_p)


def _detect_script(text: str) -> str:
    """Return the font-registry key for the dominant script in *text*.

    Scans left-to-right and returns on the first non-Latin character found,
    so mixed documents (e.g. Japanese kanji + hiragana) are handled correctly.
    """
    for char in text:
        cp = ord(char)
        if 0x3040 <= cp <= 0x30FF:                              # Hiragana / Katakana
            return "noto-jp"
        if 0xAC00 <= cp <= 0xD7AF or 0x1100 <= cp <= 0x11FF:  # Hangul
            return "noto-kr"
        if (0x4E00 <= cp <= 0x9FFF                             # CJK Unified Ideographs
                or 0x3400 <= cp <= 0x4DBF                      # CJK Extension A
                or 0x20000 <= cp <= 0x2A6DF):                  # CJK Extension B
            return "noto-sc"
    return "noto"


def _font_for_text(text: str) -> tuple[str, str | None]:
    """Return *(fontname, fontfile_path)* for inserting *text* into a PDF.

    Falls back to the generic NotoSans if the script-specific file is missing.
    Returns (fontname, None) only when no NotoSans font is available at all,
    in which case callers must use a Base14 fallback.
    """
    key = _detect_script(text)
    path = _FONT_REGISTRY.get(key) or _FONT_REGISTRY.get("noto")
    return key, path


# ── Font mapping ─────────────────────────────────────────────────────
# Kept for Base14 fallback only (used when no NotoSans TTF is found on disk).
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


# ── Font-size fitting ────────────────────────────────────────────────

MIN_FONT_SIZE = 7.0


def _calc_fitted_size(
    scratch_page: fitz.Page,
    text: str,
    noto_key: str,
    noto_file: str | None,
    fontsize: float,
    box_width: float,
    box_height: float,
) -> float:
    """Return the largest font size <= *fontsize* at which *text* fits in the box.

    Uses *scratch_page* for accurate measurement via insert_textbox() without
    touching the real document.  *noto_key* is the unique fontname registered
    per PDF document (one key per TTF file), *noto_file* is its path.
    """
    measure_rect = fitz.Rect(0, 0, box_width, box_height)
    size = fontsize

    while size > MIN_FONT_SIZE:
        if noto_file:
            rc = scratch_page.insert_textbox(
                measure_rect, text,
                fontsize=size,
                fontfile=noto_file,
                fontname=noto_key,
            )
        else:
            rc = scratch_page.insert_textbox(
                measure_rect, text,
                fontsize=size,
                fontname="helv",
            )
        if rc >= 0:
            return size
        size -= 0.5

    return MIN_FONT_SIZE


def _insert_text(
    page: fitz.Page,
    rect: fitz.Rect,
    text: str,
    noto_key: str,
    noto_file: str | None,
    fontsize: float,
) -> None:
    """Insert *text* into *rect* at exactly *fontsize* using the chosen NotoSans TTF."""
    if noto_file:
        page.insert_textbox(
            rect, text,
            fontsize=fontsize,
            fontfile=noto_file,
            fontname=noto_key,
        )
    else:
        page.insert_textbox(rect, text, fontsize=fontsize, fontname="helv")


# ── Neighbour-aware rect expansion ──────────────────────────────────

_NEIGHBOUR_GAP = 2.0  # minimum gap (points) between expanded rects


def _compute_safe_rects(
    blocks: list[dict[str, Any]],
    doc: fitz.Document,
) -> list[fitz.Rect]:
    """
    Compute expanded rects that never overlap a neighbouring block.

    * x1 was already widened +30% by the parser — clamped here against
      blocks that sit to the right at the same vertical level.
    * y1 is expanded +40% of original height — clamped against the
      nearest block below that shares horizontal space.

    This eliminates text-over-text overlap in dense or multi-column PDFs.
    """
    by_page: dict[int, list[tuple[int, dict[str, Any]]]] = defaultdict(list)
    for i, block in enumerate(blocks):
        by_page[block["page_number"]].append((i, block))

    rects: list[fitz.Rect] = [fitz.Rect(0, 0, 0, 0)] * len(blocks)

    for page_num, entries in by_page.items():
        page_w = doc[page_num].rect.width
        page_h = doc[page_num].rect.height

        for _, (i, block) in enumerate(entries):
            x0 = block["x0"]
            y0 = block["y0"]
            x1 = block["x1"]                               # parser-expanded
            orig_h = block["y1"] - block["y0"]
            y1 = block["y1"] + 0.40 * orig_h               # builder-expanded

            for _, (j, nb) in enumerate(entries):
                if j == i:
                    continue

                # ── Vertical clamp ───────────────────────────────
                # If nb is below us and shares horizontal space,
                # our y1 must not enter nb's original y0.
                if (nb["y0"] > y0
                        and nb["x0"] < x1 and x0 < nb["x1"]
                        and y1 > nb["y0"] - _NEIGHBOUR_GAP):
                    y1 = max(block["y1"], nb["y0"] - _NEIGHBOUR_GAP)

                # ── Horizontal clamp ─────────────────────────────
                # If nb is to our right and shares vertical space,
                # our x1 must not enter nb's original x0.
                if (nb["x0"] > x0
                        and nb["y0"] < y1 and y0 < nb["y1"]
                        and x1 > nb["x0"] - _NEIGHBOUR_GAP):
                    # Floor at the pre-expansion x1 so we never shrink
                    # smaller than the original bounding box.
                    orig_w = (block["x1"] - x0) / 1.30
                    orig_x1 = x0 + orig_w
                    x1 = max(orig_x1, nb["x0"] - _NEIGHBOUR_GAP)

            rects[i] = fitz.Rect(x0, y0, min(x1, page_w), min(y1, page_h))

    return rects


# ── Public API ───────────────────────────────────────────────────────

def build_translated_pdf(
    blocks: list[dict[str, Any]],
    page_dims: list[dict[str, float]],  # kept for call-site compatibility
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
    doc = fitz.open(stream=original_pdf_bytes, filetype="pdf")

    # ── Compute safe rects (neighbour-aware) ─────────────────────────
    safe_rects = _compute_safe_rects(blocks, doc)

    # ── Pass 1: measure fitted sizes using safe rects ────────────────
    # Resolve each block's font up front so pass 2 can reuse the result.
    fitted: list[float] = [0.0] * len(blocks)
    block_fonts: list[tuple[str, str | None]] = []

    with fitz.open() as scratch_doc:
        scratch_page = scratch_doc.new_page(width=10000, height=10000)
        for i, block in enumerate(blocks):
            text = block["text"].strip()
            noto_key, noto_file = _font_for_text(text) if text else ("noto", _FONT_REGISTRY.get("noto"))
            block_fonts.append((noto_key, noto_file))
            if not text:
                fitted[i] = block["font_size"]
                continue
            rect = safe_rects[i]
            fitted[i] = _calc_fitted_size(
                scratch_page,
                text,
                noto_key,
                noto_file,
                block["font_size"],
                rect.width,
                rect.height,
            )

    # No group normalisation — each block keeps its own fitted size.
    # The old approach (minimum across all same-size blocks on a page)
    # caused one long translation to shrink EVERY paragraph on the page.

    # ── Pass 2: redact + insert on the real document ─────────────────
    pages: dict[int, list[tuple[int, dict[str, Any]]]] = defaultdict(list)
    for i, block in enumerate(blocks):
        pages[block["page_number"]].append((i, block))

    for page_idx in range(len(doc)):
        page_entries = pages.get(page_idx, [])
        if not page_entries:
            continue

        page = doc[page_idx]

        # Redact using the original (tight) bounding box — not the expanded
        # safe rect — so the white erase area matches the original text footprint
        # and doesn't leave a large visible white gap below the translated text.
        for i, block in page_entries:
            orig_rect = fitz.Rect(block["x0"], block["y0"], block["x1"], block["y1"])
            page.add_redact_annot(orig_rect, fill=(1, 1, 1))
        page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)

        # Insert translated text into the expanded safe rect so longer
        # translations have room to flow without being clipped.
        for i, block in page_entries:
            text = block["text"].strip()
            if not text:
                continue
            noto_key, noto_file = block_fonts[i]
            _insert_text(page, safe_rects[i], text, noto_key, noto_file, fitted[i])

    buf = io.BytesIO()
    doc.save(buf)
    doc.close()

    return buf.getvalue()
