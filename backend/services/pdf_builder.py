"""PDF builder service — overlays translated text onto the original PDF."""

from __future__ import annotations

import io
from collections import defaultdict
from pathlib import Path
from typing import Any

import fitz  # PyMuPDF — used to white-out original text and merge overlay

from reportlab.lib.pagesizes import letter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

# ── Register Noto Sans fonts ────────────────────────────────────────

_FONTS_DIR = Path(__file__).resolve().parent.parent / "fonts"
_FONTS_REGISTERED = False


def _register_fonts() -> None:
    """Register Noto Sans TTF fonts with ReportLab (once)."""
    global _FONTS_REGISTERED
    if _FONTS_REGISTERED:
        return

    _font_files = {
        "NotoSans": "NotoSans.ttf",
        "NotoSans-Italic": "NotoSans-Italic.ttf",
        "NotoSansJP": "NotoSansJP.ttf",
        "NotoSansSC": "NotoSansSC.ttf",
        "NotoSansKR": "NotoSansKR.ttf",
    }

    for name, filename in _font_files.items():
        path = _FONTS_DIR / filename
        if path.exists():
            pdfmetrics.registerFont(TTFont(name, str(path)))

    _FONTS_REGISTERED = True


# ── Font-name mapping ────────────────────────────────────────────────

_BUILTIN_FONT_MAP: dict[str, str] = {
    "helvetica": "Helvetica",
    "arial": "Helvetica",
    "calibri": "Helvetica",
    "times": "Times-Roman",
    "timesnewroman": "Times-Roman",
    "courier": "Courier",
    "couriernew": "Courier",
}

_BOLD_SUFFIX = {
    "Helvetica": "Helvetica-Bold",
    "Times-Roman": "Times-Bold",
    "Courier": "Courier-Bold",
}

_ITALIC_SUFFIX = {
    "Helvetica": "Helvetica-Oblique",
    "Times-Roman": "Times-Italic",
    "Courier": "Courier-Oblique",
}

_CJK_FONT_MAP: dict[str, str] = {
    "JA": "NotoSansJP",
    "ZH": "NotoSansSC",
    "ZH-HANS": "NotoSansSC",
    "ZH-HANT": "NotoSansSC",
    "KO": "NotoSansKR",
}


def _map_font(pdf_font_name: str, target_lang: str | None = None) -> str:
    """Map an embedded font name to a registered font."""
    if target_lang:
        upper = target_lang.upper()
        cjk = _CJK_FONT_MAP.get(upper)
        if cjk and (_FONTS_DIR / f"{cjk}.ttf").exists():
            return cjk

    lower = pdf_font_name.lower()
    if "+" in lower:
        lower = lower.split("+", 1)[1]

    is_bold = "bold" in lower
    is_italic = "italic" in lower or "oblique" in lower

    if (_FONTS_DIR / "NotoSans.ttf").exists():
        if is_italic and (_FONTS_DIR / "NotoSans-Italic.ttf").exists():
            return "NotoSans-Italic"
        return "NotoSans"

    base = "Helvetica"
    for key, mapped in _BUILTIN_FONT_MAP.items():
        if key in lower:
            base = mapped
            break

    if is_bold:
        return _BOLD_SUFFIX.get(base, base)
    if is_italic:
        return _ITALIC_SUFFIX.get(base, base)
    return base


# ── Text layout helpers ──────────────────────────────────────────────

def _wrap_lines(text: str, font_name: str, font_size: float, box_width: float, measure) -> list[str]:
    """Word-wrap *text* into lines that fit within *box_width*."""
    result: list[str] = []
    for paragraph in text.split("\n"):
        words = paragraph.split()
        if not words:
            continue
        line = ""
        for word in words:
            test = f"{line} {word}".strip()
            if measure(test, font_name, font_size) <= box_width:
                line = test
            else:
                if line:
                    result.append(line)
                line = word
        if line:
            result.append(line)
    return result or [""]


def _fit_font_size(
    text: str,
    font_name: str,
    original_size: float,
    box_width: float,
    measure,
    min_size: float = 5.0,
) -> float:
    """Shrink font only when the longest single word is wider than *box_width*."""
    size = original_size
    words = text.replace("\n", " ").split()
    if not words:
        return size

    while size >= min_size:
        widest = max(measure(w, font_name, size) for w in words)
        if widest <= box_width:
            return size
        size -= 0.5

    return max(size, min_size)


# ── Main builder ─────────────────────────────────────────────────────

