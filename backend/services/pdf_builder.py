"""PDF builder service — reconstructs a translated PDF with ReportLab."""

from __future__ import annotations

import io
from collections import defaultdict
from typing import Any

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch  # noqa: F401
from reportlab.pdfgen import canvas

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


def _fit_font_size(
    text: str,
    font_name: str,
    original_size: float,
    box_width: float,
    box_height: float,
    measure,
    min_size: float = 5.0,
) -> float:
    """
    Shrink the font size (if needed) so that word-wrapped *text* fits inside
    the bounding box.  Never goes below *min_size*.
    """
    size = original_size

    while size >= min_size:
        leading = size * 1.2
        lines = _wrap_lines(text, font_name, size, box_width, measure)
        total_height = len(lines) * leading

        if total_height <= box_height:
            return size          # fits!

        size -= 0.5              # shrink by half a point and retry

    return max(size, min_size)


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
            font_name = _map_font(block["font_name"])
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

            # Flip y: ReportLab 0 is at bottom, PyMuPDF 0 is at top
            rl_y = ph - y0 - font_size

            try:
                c.setFont(font_name, font_size)
            except KeyError:
                font_name = "Helvetica"
                c.setFont(font_name, font_size)

            # Use a text object so we can do basic word-wrap inside the box
            text_obj = c.beginText(x0, rl_y)
            text_obj.setFont(font_name, font_size)
            text_obj.setLeading(font_size * 1.2)

            for line in _wrap_lines(text, font_name, font_size, box_width, c.stringWidth):
                text_obj.textLine(line)

            c.drawText(text_obj)

        c.showPage()

    c.save()
    return buf.getvalue()
