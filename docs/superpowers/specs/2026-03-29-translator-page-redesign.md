# Translator Page Redesign — Design Spec

## Goal
Replace the current narrow single-column translator page with a split-workspace layout: left panel is the upload tool with credit balance, right panel is a scrollable metadata-only translation history.

## Layout

### Overall structure
Two-column split layout filling the full viewport height (no page scroll). Left panel is fixed width (~360px). Right panel fills remaining space and scrolls independently.

On mobile (< 768px): stacks vertically — left panel on top, history collapses to a compact strip below.

### Left panel (fixed)
Top to bottom:
1. **Credit balance card** — prominent green card showing `credits_remaining`, plan tier, and "Buy more →" link to `/#pricing`
2. **Section label + heading** — "✦ New translation" / "Translate your document"
3. **Language selector** — existing dropdown styled inline
4. **Upload box** — drag-and-drop, same logic as current page
5. **Credit cost estimate row** — shown after file is dropped: "This document will cost **2 credits**" (disabled/greyed if no file). Calls `/api/estimate` on file select.
6. **Translate button** — disabled until file selected; shows "Translate to French →" with selected language name

### Right panel (scrollable)
- **Header**: "Translation history" + total count (e.g. "8 documents translated")
- **Scrollable list**: one compact row per translation, newest first
- **Empty state**: "No translations yet — drop your first file to get started."

### History row structure (compact)
Each row shows:
- File type icon (📄 PDF / 📝 DOCX)
- Filename (truncated with ellipsis if long)
- Language flag + name · credits used · date
- "Translate again →" button — clicking pre-fills the language selector on the left with that row's language

No download button. Files are not stored.

### During translation
Right panel temporarily replaces history list with the progress steps view (same 5 steps as current page). On completion, switches back to history with the new row inserted at the top. No modal popup needed.

---

## Data

### Reading history
Fetch from Supabase `translation_history` table on page load:
```sql
select id, filename, target_lang, credits_deducted, created_at
from translation_history
where user_id = auth.uid()
order by created_at desc
limit 50
```
This is already covered by the existing RLS policy (`owner_select_history`).

### Writing history
No change needed — `deduct_credit()` RPC already inserts a row into `translation_history` after each successful translation.

### Credit balance
Fetch from `user_credits` on page load. Re-fetch after each successful translation to update the balance card.

---

## Files to Modify

- `frontend/app/translator/page.tsx` — full rewrite of render section; logic (handleTranslate, handleFile, etc.) unchanged
- `frontend/app/globals.css` — add split layout CSS classes

---

## Not in scope
- File storage or re-download
- Pagination of history (limit 50, scrollable)
- Filtering/searching history
- Deleting history items
