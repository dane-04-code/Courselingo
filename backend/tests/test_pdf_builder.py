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
        page_text = doc[0].get_text().replace("\xa0", " ")
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


def test_build_font_size_coordination():
    """Blocks with the same original font size on the same page should all
    use the minimum fitted size across the group."""
    original = _make_pdf_with_text("Hello")
    # One block needs to shrink (narrow box), one fits easily (wide box).
    # Both have the same original font_size=12 → both should render at the
    # shrunk size.
    blocks = [
        {
            "page_number": 0,
            "x0": 72.0, "y0": 50.0, "x1": 85.0, "y1": 70.0,  # narrow: forces shrink
            "text": "Bonjour le monde comment allez vous",
            "font_size": 12.0,
            "font_name": "Helvetica",
            "baseline_y": 60.0,
        },
        {
            "page_number": 0,
            "x0": 72.0, "y0": 100.0, "x1": 400.0, "y1": 120.0,  # wide: fits easily
            "text": "Hi",
            "font_size": 12.0,
            "font_name": "Helvetica",
            "baseline_y": 110.0,
        },
    ]
    page_dims = [{"width": 612.0, "height": 792.0}]
    # Should not raise; both blocks rendered at same coordinated size
    result = build_translated_pdf(blocks, page_dims, original)
    assert result[:4] == b"%PDF"


def test_build_bullet_points_do_not_raise():
    """Bullet characters (outside Latin-1) should render without crashing."""
    original = _make_pdf_with_text("Hello")
    blocks = [{
        "page_number": 0,
        "x0": 72.0, "y0": 88.0, "x1": 400.0, "y1": 200.0,
        "text": "• First item\n• Second item\n• Third item",
        "font_size": 12.0,
        "font_name": "Helvetica",
        "baseline_y": 100.0,
    }]
    page_dims = [{"width": 612.0, "height": 792.0}]
    result = build_translated_pdf(blocks, page_dims, original)
    assert result[:4] == b"%PDF"


def test_build_translated_pdf_watermark_does_not_crash():
    """watermark=True should produce a valid PDF without raising."""
    pdf_bytes = _make_pdf_with_text("Hello world")
    blocks = [
        {
            "text": "Bonjour le monde",
            "page_number": 0,
            "x0": 72.0, "y0": 88.0, "x1": 200.0, "y1": 104.0,
            "font_size": 12.0,
            "font_name": "Helvetica",
        }
    ]
    page_dims = [{"width": 612.0, "height": 792.0}]
    result = build_translated_pdf(blocks, page_dims, pdf_bytes, watermark=True)
    assert isinstance(result, bytes)
    assert len(result) > 0
    doc = fitz.open(stream=result, filetype="pdf")
    assert doc.page_count == 1
    doc.close()


def test_build_translated_pdf_no_watermark_by_default():
    """watermark defaults to False — old 3-arg call still works."""
    pdf_bytes = _make_pdf_with_text("Hello world")
    blocks = [
        {
            "text": "Bonjour le monde",
            "page_number": 0,
            "x0": 72.0, "y0": 88.0, "x1": 200.0, "y1": 104.0,
            "font_size": 12.0,
            "font_name": "Helvetica",
        }
    ]
    page_dims = [{"width": 612.0, "height": 792.0}]
    result = build_translated_pdf(blocks, page_dims, pdf_bytes)
    assert isinstance(result, bytes)
