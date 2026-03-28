# PDF Builder Rewrite — PyMuPDF Redact + Rewrite

**Date:** 2026-03-28
**Status:** Approved

## Problem

The current `pdf_builder.py` rebuilds PDFs from scratch using ReportLab on a blank canvas. This destroys all non-text content:
- Images (logos, diagrams, screenshots)
- Page backgrounds and colored fills
- Shapes, borders, decorative elements
- Text color (everything becomes black)

The result is a plain white page with black text — unusable for branded course materials.

## Goal

Preserve the original PDF's visual appearance (images, backgrounds, shapes, colors) while replacing only the text with translations.

## Scope

- Rewrite `backend/services/pdf_builder.py` only
- `pdf_parser.py`, `deepl.py`, `docx_parser.py`, `docx_builder.py`, `main.py` — no changes
- Public function signature unchanged: `build_translated_pdf(blocks, page_dims) -> bytes`

## Approach: PyMuPDF Redact + Rewrite

Open the original PDF, surgically erase original text areas, insert translated text in their place. Everything else (images, backgrounds, shapes) is never touched.

### Why not the alternatives

- **Background stamp** (render page as PNG + overlay text): rasterizes the PDF, no selectable text, large file size
- **Patch ReportLab builder** (re-extract and re-draw images): fixes images only, not backgrounds/colors/shapes — a half-measure

## Design

### Data flow

```
original_pdf_bytes  ──┐
                      ├──► build_translated_pdf(blocks, page_dims) ──► translated_pdf_bytes
translated blocks   ──┘
```

The function receives the same inputs as today. `main.py` passes `original_pdf_bytes` as a new parameter (already available in the request handler — it just wasn't forwarded before).

### Per-page algorithm

```
for each page:
  1. for each text block on this page:
       page.add_redact_annot(rect=block bbox, fill=(1,1,1))  # white box
  2. page.apply_redacts()           # erase original text, images untouched
  3. for each text block on this page:
       fit_size = shrink_to_fit(translated_text, original_font, original_size, bbox)
       page.insert_textbox(bbox, translated_text, fontsize=fit_size, fontname=font)
4. save to bytes
```

### Font resolution

1. Try the original embedded font name from the block (as returned by the parser)
2. If PyMuPDF raises on that name, fall back to `"helv"` (built-in Helvetica)
3. For text that contains non-Latin characters (detected by attempting `latin-1` encode), register and use Arial.ttf (Windows) or DejaVuSans.ttf (Linux) as a named font

### Font size fitting

Same logic as current builder:
- Start at original font size
- Word-wrap into bounding box width
- If wrapped height exceeds box height, shrink by 0.5pt
- Minimum font size: 7pt
- If still doesn't fit at 7pt, clip to max lines that fit

### Function signature change

`build_translated_pdf` gains one new required parameter:

```python
def build_translated_pdf(
    blocks: list[dict],
    page_dims: list[dict],
    original_pdf_bytes: bytes,       # NEW — needed to open the original
) -> bytes:
```

`main.py` already holds `original_pdf_bytes` (the uploaded file contents) and passes it through. This is the only external change.

## What Improves

| Issue | Before | After |
|---|---|---|
| Images | Dropped | Preserved |
| Backgrounds / colored fills | Dropped | Preserved |
| Shapes, borders, decorations | Dropped | Preserved |
| Text color | Always black | Preserved |
| Custom fonts (visual) | Falls back to Helvetica | Original font renders natively |

## What Stays the Same

- Font size shrinking for long translations
- Text wrapping within bounding box
- Unicode fallback font for non-Latin text
- 7pt minimum font size
- DOCX pipeline (unaffected)

## Out of Scope

- Scanned PDFs (no text layer) — not a concern, all user uploads are digitally created
- Mixed bold/italic within a single block — still flattened to dominant font (same as before)
- OCR

## Files Changed

| File | Change |
|---|---|
| `backend/services/pdf_builder.py` | Full rewrite |
| `backend/main.py` | Pass `original_pdf_bytes` to `build_translated_pdf` |
