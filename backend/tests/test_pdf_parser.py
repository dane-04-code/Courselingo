"""Tests for pdf_parser bullet-splitting logic."""

import pytest
from services.pdf_parser import _split_bullet_items


def _line(text: str, y0: float = 0.0, y1: float = 12.0):
    """Minimal (text, bbox, spans) tuple for testing."""
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


def test_empty_input_returns_empty():
    result = _split_bullet_items([])
    assert result == []
