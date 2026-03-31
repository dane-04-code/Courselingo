"""Tests for pdf_parser bullet-splitting logic."""

import io
import fitz
from services.pdf_parser import _split_bullet_items, extract_text_blocks


def _line(text: str, y0: float = 0.0, y1: float = 12.0):
    """Minimal (text, bbox, spans) tuple for testing."""
    # spans=[] is a deliberate simplification — real parser spans are complex.
    # This is sufficient for testing bullet-splitting logic which only needs text & bbox.
    return (text, (0.0, y0, 100.0, y1), [])


# ── _split_bullet_items ──────────────────────────────────────────────

def test_no_bullets_returns_single_group():
    """Plain paragraph with no bullet markers stays as one group."""
    lines = [_line("Hello world"), _line("continuation line")]
    result = _split_bullet_items(lines)
    assert result == [lines]


def test_single_bullet_returns_single_group():
    """A single bullet item is returned as one group."""
    lines = [_line("• Only item")]
    result = _split_bullet_items(lines)
    assert result == [lines]


def test_two_bullets_split_into_two_groups():
    """Two bullet items produce two groups."""
    b1 = _line("• First bullet", y0=0, y1=12)
    b2 = _line("• Second bullet", y0=14, y1=26)
    result = _split_bullet_items([b1, b2])
    assert len(result) == 2
    assert result[0] == [b1]
    assert result[1] == [b2]


def test_three_bullets_split_into_three_groups():
    """Three bullet items produce three separate groups."""
    b1 = _line("• Bullet one", y0=0, y1=12)
    b2 = _line("• Bullet two", y0=14, y1=26)
    b3 = _line("• Bullet three", y0=28, y1=40)
    result = _split_bullet_items([b1, b2, b3])
    assert len(result) == 3
    assert result[0] == [b1]
    assert result[1] == [b2]
    assert result[2] == [b3]


def test_bullet_with_continuation_lines_stays_together():
    """Continuation lines (no bullet marker) stay with their parent bullet."""
    b1 = _line("• First bullet", y0=0, y1=12)
    c1 = _line("  continuation of first", y0=14, y1=26)
    b2 = _line("• Second bullet", y0=28, y1=40)
    c2 = _line("  continuation of second", y0=42, y1=54)
    result = _split_bullet_items([b1, c1, b2, c2])
    assert len(result) == 2
    assert result[0] == [b1, c1]
    assert result[1] == [b2, c2]


def test_non_bullet_lines_before_bullets_form_own_group():
    """Plain text before any bullet becomes its own group."""
    intro = _line("Key facts:", y0=0, y1=12)
    b1 = _line("• First bullet", y0=14, y1=26)
    b2 = _line("• Second bullet", y0=28, y1=40)
    result = _split_bullet_items([intro, b1, b2])
    assert len(result) == 3
    assert result[0] == [intro]
    assert result[1] == [b1]
    assert result[2] == [b2]


def test_numbered_list_items_split():
    """Numbered list items (1. 2. etc.) also split correctly."""
    b1 = _line("1. First item", y0=0, y1=12)
    b2 = _line("2. Second item", y0=14, y1=26)
    result = _split_bullet_items([b1, b2])
    assert len(result) == 2
    assert result[0] == [b1]
    assert result[1] == [b2]


def test_dash_bullet_items_split():
    """Dash bullets (-) are also recognized as bullet markers."""
    b1 = _line("- First item", y0=0, y1=12)
    b2 = _line("- Second item", y0=14, y1=26)
    result = _split_bullet_items([b1, b2])
    assert len(result) == 2
    assert result[0] == [b1]
    assert result[1] == [b2]


def test_empty_input_returns_empty():
    result = _split_bullet_items([])
    assert result == []


# ── Integration tests using real PDFs ────────────────────────────────


def _make_bullet_pdf() -> bytes:
    """Create a single-page PDF with three bullet items at consistent spacing.

    All three bullets have the same inter-line gap (14pt top-to-top),
    which is the pathological case where paragraph-break detection alone
    cannot split them — requiring _split_bullet_items to do it.
    """
    buf = io.BytesIO()
    with fitz.open() as doc:
        page = doc.new_page(width=612, height=792)
        y = 100.0
        line_height = 14.0
        items = [
            "- First bullet item with some text",
            "- Second bullet item with some text",
            "- Third bullet item with some text",
        ]
        for item in items:
            page.insert_text((72, y), item, fontsize=10)
            y += line_height
        doc.save(buf)
    return buf.getvalue()


def test_bullet_items_are_separate_blocks():
    """Each bullet item must produce its own TextBlock."""
    pdf_bytes = _make_bullet_pdf()
    blocks = extract_text_blocks(pdf_bytes)

    bullet_blocks = [b for b in blocks if b["text"].startswith("-")]
    assert len(bullet_blocks) == 3, (
        f"Expected 3 separate bullet TextBlocks, got {len(bullet_blocks)}: "
        + str([b['text'][:40] for b in bullet_blocks])
    )


def test_bullet_blocks_have_distinct_y_ranges():
    """Each bullet block must occupy a distinct vertical slice."""
    pdf_bytes = _make_bullet_pdf()
    blocks = extract_text_blocks(pdf_bytes)
    bullet_blocks = sorted(
        [b for b in blocks if b["text"].startswith("-")],
        key=lambda b: b["y0"],
    )
    assert len(bullet_blocks) == 3
    for i in range(len(bullet_blocks) - 1):
        assert bullet_blocks[i]["y1"] <= bullet_blocks[i + 1]["y0"] + 1, (
            f"Block {i} y1={bullet_blocks[i]['y1']} overlaps block {i+1} "
            f"y0={bullet_blocks[i+1]['y0']}"
        )


def test_bullet_continuation_lines_stay_with_parent():
    """A wrapped bullet line must stay in the same TextBlock as its bullet."""
    buf = io.BytesIO()
    with fitz.open() as doc:
        page = doc.new_page(width=612, height=792)
        page.insert_text((72, 100), "- First bullet item", fontsize=10)
        page.insert_text((72, 114), "  continuation of first bullet", fontsize=10)
        page.insert_text((72, 128), "- Second bullet item", fontsize=10)
        doc.save(buf)
    pdf_bytes = buf.getvalue()
    blocks = extract_text_blocks(pdf_bytes)
    bullet_blocks = [b for b in blocks if "bullet" in b["text"]]
    # "First bullet item continuation of first bullet" should be one block
    first = next(b for b in bullet_blocks if "First" in b["text"])
    assert "continuation" in first["text"], (
        f"Continuation line not merged into first bullet: {first['text']!r}"
    )
