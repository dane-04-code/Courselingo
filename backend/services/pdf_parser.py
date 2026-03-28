"""PDF parsing service — extracts text blocks with position metadata using PyMuPDF."""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any

import fitz  # PyMuPDF


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

        for block in page_dict.get("blocks", []):
            # Skip image blocks (type == 1)
            if block.get("type") != 0:
                continue

            # Collect all spans to find dominant font
            all_spans: list[dict[str, Any]] = []

            line_texts: list[str] = []
            for line in block.get("lines", []):
                span_texts: list[str] = []
                for span in line.get("spans", []):
                    span_text = span.get("text", "")
                    if span_text.strip():
                        all_spans.append(span)
                        span_texts.append(span_text)
                if span_texts:
                    line_texts.append(" ".join(span_texts))

            full_text = "\n".join(line_texts).strip()
            if not full_text:
                continue

            font_name, font_size = _dominant_font(all_spans)

            bbox = block["bbox"]  # (x0, y0, x1, y1)

            # Use the first span's origin (exact baseline point) when available.
            # origin is (x, y) in PyMuPDF top-left coordinates.
            first_span = all_spans[0] if all_spans else None
            if first_span and "origin" in first_span:
                baseline_y = first_span["origin"][1]
            else:
                # Fallback: approximate baseline as top-of-box + font_size
                baseline_y = bbox[1] + font_size

            blocks.append(
                asdict(
                    TextBlock(
                        page_number=page_num,
                        x0=bbox[0],
                        y0=bbox[1],
                        x1=bbox[2],
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
