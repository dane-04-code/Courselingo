# Stripe Payments & Page-Based Credit System — Design Spec

**Date:** 2026-03-31
**Status:** Approved

---

## Overview

Wire up Stripe Checkout for one-time credit pack purchases, switch credit pricing from character-count to page-count tiers, add a free-tier watermark to PDF output, and enforce a 300-page hard cap.

---

## 1. Credit Tier Logic (Backend)

### Page-Based Tiers

Replace `_chars_to_credits` in `backend/main.py` with `_pages_to_credits`:

| Pages | Credits |
|-------|---------|
| 1–25 | 1 |
| 26–75 | 2 |
| 76–150 | 3 |
| 151–300 | 4 |
| 300+ | **Rejected — HTTP 400** |

### Hard Cap

Documents over 300 pages are rejected at both `/estimate` and `/translate` with:
```
{ "detail": "Document exceeds the 300-page limit. Please split your document and translate in parts." }
```

### Page Count for PDF

PyMuPDF's `doc.page_count` gives exact page count. Already available via `get_page_dimensions()` which returns one entry per page.

### Page Count for DOCX

DOCX has no native page count. Use paragraph count as a proxy: estimate pages as `max(1, paragraph_count // 20)`. This is a rough approximation — acceptable for MVP since DOCX translations are less common and the estimate is conservative.

### `/estimate` Response Changes

Add `page_count` to the response:
```json
{
  "char_count": 12400,
  "page_count": 18,
  "credits_required": 1
}
```

---

## 2. Watermark (Backend — PDF Only)

### When Applied

The frontend passes `watermark=true` as a form field on `POST /translate`. The backend adds the badge when this flag is truthy. DOCX files are never watermarked.

### Frontend Logic

Before calling `/translate`, the frontend reads `user_credits.plan` from Supabase:
- `plan = 'free'` → `watermark=true`
- Any other plan → `watermark=false`

### Rendering (PyMuPDF)

In `pdf_builder.py`, after all text has been written to a page, if `watermark=True`:

- Draw a small filled rounded rectangle in the **bottom-right corner** of each page
  - Width: ~180pt, Height: ~18pt, Corner radius: 4pt
  - Position: 10pt from right edge, 8pt from bottom edge
  - Fill colour: light grey (`#EEEEEE`), stroke: none
- Render "Translated by CourseLingo" inside the rectangle
  - Font: Helvetica, size: 7pt, colour: mid-grey (`#888888`)
  - Left-padded 6pt inside the rectangle

The badge is drawn on every page of the output PDF.

---

## 3. Stripe Checkout Flow

### Credit Packs

| Plan Key | Credits | Price (GBP) |
|----------|---------|-------------|
| `single` | 1 | £12 |
| `starter` | 3 | £32 |
| `course_pack` | 7 | £69 |
| `full_bundle` | 15 | £129 |

> Prices are configured in the Stripe dashboard. The backend stores only plan keys and credit amounts — never prices.

### Flow

```
Landing page buy button
  → POST /api/checkout  { plan: "starter" }
    → Auth check (redirect to /signup if not logged in)
    → Create Stripe Checkout Session (mode: payment)
      → metadata: { user_id, plan, credits }
      → success_url: /payment/success?session_id={CHECKOUT_SESSION_ID}
      → cancel_url: /payment/cancel
    → Return { url: "https://checkout.stripe.com/..." }
  → window.location.href = url

Stripe hosted checkout
  → User completes payment
  → Redirect to /payment/success?session_id=cs_...

/payment/success page
  → GET /api/checkout/verify?session_id=cs_...
    → Confirm session.payment_status === "paid"
    → Idempotency check: select from stripe_payments where stripe_session_id = ?
    → If not fulfilled: call admin_grant_credits RPC, insert stripe_payments row
    → Return { plan, credits_granted, credits_remaining }
  → Show confirmation UI with updated balance
  → Link to /translator

Stripe webhook (backup path)
  → POST /api/webhooks/stripe
    → Verify signature (STRIPE_WEBHOOK_SECRET)
    → Handle checkout.session.completed
    → Same idempotency check + fulfillment as verify route
    → Returns 200 always (Stripe retries on non-2xx)
```

### New Files

- `frontend/app/api/checkout/route.ts` — creates Checkout Session
- `frontend/app/api/checkout/verify/route.ts` — verifies + fulfills payment
- `frontend/app/api/webhooks/stripe/route.ts` — webhook handler
- `frontend/app/payment/success/page.tsx` — confirmation page
- `frontend/app/payment/cancel/page.tsx` — cancellation page
- `frontend/lib/supabase/service.ts` — service-role Supabase client (bypasses RLS)

### Modified Files

- `frontend/app/page.tsx` — wire pricing buttons to `/api/checkout`
- `frontend/app/translator/page.tsx` — pass `watermark` flag, deduct variable credits, show page count, enforce credit guard

---

## 4. Supabase Changes

### Free Tier Credits: 3 → 1

Update `handle_new_user` in migration 004 to seed 1 credit instead of 3.

### Updated `deduct_credit` RPC

Add `p_amount integer default 1` parameter so the translator can deduct 1–4 credits based on page count. Backwards compatible — existing callers that pass no amount still deduct 1.

### New `stripe_payments` Table

One row per fulfilled Stripe session. `stripe_session_id` is `UNIQUE` — prevents double-fulfillment if both the verify route and webhook fire.

```sql
create table public.stripe_payments (
  id                uuid        primary key default gen_random_uuid(),
  stripe_session_id text        unique not null,
  user_id           uuid        not null references auth.users(id),
  plan              text        not null,
  credits_granted   integer     not null,
  fulfilled_at      timestamptz not null default now()
);
```

### Plan Values

`free` | `single` | `starter` | `course_pack` | `full_bundle`

---

## 5. Environment Variables

### Vercel (frontend)

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_SINGLE=price_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_COURSE_PACK=price_...
STRIPE_PRICE_FULL_BUNDLE=price_...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### Already Present

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NOTION_TOKEN`, `NOTION_BLOG_DATABASE_ID`

---

## 6. What Is Not In Scope (MVP)

- Subscription/recurring billing — one-time purchases only
- DOCX watermarking
- Refunds (handled manually via Stripe dashboard)
- XL tier (300+ pages)
- Email receipt beyond Stripe's default
