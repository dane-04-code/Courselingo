"""PDF parsing service — extracts text lines with position metadata using PyMuPDF."""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any

import fitz  # PyMuPDF


@dataclass
class TextBlock:
    """A single text line extracted from a PDF page."""

    page_number: int
    x0: float
    y0: float
    x1: float
    y1: float
    baseline: float   # actual baseline y (PyMuPDF coords)
    text: str
    font_size: float
    font_name: str


def _dominant_font(spans: list[dict[str, Any]]) -> tuple[str, float]:
    """Return the (font_name, font_size) that covers the most characters."""
    if not spans:
        return ("Helvetica", 12.0)
    best = max(spans, key=lambda s: len(s.get("text", "")))
    return best.get("font", "Helvetica"), best.get("size", 12.0)


def extract_text_blocks(pdf_bytes: bytes) -> list[dict[str, Any]]:
    """
    Open a PDF from raw bytes and return a list of text-block dicts.

    Extracts at the *line* level so each entry has a single, consistent
    font size.  This prevents headings and body text that PyMuPDF groups
    into the same block from being merged into one font size.
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    blocks: list[dict[str, Any]] = []

    for page_num, page in enumerate(doc):
        page_dict = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)

        for block in page_dict.get("blocks", []):
            if block.get("type") != 0:
                continue

            for line in block.get("lines", []):
                spans = line.get("spans", [])
                if not spans:
                    continue

                # Build line text from spans and collect font info
                non_empty_spans: list[dict[str, Any]] = []
                parts: list[str] = []
                baseline: float | None = None

                for span in spans:
                    span_text = span.get("text", "")
                    parts.append(span_text)
                    if span_text.strip():
                        non_empty_spans.append(span)
                        if baseline is None:
                            origin = span.get("origin")
                            if origin:
                                baseline = origin[1]

                text = "".join(parts).strip()
                if not text:
                    continue

                font_name, font_size = _dominant_font(non_empty_spans)

                # Use the line's own bbox for precise positioning
                bbox = line["bbox"]  # (x0, y0, x1, y1)

                if baseline is None:
                    baseline = bbox[1] + font_size * 0.8

                blocks.append(
                    asdict(
                        TextBlock(
                            page_number=page_num,
                            x0=bbox[0],
                            y0=bbox[1],
                            x1=bbox[2],
                            y1=bbox[3],
                            baseline=round(baseline, 2),
                            text=text,
                            font_size=round(font_size, 2),
                            font_name=font_name,
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
