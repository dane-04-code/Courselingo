# Bullet-Split Parser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix bullet-point bleeding in translated PDFs by splitting multi-bullet paragraph groups into one `TextBlock` per bullet item in the parser, so each bullet is translated and rendered independently within its own bounding box.

**Architecture:** Currently, the parser's paragraph break detection (1.5× median spacing) doesn't split bullet items that have uniform inter-item spacing. All bullets in one PyMuPDF raw block end up as a single `TextBlock` joined with `\n`. We add `_split_bullet_items()` — a pure function that takes a list of lines and returns per-bullet sub-groups. The main `extract_text_blocks` loop calls it inside the existing `para_groups` loop, emitting one `TextBlock` per bullet instead of one per paragraph group. The joining logic simplifies: since each bullet is now its own block, all lines within a bullet group are continuations (joined with space, never `\n`).

**Tech Stack:** Python, PyMuPDF (`fitz`), pytest, `re` (already imported)

---

### Task 1: Write failing tests for `_split_bullet_items`

**Files:**
- Create: `backend/tests/test_pdf_parser.py`

- [ ] **Step 1: Create the test file**

```python
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
```

- [ ] **Step 2: Run the tests to confirm they all fail**

```bash
cd backend && source .venv/Scripts/activate && python -m pytest tests/test_pdf_parser.py -v
```

Expected: `ImportError: cannot import name '_split_bullet_items' from 'services.pdf_parser'`

---

### Task 2: Implement `_split_bullet_items` in the parser

**Files:**
- Modify: `backend/services/pdf_parser.py`

- [ ] **Step 1: Add `_split_bullet_items` after `_dominant_font`**

Insert this function between `_dominant_font` and `extract_text_blocks`:

```python
def _split_bullet_items(
    line_data: list[tuple[str, tuple, list]],
) -> list[list[tuple[str, tuple, list]]]:
    """Split a list of lines into per-bullet-item sub-groups.

    Lines that match _LIST_ITEM_RE begin a new group.  Continuation lines
    (no bullet marker) are appended to the current group.  Non-bullet lines
    that appear before the first bullet become their own single-line group.
    If no bullet markers are found, the original list is returned as-is
    (one group) to preserve existing behaviour for plain paragraphs.
    """
    if not line_data:
        return []

    has_bullets = any(_LIST_ITEM_RE.match(lt) for lt, _, _ in line_data)
    if not has_bullets:
        return [line_data]

    groups: list[list[tuple[str, tuple, list]]] = []
    current: list[tuple[str, tuple, list]] = []

    for line in line_data:
        lt, bbox, spans = line
        if _LIST_ITEM_RE.match(lt):
            if current:
                groups.append(current)
            current = [line]
        else:
            if current:
                current.append(line)
            else:
                # Non-bullet line before any bullet item
                groups.append([line])
    if current:
        groups.append(current)

    return groups
```

- [ ] **Step 2: Run the unit tests — they should all pass now**

```bash
cd backend && source .venv/Scripts/activate && python -m pytest tests/test_pdf_parser.py -v
```

Expected: 8 passed

- [ ] **Step 3: Commit**

```bash
git add backend/services/pdf_parser.py backend/tests/test_pdf_parser.py
git commit -m "feat: add _split_bullet_items to pdf parser"
```

---

### Task 3: Wire `_split_bullet_items` into `extract_text_blocks`

**Files:**
- Modify: `backend/services/pdf_parser.py`

- [ ] **Step 1: Replace the inner emit loop**

Find this block inside `extract_text_blocks` (the `# ── Emit one TextBlock per paragraph group ──` section):

```python
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
```

Replace it with:

```python
            # ── Emit one TextBlock per paragraph group ────────────────
            # Each paragraph group is further split into per-bullet-item
            # sub-groups so that multi-bullet blocks don't bleed across
            # item boundaries when the translated text wraps differently.
            for group in para_groups:
                for bullet_group in _split_bullet_items(group):
                    # All lines after the first are continuations —
                    # join with space (no \n needed; each bullet is its
                    # own TextBlock now).
                    parts = [bullet_group[0][0]]
                    for lt, _, _ in bullet_group[1:]:
                        parts.append(" " + lt)
                    full_text = "".join(parts).strip()
                    if not full_text:
                        continue

                    all_spans = [span for _, _, spans in bullet_group for span in spans]
                    font_name, font_size = _dominant_font(all_spans)

                    # Use actual line y-coordinates — not equal slices.
                    group_y0 = bullet_group[0][1][1]   # top of first line
                    group_y1 = bullet_group[-1][1][3]  # bottom of last line

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
```

- [ ] **Step 2: Run all existing tests**

```bash
cd backend && source .venv/Scripts/activate && python -m pytest -v
```

Expected: all tests pass (parser + builder)

- [ ] **Step 3: Commit**

```bash
git add backend/services/pdf_parser.py
git commit -m "feat: split multi-bullet blocks into per-bullet TextBlocks in parser"
```

---

### Task 4: Integration test — bullets extracted as separate blocks

**Files:**
- Modify: `backend/tests/test_pdf_parser.py`

- [ ] **Step 1: Add integration test using a real PDF with bullet points**

Append to `backend/tests/test_pdf_parser.py`:

```python
# ── Integration tests using real PDFs ────────────────────────────────

import io
import fitz
from services.pdf_parser import extract_text_blocks


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
            "• First bullet item with some text",
            "• Second bullet item with some text",
            "• Third bullet item with some text",
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

    bullet_blocks = [b for b in blocks if b["text"].startswith("•")]
    assert len(bullet_blocks) == 3, (
        f"Expected 3 separate bullet TextBlocks, got {len(bullet_blocks)}: "
        + str([b['text'][:40] for b in bullet_blocks])
    )


def test_bullet_blocks_have_distinct_y_ranges():
    """Each bullet block must occupy a distinct vertical slice."""
    pdf_bytes = _make_bullet_pdf()
    blocks = extract_text_blocks(pdf_bytes)
    bullet_blocks = sorted(
        [b for b in blocks if b["text"].startswith("•")],
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
        # Narrow column forces wrapping — but we simulate with two close lines
        page.insert_text((72, 100), "• First bullet item", fontsize=10)
        page.insert_text((72, 114), "  continuation of first bullet", fontsize=10)
        page.insert_text((72, 128), "• Second bullet item", fontsize=10)
        doc.save(buf)
    pdf_bytes = buf.getvalue()
    blocks = extract_text_blocks(pdf_bytes)
    bullet_blocks = [b for b in blocks if "bullet" in b["text"]]
    # "First bullet item continuation of first bullet" should be one block
    first = next(b for b in bullet_blocks if "First" in b["text"])
    assert "continuation" in first["text"], (
        f"Continuation line not merged into first bullet: {first['text']!r}"
    )
```

- [ ] **Step 2: Run all tests**

```bash
cd backend && source .venv/Scripts/activate && python -m pytest -v
```

Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_pdf_parser.py
git commit -m "test: integration tests for per-bullet TextBlock extraction"
```
