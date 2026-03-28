# PDF Builder PyMuPDF Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ReportLab-based PDF builder with a PyMuPDF redact+rewrite approach that preserves images, backgrounds, and all non-text content.

**Architecture:** Open the original PDF with PyMuPDF, draw white redact annotations over each text block's bounding box, call `apply_redacts()` to erase original text while leaving images/shapes untouched, then re-insert translated text using `insert_textbox()` with font-size shrinking to fit.

**Tech Stack:** PyMuPDF (`fitz`) — already in `requirements.txt`. No new dependencies.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `backend/services/pdf_builder.py` | Full rewrite | Font mapping, font-size fitting, redact+rewrite pipeline |
| `backend/main.py` | Small edit | Forward `file_bytes` to `build_translated_pdf` |
| `backend/tests/test_pdf_builder.py` | Create | Unit + integration tests for the new builder |

---

## Task 1: Write failing tests for the new builder

**Files:**
- Create: `backend/tests/test_pdf_builder.py`

- [ ] **Step 1: Create the test file**

```python
# backend/tests/test_pdf_builder.py
"""Tests for the PyMuPDF-based PDF builder."""

import io
import fitz
import pytest

from services.pdf_builder import _map_font, build_translated_pdf


def _make_pdf_with_text(text: str = "Hello world") -> bytes:
    """Create a minimal single-page PDF with one text block."""
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)
    page.insert_text((72, 100), text, fontsize=12)
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


# ── _map_font ────────────────────────────────────────────────────────

def test_map_font_helvetica_variants():
    assert _map_font("Helvetica") == "helv"
    assert _map_font("Arial") == "helv"
    assert _map_font("Calibri") == "helv"

def test_map_font_bold():
    assert _map_font("Helvetica-Bold") == "hebo"
    assert _map_font("BCDGEE+Calibri-Bold") == "hebo"

def test_map_font_italic():
    assert _map_font("Arial-Italic") == "heit"
    assert _map_font("Helvetica-Oblique") == "heit"

def test_map_font_bold_italic():
    assert _map_font("Helvetica-BoldOblique") == "hebi"

def test_map_font_times():
    assert _map_font("Times-Roman") == "tiro"
    assert _map_font("TimesNewRoman-Bold") == "tibo"
    assert _map_font("Times-Italic") == "tiit"

def test_map_font_courier():
    assert _map_font("Courier") == "cour"
    assert _map_font("CourierNew-Bold") == "cobo"

def test_map_font_unknown_falls_back_to_helv():
    assert _map_font("SomeUnknownFont") == "helv"

def test_map_font_strips_subset_prefix():
    # PyMuPDF returns fonts like "ABCDEF+Calibri"
    assert _map_font("ABCDEF+Calibri") == "helv"
    assert _map_font("XYZABC+Times-Bold") == "tibo"


# ── build_translated_pdf ─────────────────────────────────────────────

def test_build_returns_valid_pdf_bytes():
    original = _make_pdf_with_text("Hello world")
    blocks = [{
        "page_number": 0,
        "x0": 72.0, "y0": 88.0, "x1": 300.0, "y1": 108.0,
        "text": "Hola mundo",
        "font_size": 12.0,
        "font_name": "Helvetica",
        "baseline_y": 100.0,
    }]
    page_dims = [{"width": 612.0, "height": 792.0}]

    result = build_translated_pdf(blocks, page_dims, original)

    # Must be valid PDF bytes
    assert result[:4] == b"%PDF"
    doc = fitz.open(stream=result, filetype="pdf")
    assert len(doc) == 1
    doc.close()


def test_build_preserves_page_count():
    # Two-page PDF
    doc = fitz.open()
    for _ in range(2):
        page = doc.new_page(width=612, height=792)
        page.insert_text((72, 100), "Page text", fontsize=12)
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    original = buf.getvalue()

    blocks = [
        {"page_number": 0, "x0": 72, "y0": 88, "x1": 300, "y1": 108,
         "text": "Translated page one", "font_size": 12, "font_name": "Helvetica", "baseline_y": 100},
        {"page_number": 1, "x0": 72, "y0": 88, "x1": 300, "y1": 108,
         "text": "Translated page two", "font_size": 12, "font_name": "Helvetica", "baseline_y": 100},
    ]
    page_dims = [{"width": 612, "height": 792}, {"width": 612, "height": 792}]

    result = build_translated_pdf(blocks, page_dims, original)
    out_doc = fitz.open(stream=result, filetype="pdf")
    assert len(out_doc) == 2
    out_doc.close()


def test_build_with_empty_blocks_returns_original_page_count():
    original = _make_pdf_with_text("Original text")
    result = build_translated_pdf([], [{"width": 612, "height": 792}], original)
    doc = fitz.open(stream=result, filetype="pdf")
    assert len(doc) == 1
    doc.close()


def test_build_with_long_text_does_not_raise():
    """Very long text that can't fit even at 7pt should not crash."""
    original = _make_pdf_with_text("Short")
    blocks = [{
        "page_number": 0,
        "x0": 72.0, "y0": 88.0, "x1": 100.0, "y1": 92.0,  # tiny box
        "text": "This is an extremely long text that will absolutely not fit in the tiny bounding box",
        "font_size": 12.0,
        "font_name": "Helvetica",
        "baseline_y": 100.0,
    }]
    page_dims = [{"width": 612.0, "height": 792.0}]
    # Should not raise
    result = build_translated_pdf(blocks, page_dims, original)
    assert result[:4] == b"%PDF"
```

