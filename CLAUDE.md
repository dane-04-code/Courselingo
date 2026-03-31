# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CourseLingo is a PDF/DOCX translation app for course creators (Kajabi, Teachable, Skool, etc.). It preserves original layout, fonts, and formatting while translating via DeepL. Users pay with a credit system where cost scales with document size.

## Dev Servers

**Frontend** (Next.js on port 3000):
```bash
cd frontend && npm run dev
```

**Backend** (FastAPI on port 8000):
```bash
cd backend
source .venv/Scripts/activate   # Windows: .venv\Scripts\activate
uvicorn main:app --reload
```

Health check: `http://127.0.0.1:8000/health`

## Testing

```bash
cd backend
source .venv/Scripts/activate
pytest                        # run all tests
pytest tests/test_pdf_builder.py   # single file
pytest -k test_map_font       # single test by name
```

Frontend lint:
```bash
cd frontend && npm run lint
```

## Environment Variables

Single `.env` file at project root. Required keys:
- `DEEPL_API_KEY` — DeepL REST API for translations
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase public anon key
- `NOTION_TOKEN` — Notion integration token for blog CMS
- `NOTION_BLOG_DATABASE_ID` — Notion database ID for blog posts
- `LEMONSQUEEZY_API_KEY` — payment processing (not yet implemented)

## Architecture

### Backend API Endpoints

- `GET /health` — liveness check
- `POST /estimate` — returns `{ char_count, credits_required }` without translating; used by frontend before charging
- `POST /translate` — full pipeline; returns translated file as download

**Credit cost tiers** (`_chars_to_credits` in `main.py`):
| Characters | Credits |
|-----------|---------|
| ≤ 20,000  | 1       |
| ≤ 60,000  | 2       |
| ≤ 120,000 | 4       |
| > 120,000 | 6       |

### Translation Pipeline (PDF)

1. `pdf_parser.py` — PyMuPDF extracts text blocks with bounding boxes + font metadata; widens x1 by 30%
2. `deepl.py` — single batch API call to DeepL for all text segments
3. `pdf_builder.py` — PyMuPDF redact+rewrite strategy: redacts original text area with white, then inserts translated text using PyMuPDF's `insert_textbox()`

**PDF font handling**: Maps PDF font names to PyMuPDF Base14 codes (helv/tiro/cour families). For non-Latin glyphs (bullets, accented chars), falls back to a Unicode TTF — looks for `C:/Windows/Fonts/arial.ttf` on Windows or DejaVuSans on Linux. Min font size 7pt; shrinks iteratively to fit bounding box.

### Translation Pipeline (DOCX)

1. `docx_parser.py` — walks paragraphs, tables, headers/footers; assigns unique segment IDs (`body-0`, `table-0-0-0`, etc.)
2. `deepl.py` — same batch call
3. `docx_builder.py` — uses python-docx; replaces text in first run of each paragraph (preserving formatting), clears subsequent runs

### Credits (Supabase)

- Credit deduction happens **on the frontend** via Supabase RPC `deduct_credit()` after the backend returns the translated file
- The RPC is atomic (row-lock) — do not add credit logic to the backend
- New users get 3 free credits via Supabase trigger `on_auth_user_created`
- Post-payment top-ups use `admin_grant_credits(user_id, amount, plan)` — service-role only, not callable by clients

## Key Gotchas

- **PDF coordinate systems**: Both pdf_parser and pdf_builder use PyMuPDF (top-left origin). No Y-axis flip is needed between them.
- **Font size shrinking**: If translated text overflows the original bounding box, font size iteratively shrinks to minimum 7pt. Each block is sized independently — no group normalisation.
- **CORS**: Backend allows all `localhost` ports via regex `r"http://localhost:\d+"`.
- **File limit**: 20 MB max, PDF and DOCX only (detected by content-type and extension).
- **Progress bar**: The translation progress modal in the frontend is fake/simulated — not real streaming from the backend.
- **DOCX formatting**: Only the first run's formatting is preserved per paragraph. Multi-run formatting (e.g., mid-sentence bold) is lost on translated paragraphs.

## Database Schema (Supabase)

- `user_credits` — balance per user (`credits_remaining`, `credits_used`), plan tier (free/starter/course_pack/full_bundle)
- `translation_history` — audit log of every translation job; written by `deduct_credit()` RPC, not the backend
- RLS is enabled — users can only access their own rows; all writes go through RPCs

Migrations live in `supabase/migrations/` and are applied in order (run in Supabase SQL editor or `supabase db push`).

## Frontend Routes

- `/` — marketing landing page
- `/login`, `/signup` — auth pages (redirect to `/translator` if already logged in)
- `/translator` — main translation workspace (auth-protected)
- `/blog` — blog listing, powered by Notion CMS
- `/blog/[slug]` — individual blog post rendered from Notion blocks
- `/api/newsletter` — newsletter subscription endpoint
- `/auth/callback` — Supabase OAuth callback handler

Auth-protected routes (`/translator/*`) enforced by `middleware.ts`.

## Frontend Conventions

- Use `"use client"` for any component with state or event handlers
- CSS theme variables: `--cream`, `--ink`, `--sage`, `--terracotta`, `--gold`, `--border` (defined in `globals.css`)
- Supabase browser client: `frontend/lib/supabase/client.ts`; server client: `server.ts`
- Blog data fetched server-side via `frontend/lib/notion.ts` (`getBlogPosts`, `getBlogPost`, `getPageBlocks`)
- Fonts: DM Sans (body), Fraunces (headings) via Google Fonts in `layout.tsx`
