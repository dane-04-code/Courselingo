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
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    blocks: list[dict[str, Any]] = []

    for page_num, page in enumerate(doc):
        # get_text("dict") gives us blocks → lines → spans with font info
        page_dict = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)
        page_width = page.rect.width

        for block in page_dict.get("blocks", []):
            # Skip image blocks (type == 1)
            if block.get("type") != 0:
                continue

            # Collect all spans to find dominant font
            all_spans: list[dict[str, Any]] = []

            # Collect lines as (text, is_new_list_item) pairs.
            # Word-wrap continuations join with a space; new list items
            # get a \n so DeepL and insert_textbox preserve item boundaries.
            line_parts: list[tuple[str, bool]] = []
            for line in block.get("lines", []):
                span_texts: list[str] = []
                for span in line.get("spans", []):
                    span_text = span.get("text", "")
                    if span_text.strip():
                        all_spans.append(span)
                        span_texts.append(span_text)
                if span_texts:
                    line_text = " ".join(span_texts)
                    line_parts.append((line_text, bool(_LIST_ITEM_RE.match(line_text))))

            if not line_parts:
                continue
            parts = [line_parts[0][0]]
            for line_text, is_new_item in line_parts[1:]:
                parts.append(("\n" if is_new_item else " ") + line_text)
            full_text = "".join(parts).strip()
            if not full_text:
                continue

            font_name, font_size = _dominant_font(all_spans)

            bbox = block["bbox"]  # (x0, y0, x1, y1)

            # Expand x1 by 30% of block width, capped at page width.
            block_width = bbox[2] - bbox[0]
            x1_expanded = min(bbox[2] + 0.30 * block_width, page_width)

            # Use the first span's origin (exact baseline point) when available.
            # origin is (x, y) in PyMuPDF top-left coordinates.
            first_span = all_spans[0] if all_spans else None
            if first_span and "origin" in first_span:
                baseline_y = first_span["origin"][1]
            else:
                # Fallback: approximate baseline as top-of-box + font_size
                baseline_y = bbox[1] + font_size

            # Store the full block as-is, preserving \n for list item boundaries.
            # insert_textbox handles \n as line breaks, and deepl.py translates
            # each \n-separated line independently — so no sub-block height
            # slicing is needed (and equal slicing caused content to bleed across
            # bullet items when translation expanded the text).
            blocks.append(
                asdict(
                    TextBlock(
                        page_number=page_num,
                        x0=bbox[0],
                        y0=bbox[1],
                        x1=x1_expanded,
                        y1=bbox[3],
                        text=full_text,
                        font_size=round(font_size, 2),
                        font_name=font_name,
                        baseline_y=round(baseline_y, 2),
                    )
                )
            )

    doc.close()
    return blocks


def get_page_dimensions(pdf_bytes: bytes) -> list[dict[str, float]]:
    """Return [{width, height}, …] for every page in the PDF."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    dims = [{"width": page.rect.width, "height": page.rect.height} for page in doc]
    doc.close()
    return dims
