"""DOCX builder service — replaces text in-place to preserve all formatting."""

from __future__ import annotations

import io
from typing import Any

from docx import Document


def _replace_paragraph_text(paragraph, new_text: str) -> None:
    """
    Replace the visible text of a *paragraph* while preserving the
    formatting of the **first run**.

    Strategy:
      1. Put the full translated text into the first run.
      2. Clear every subsequent run's text (keeps XML structure intact
         so styles, numbering, etc. aren't broken).
    """
    runs = paragraph.runs
    if not runs:
        return

    runs[0].text = new_text
    for run in runs[1:]:
        run.text = ""


def build_translated_docx(
    original_bytes: bytes,
    translated_segments: list[dict[str, Any]],
) -> bytes:
    """
    Open the *original* DOCX, walk the same paragraphs / tables / headers
    that the parser visited, and swap in the translated text from
    *translated_segments*.

    Returns the new DOCX as raw bytes.
    """
    doc = Document(io.BytesIO(original_bytes))

    # Build a quick lookup:  segment-id  →  translated text
    lookup: dict[str, str] = {seg["id"]: seg["text"] for seg in translated_segments}

    seg_id = 0

    # ── Body paragraphs ─────────────────────────────────────────
    for para in doc.paragraphs:
        text = para.text.strip()
        if not text:
            continue
        key = f"body-{seg_id}"
        if key in lookup:
            _replace_paragraph_text(para, lookup[key])
        seg_id += 1

    # ── Tables ───────────────────────────────────────────────────
    for table_idx, table in enumerate(doc.tables):
        for row_idx, row in enumerate(table.rows):
            for col_idx, cell in enumerate(row.cells):
                cell_text = cell.text.strip()
                if not cell_text:
                    continue
                key = f"table-{table_idx}-{row_idx}-{col_idx}"
                if key in lookup:
                    # A cell can have multiple paragraphs — put all text
                    # in the first paragraph, clear the rest.
                    paras = cell.paragraphs
                    if paras:
                        _replace_paragraph_text(paras[0], lookup[key])
                        for p in paras[1:]:
                            _replace_paragraph_text(p, "")

    # ── Headers & Footers ────────────────────────────────────────
    hf_seg_id = seg_id  # continue from where body left off (parser did too)
    for section_idx, section in enumerate(doc.sections):
        for hf_type, hf in [("header", section.header), ("footer", section.footer)]:
            if not hf.is_linked_to_previous:
                for para in hf.paragraphs:
                    text = para.text.strip()
                    if not text:
                        continue
                    key = f"{hf_type}-{section_idx}-{hf_seg_id}"
                    if key in lookup:
                        _replace_paragraph_text(para, lookup[key])
                    hf_seg_id += 1

    # ── Write out ────────────────────────────────────────────────
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