- [ ] **Step 2: Run tests to verify they all fail**

```bash
cd backend && python -m pytest tests/test_pdf_builder.py -v
```

Expected: `ImportError` or `ModuleNotFoundError` — `_map_font` and updated `build_translated_pdf` don't exist yet.

---

## Task 2: Rewrite pdf_builder.py

**Files:**
- Modify: `backend/services/pdf_builder.py` (full rewrite)

- [ ] **Step 1: Replace the entire file**

```python
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

        # 2. Apply redacts — removes text pixels, images=0 preserves images
        page.apply_redacts(images=fitz.PDF_REDACT_IMAGE_NONE)

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
```

- [ ] **Step 2: Run the tests**

```bash
cd backend && python -m pytest tests/test_pdf_builder.py -v
```

Expected: all tests pass.

---

## Task 3: Update main.py to pass original_pdf_bytes

**Files:**
- Modify: `backend/main.py` line 76

- [ ] **Step 1: Update the `build_translated_pdf` call in `_handle_pdf`**

Find this line in `_handle_pdf` (~line 76):

```python
        output = build_translated_pdf(translated_blocks, page_dims)
```

Replace with:

```python
        output = build_translated_pdf(translated_blocks, page_dims, file_bytes)
```

No other changes needed — `file_bytes` is already in scope in `_handle_pdf`.

- [ ] **Step 2: Verify the server starts without errors**

```bash
cd backend && uvicorn main:app --reload
```

Expected: `INFO: Application startup complete.` with no import errors.

- [ ] **Step 3: Commit**

```bash
cd "C:/Translator for course sellers"
git add backend/services/pdf_builder.py backend/main.py backend/tests/test_pdf_builder.py
git commit -m "feat: replace ReportLab builder with PyMuPDF redact+rewrite

Preserves images, backgrounds, and all non-text content by operating
on the original PDF rather than rebuilding from a blank canvas.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Smoke test with a real PDF

- [ ] **Step 1: Start both servers**

Terminal 1 — backend:
```bash
cd backend && uvicorn main:app --reload
```

Terminal 2 — frontend:
```bash
cd frontend && npm run dev
```

- [ ] **Step 2: Upload a PDF and verify output**

Open `http://localhost:3000/translator`, upload any course PDF, translate to any language, download the result.

Check:
- Images in the output PDF match the original
- Backgrounds and colored elements are preserved
- Translated text appears where original text was
- No white-box patches where images should be

- [ ] **Step 3: Verify with a Canva-exported PDF specifically**

Canva PDFs often have background images and decorative shapes — this is the primary use case. If you have one, test it and compare the before/after visually.