def _whiteout_original_text(
    original_pdf: bytes,
    blocks: list[dict[str, Any]],
) -> bytes:
    """
    Draw white rectangles over every original text area in the PDF.

    This covers the original text so translated text can be drawn on top
    without overlapping.  Returns modified PDF bytes.
    """
    doc = fitz.open(stream=original_pdf, filetype="pdf")

    # Group blocks by page
    pages: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for block in blocks:
        pages[block["page_number"]].append(block)

    white = fitz.utils.getColor("white")

    for page_idx, page_blocks in pages.items():
        if page_idx >= len(doc):
            continue
        page = doc[page_idx]
        for block in page_blocks:
            text = block.get("text", "")
            if not text.strip():
                continue
            # Expand rect slightly to cover any antialiasing artifacts
            rect = fitz.Rect(
                block["x0"] - 1,
                block["y0"] - 1,
                block["x1"] + 1,
                block["y1"] + 1,
            )
            # Draw filled white rectangle with no border
            page.draw_rect(rect, color=white, fill=white, overlay=True)

    out = doc.tobytes()
    doc.close()
    return out


def _build_text_overlay(
    blocks: list[dict[str, Any]],
    page_dims: list[dict[str, float]],
    target_lang: str | None = None,
) -> bytes:
    """
    Build a transparent-background PDF containing only the translated text.

    This will be merged on top of the whited-out original.
    """
    _register_fonts()

    buf = io.BytesIO()

    pages: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for block in blocks:
        pages[block["page_number"]].append(block)

    total_pages = max(len(page_dims), (max(pages.keys()) + 1) if pages else 0)
    default_w, default_h = letter

    c = canvas.Canvas(buf)

    for page_idx in range(total_pages):
        if page_idx < len(page_dims):
            pw = page_dims[page_idx]["width"]
            ph = page_dims[page_idx]["height"]
        else:
            pw, ph = default_w, default_h

        c.setPageSize((pw, ph))

        for block in pages.get(page_idx, []):
            text = block["text"]
            if not text.strip():
                continue

            original_size = block["font_size"]
            font_name = _map_font(block["font_name"], target_lang)
            x0 = block["x0"]
            y0 = block["y0"]
            x1 = block["x1"]
            y1 = block["y1"]

            box_width = x1 - x0
            box_height = y1 - y0

            if box_width <= 0 or box_height <= 0:
                continue

            font_size = _fit_font_size(
                text, font_name, original_size,
                box_width,
                c.stringWidth,
            )

            raw_baseline = block.get("baseline", y0 + original_size * 0.8)
            if original_size > 0 and font_size != original_size:
                rl_y = ph - y0 - font_size * 0.8
            else:
                rl_y = ph - raw_baseline

            try:
                c.setFont(font_name, font_size)
            except KeyError:
                font_name = "Helvetica"
                c.setFont(font_name, font_size)

            c.saveState()
            clip = c.beginPath()
            clip.rect(x0, ph - y1, box_width, box_height)
            c.clipPath(clip, stroke=0, fill=0)

            text_obj = c.beginText(x0, rl_y)
            text_obj.setFont(font_name, font_size)
            text_obj.setLeading(font_size * 1.2)

            for line in _wrap_lines(text, font_name, font_size, box_width, c.stringWidth):
                text_obj.textLine(line)

            c.drawText(text_obj)
            c.restoreState()

        c.showPage()

    c.save()
    return buf.getvalue()


def build_translated_pdf(
    blocks: list[dict[str, Any]],
    page_dims: list[dict[str, float]],
    target_lang: str | None = None,
    original_pdf: bytes | None = None,
) -> bytes:
    """
    Build a translated PDF.

    If *original_pdf* bytes are provided, uses the overlay method:
      1. White-out original text areas in the source PDF
      2. Build a text-only overlay with translated content
      3. Merge overlay onto the original (preserving images, shapes, etc.)

    If no original is provided, falls back to building a text-only PDF.
    """
    if original_pdf is None:
        # Fallback: text-only PDF (no images preserved)
        return _build_text_overlay(blocks, page_dims, target_lang)

    # Step 1: White-out original text on the source PDF
    whited_out = _whiteout_original_text(original_pdf, blocks)

    # Step 2: Build transparent overlay with translated text
    overlay_bytes = _build_text_overlay(blocks, page_dims, target_lang)

    # Step 3: Merge overlay onto whited-out original using PyMuPDF
    base_doc = fitz.open(stream=whited_out, filetype="pdf")
    overlay_doc = fitz.open(stream=overlay_bytes, filetype="pdf")

    for page_idx in range(len(base_doc)):
        if page_idx >= len(overlay_doc):
            break
        base_page = base_doc[page_idx]
        # show_pdf_page draws the overlay page onto the base page
        base_page.show_pdf_page(
            base_page.rect,
            overlay_doc,
            page_idx,
            overlay=True,
        )

    result = base_doc.tobytes()
    base_doc.close()
    overlay_doc.close()
    return result
