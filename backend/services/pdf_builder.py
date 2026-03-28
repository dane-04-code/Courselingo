"""PDF builder service — reconstructs a translated PDF with ReportLab."""

from __future__ import annotations

import io
import os
from collections import defaultdict
from typing import Any

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch  # noqa: F401
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

# ── Unicode font registration ─────────────────────────────────────────
# ReportLab's 14 built-in fonts only cover Latin-1.  For any text that
# contains characters outside that range (e.g. Romanian, Polish, Czech…)
# we fall back to a system TTF that covers the full BMP.

_UNI = "UniFont"
_UNI_BOLD = "UniFont-Bold"
_UNI_OBLIQUE = "UniFont-Oblique"
_UNICODE_FONTS_READY = False

_TTF_CANDIDATES = [
    # (regular,                                    bold,                                       oblique)
    ("C:/Windows/Fonts/arial.ttf",               "C:/Windows/Fonts/arialbd.ttf",             "C:/Windows/Fonts/ariali.ttf"),
    ("C:/Windows/Fonts/Arial.ttf",               "C:/Windows/Fonts/ArialBD.ttf",             "C:/Windows/Fonts/ArialI.ttf"),
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
     "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
     "/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf"),
    ("/usr/share/fonts/dejavu/DejaVuSans.ttf",
     "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
     "/usr/share/fonts/dejavu/DejaVuSans-Oblique.ttf"),
]


def _register_unicode_fonts() -> bool:
    global _UNICODE_FONTS_READY
    if _UNICODE_FONTS_READY:
        return True
    for regular, bold, oblique in _TTF_CANDIDATES:
        if not os.path.exists(regular):
            continue
        try:
            pdfmetrics.registerFont(TTFont(_UNI, regular))
            pdfmetrics.registerFont(TTFont(_UNI_BOLD,    bold    if os.path.exists(bold)    else regular))
            pdfmetrics.registerFont(TTFont(_UNI_OBLIQUE, oblique if os.path.exists(oblique) else regular))
            _UNICODE_FONTS_READY = True
            return True
        except Exception:
            continue
    return False


def _needs_unicode(text: str) -> bool:
    try:
        text.encode("latin-1")
        return False
    except (UnicodeEncodeError, UnicodeDecodeError):
        return True


def _resolve_font(mapped_name: str, text: str) -> str:
    """Return the best font name: Unicode TTF if needed, built-in otherwise."""
    if not _needs_unicode(text):
        return mapped_name
    if not _register_unicode_fonts():
        return mapped_name  # best effort — characters may still be missing
    if "Bold" in mapped_name:
        return _UNI_BOLD
    if "Oblique" in mapped_name or "Italic" in mapped_name:
        return _UNI_OBLIQUE
    return _UNI

# ── Font-name mapping ────────────────────────────────────────────────
# PyMuPDF returns the *embedded* font name (e.g. "BCDGEE+Calibri-Bold").
# ReportLab only ships the standard 14 PDF fonts.  We map common families
# to their closest ReportLab built-in equivalent.

_FONT_MAP: dict[str, str] = {
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


def _map_font(pdf_font_name: str) -> str:
    """Best-effort mapping from an embedded font name to a ReportLab built-in."""
    lower = pdf_font_name.lower()

    # Strip subset prefix like "BCDGEE+"
    if "+" in lower:
        lower = lower.split("+", 1)[1]

    is_bold = "bold" in lower
    is_italic = "italic" in lower or "oblique" in lower

    # Try known families
    base = "Helvetica"  # fallback
    for key, mapped in _FONT_MAP.items():
        if key in lower:
            base = mapped
            break

    if is_bold:
        return _BOLD_SUFFIX.get(base, base)
    if is_italic:
        return _ITALIC_SUFFIX.get(base, base)
    return base


def _wrap_lines(text: str, font_name: str, font_size: float, box_width: float, measure) -> list[str]:
    """Word-wrap *text* into lines that fit within *box_width* at the given font."""
    words = text.split()
    lines: list[str] = []
    line = ""
    for word in words:
        test = f"{line} {word}".strip()
        if measure(test, font_name, font_size) <= box_width:
            line = test
        else:
            if line:
                lines.append(line)
            # If a single word is wider than the box, add it anyway (will be shrunk later)
            line = word
    if line:
        lines.append(line)
    return lines


MIN_FONT_SIZE = 7.0


def _fit_font_size(
    text: str,
    font_name: str,
    original_size: float,
    box_width: float,
    box_height: float,
    measure,
    min_size: float = MIN_FONT_SIZE,
) -> float:
    """
    Shrink the font size (if needed) so that word-wrapped *text* fits inside
    the bounding box.  Never goes below *min_size* (default 7 pt).
    """
    size = original_size

    while size >= min_size:
        leading = size * 1.2
        lines = _wrap_lines(text, font_name, size, box_width, measure)
        total_height = len(lines) * leading

        if total_height <= box_height:
            return size          # fits!

        size -= 0.5              # shrink by half a point and retry

    return min_size


def build_translated_pdf(
    blocks: list[dict[str, Any]],
    page_dims: list[dict[str, float]],
) -> bytes:
    """
    Build a new PDF from *blocks* (already translated) using ReportLab.

    Each block dict must contain:
        page_number, x0, y0, x1, y1, text, font_size, font_name

    *page_dims* is a list of ``{width, height}`` for each page so we can
    set the correct page size and flip the y-axis (PyMuPDF uses top-left
    origin; ReportLab uses bottom-left).

    Returns the raw PDF bytes.
    """
    buf = io.BytesIO()

    # Group blocks by page
    pages: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for block in blocks:
        pages[block["page_number"]].append(block)

    # Determine total number of pages (some pages may have no text blocks)
    total_pages = max(len(page_dims), (max(pages.keys()) + 1) if pages else 0)

    # Default page size fallback
    default_w, default_h = letter  # 612 × 792

    c = canvas.Canvas(buf)

    for page_idx in range(total_pages):
        # Page dimensions
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
            font_name = _resolve_font(_map_font(block["font_name"]), text)
            x0 = block["x0"]
            y0 = block["y0"]
            x1 = block["x1"]
            y1 = block["y1"]

            box_width = x1 - x0
            box_height = y1 - y0

            # Auto-fit: shrink font if translated text doesn't fit the box
            font_size = _fit_font_size(
                text, font_name, original_size,
                box_width, box_height,
                c.stringWidth,
            )

            # Flip y: use the exact baseline extracted by the parser so
            # positioning stays accurate regardless of font-size shrinking.
            raw_baseline = block.get("baseline_y", y1)
            rl_y = ph - raw_baseline

            color = block.get("color", (0, 0, 0))
            if isinstance(color, (list, tuple)) and len(color) == 3:
                c.setFillColorRGB(color[0], color[1], color[2])
            else:
                c.setFillColorRGB(0, 0, 0)

            try:
                c.setFont(font_name, font_size)
            except KeyError:
                font_name = "Helvetica"
                c.setFont(font_name, font_size)

            # Word-wrap and clip lines to the box height so text never overflows
            leading = font_size * 1.2
            lines = _wrap_lines(text, font_name, font_size, box_width, c.stringWidth)
            max_lines = max(1, int(box_height / leading))
            lines = lines[:max_lines]

            text_obj = c.beginText(x0, rl_y)
            text_obj.setFont(font_name, font_size)
            text_obj.setLeading(leading)

            for line in lines:
                text_obj.textLine(line)

            c.drawText(text_obj)

        c.showPage()

    c.save()
    return buf.getvalue()
