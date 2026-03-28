"""Tests for the PyMuPDF-based PDF builder."""

import io
import fitz

from services.pdf_builder import _map_font, build_translated_pdf


def _make_pdf_with_text(text: str = "Hello world") -> bytes:
    """Create a minimal single-page PDF with one text block."""
    buf = io.BytesIO()
    with fitz.open() as doc:
        page = doc.new_page(width=612, height=792)
        page.insert_text((72, 100), text, fontsize=12)
        doc.save(buf)
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

    assert result[:4] == b"%PDF"
    with fitz.open(stream=result, filetype="pdf") as doc:
        assert len(doc) == 1
        page_text = doc[0].get_text()
        assert "Hola mundo" in page_text


def test_build_preserves_page_count():
    # Two-page PDF
    buf = io.BytesIO()
    with fitz.open() as doc:
        for _ in range(2):
            page = doc.new_page(width=612, height=792)
            page.insert_text((72, 100), "Page text", fontsize=12)
        doc.save(buf)
    original = buf.getvalue()

    blocks = [
        {"page_number": 0, "x0": 72, "y0": 88, "x1": 300, "y1": 108,
         "text": "Translated page one", "font_size": 12, "font_name": "Helvetica", "baseline_y": 100},
        {"page_number": 1, "x0": 72, "y0": 88, "x1": 300, "y1": 108,
         "text": "Translated page two", "font_size": 12, "font_name": "Helvetica", "baseline_y": 100},
    ]
    page_dims = [{"width": 612, "height": 792}, {"width": 612, "height": 792}]

    result = build_translated_pdf(blocks, page_dims, original)
    with fitz.open(stream=result, filetype="pdf") as out_doc:
        assert len(out_doc) == 2


def test_build_with_empty_blocks_returns_original_page_count():
    original = _make_pdf_with_text("Original text")
    result = build_translated_pdf([], [{"width": 612, "height": 792}], original)
    with fitz.open(stream=result, filetype="pdf") as doc:
        assert len(doc) == 1


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
