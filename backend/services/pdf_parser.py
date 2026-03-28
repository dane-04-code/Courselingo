"""PDF parsing service — extracts text blocks with position metadata using PyMuPDF."""

from __future__ import annotations

import re
from dataclasses import dataclass, asdict
from typing import Any

import fitz  # PyMuPDF

# Matches lines that start a new bullet/numbered list item.
# Used to distinguish semantic line breaks from word-wrap breaks.
_LIST_ITEM_RE = re.compile(r"^[\s]*([•◦▪▸►→–\-\*]|\d+[.):])\s")


@dataclass
class TextBlock:
    """A single text block extracted from a PDF page."""

    page_number: int
    x0: float
    y0: float
    x1: float
    y1: float
    text: str
    font_size: float
    font_name: str
    baseline_y: float  # exact baseline y from the first span's origin (PyMuPDF coords)


def _dominant_font(spans: list[dict[str, Any]]) -> tuple[str, float]:
    """Return the (font_name, font_size) that covers the most characters."""
    if not spans:
        return ("Helvetica", 12.0)
    best = max(spans, key=lambda s: len(s.get("text", "")))
    return best.get("font", "Helvetica"), best.get("size", 12.0)


def extract_text_blocks(pdf_bytes: bytes) -> list[dict[str, Any]]:
    """
    Open a PDF from raw bytes and return a list of text-block dicts.

    Each dict mirrors the ``TextBlock`` fields and preserves the exact
    bounding-box coordinates so the builder can reconstruct the layout.

    A single PyMuPDF block can span multiple visual paragraphs (e.g. a PDF
    that stores two bullet items as one block).  We detect paragraph breaks
    by comparing top-to-top line spacing: a gap >= 1.5× the median spacing
    within a block signals a new paragraph.  Each paragraph group gets its
    own sub-block with bounding-box coordinates derived from the actual line
    positions — never from equal height slices.
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    blocks: list[dict[str, Any]] = []

    for page_num, page in enumerate(doc):
        # get_text("dict") gives us blocks → lines → spans with font info
        page_dict = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)
        page_width = page.rect.width

        for raw_block in page_dict.get("blocks", []):
            # Skip image blocks (type == 1)
            if raw_block.get("type") != 0:
                continue

            # Gather per-line data: (line_text, line_bbox, spans)
            line_data: list[tuple[str, tuple, list]] = []
            for line in raw_block.get("lines", []):
                span_texts: list[str] = []
                spans: list[dict] = []
                for span in line.get("spans", []):
                    t = span.get("text", "")
                    if t.strip():
                        spans.append(span)
                        span_texts.append(t)
                if span_texts:
                    line_data.append((" ".join(span_texts), line["bbox"], spans))

            if not line_data:
                continue

            # ── Paragraph break detection ─────────────────────────────
            # Measure top-to-top spacing between consecutive lines.
            # A spacing >= 1.5× the median indicates a paragraph boundary
            # (extra leading between paragraphs vs. normal line spacing).
            if len(line_data) >= 2:
                spacings = [
                    line_data[i + 1][1][1] - line_data[i][1][1]
                    for i in range(len(line_data) - 1)
                ]
                sorted_s = sorted(spacings)
                median_s = sorted_s[len(sorted_s) // 2]
                para_threshold = median_s * 1.5

                para_groups: list[list] = []
                current: list = [line_data[0]]
                for i, spacing in enumerate(spacings):
                    if spacing >= para_threshold:
                        para_groups.append(current)
                        current = []
                    current.append(line_data[i + 1])
                para_groups.append(current)
            else:
                para_groups = [line_data]

            # x1 expansion is the same for all sub-blocks from this raw block
            raw_bbox = raw_block["bbox"]
            block_width = raw_bbox[2] - raw_bbox[0]
            x1_expanded = min(raw_bbox[2] + 0.30 * block_width, page_width)

            # ── Emit one TextBlock per paragraph group ────────────────
            for group in para_groups:
                # Build text with smart line joining:
                # new list items get \n; word-wrap continuations get a space.
                line_parts = [
                    (lt, bool(_LIST_ITEM_RE.match(lt)))
                    for lt, _, _ in group
                ]
                parts = [line_parts[0][0]]
                for line_text, is_new_item in line_parts[1:]:
                    parts.append(("\n" if is_new_item else " ") + line_text)
                full_text = "".join(parts).strip()
                if not full_text:
                    continue

                all_spans = [span for _, _, spans in group for span in spans]
                font_name, font_size = _dominant_font(all_spans)

                # Use actual line y-coordinates — not equal slices.
                group_y0 = group[0][1][1]   # top of first line
                group_y1 = group[-1][1][3]  # bottom of last line

                first_span = all_spans[0] if all_spans else None
                if first_span and "origin" in first_span:
                    baseline_y = first_span["origin"][1]
                else:
                    baseline_y = group_y0 + font_size

                blocks.append(asdict(TextBlock(
                    page_number=page_num,
                    x0=raw_bbox[0],
                    y0=group_y0,
                    x1=x1_expanded,
                    y1=group_y1,
                    text=full_text,
                    font_size=round(font_size, 2),
                    font_name=font_name,
                    baseline_y=round(baseline_y, 2),
                )))

    doc.close()
    return blocks


def get_page_dimensions(pdf_bytes: bytes) -> list[dict[str, float]]:
    """Return [{width, height}, …] for every page in the PDF."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    dims = [{"width": page.rect.width, "height": page.rect.height} for page in doc]
    doc.close()
    return dims
