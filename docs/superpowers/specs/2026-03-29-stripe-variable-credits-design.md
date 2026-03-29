# Stripe Payments + Variable Credit System — Design Spec

## Goal
Integrate Stripe Checkout for one-time credit purchases and replace the hardcoded 1-credit deduction with a variable system where larger documents cost more credits.

## Architecture

### Credit Tiers (by character count)
Character count is measured by the backend before translation begins.

| Tier   | Characters       | Credits | Approx pages |
|--------|-----------------|---------|--------------|
| Small  | ≤ 20,000        | 1       | ~1–15        |
| Medium | ≤ 60,000        | 2       | ~15–40       |
| Large  | ≤ 120,000       | 4       | ~40–80       |
| XL     | > 120,000       | 6       | 80+          |

### Credit Packs (prices TBD)
| Pack        | Credits | Stripe plan key  |
|-------------|---------|-----------------|
| Starter     | 3       | `starter`        |
| Course Pack | 15      | `course_pack`    |
| Pro Pack    | 40      | `pro_pack`       |

`pro_pack` replaces the old "Full Bundle / unlimited" tier. No unlimited plan exists.

### Payment Flow
1. User clicks a pricing button on the landing page
2. If not logged in → redirect to `/signup?next=/pricing` — after signup, redirect back to pricing
3. Frontend calls `POST /api/checkout` with `{ plan: 'starter' | 'course_pack' | 'pro_pack' }`
4. API route creates a Stripe Checkout Session (one-time payment, correct Price ID from env)
5. User redirected to Stripe-hosted checkout
6. On success → Stripe redirects to `/payment/success?session_id=xxx`
7. Success page calls `GET /api/checkout/verify?session_id=xxx`
8. Verify route: fetches session from Stripe, confirms `payment_status === 'paid'`, calls Supabase `admin_grant_credits(user_id, amount, plan)` via service-role key
9. Stripe webhook at `POST /api/webhooks/stripe` handles `checkout.session.completed` as backup — same fulfillment, idempotent via `stripe_session_id` dedup column

### Translation Flow (with variable credits)
1. User drops a file on the translator page
2. Frontend calls `POST /api/estimate` with the file — backend returns `{ char_count, credits_required }`
3. Frontend fetches user's `credits_remaining` from Supabase
4. UI shows: "This document will cost **2 credits** · You have **15 remaining**"
5. If insufficient credits → show "You need X more credits" with a link to pricing
6. User clicks Translate → frontend sends file to backend `/translate`
7. On success → frontend calls `deduct_credit(user_id, ..., p_amount: credits_required)`
8. File downloads

---

## Files to Create / Modify

### New files
- `frontend/app/api/checkout/route.ts` — creates Stripe Checkout Session
- `frontend/app/api/checkout/verify/route.ts` — verifies payment, calls admin_grant_credits
- `frontend/app/api/webhooks/stripe/route.ts` — handles checkout.session.completed webhook
- `frontend/app/api/estimate/route.ts` — proxies file to backend /estimate, returns credit cost
- `frontend/app/payment/success/page.tsx` — confirmation page
- `frontend/app/payment/cancel/page.tsx` — cancel page
- `supabase/migrations/002_variable_credits.sql` — updated deduct_credit RPC + stripe_payments table

### Modified files
- `frontend/app/page.tsx` — wire up pricing buttons (auth check + call /api/checkout)
- `frontend/app/translator/page.tsx` — add estimate call, credit cost display, variable deduction
- `frontend/.env.local` — add Stripe keys and Price IDs
- `backend/main.py` — add `POST /estimate` endpoint
- `CLAUDE.md` — update credit cost section

---

## Supabase Migration (002)

### Update deduct_credit to accept variable amount
The existing `deduct_credit()` RPC hardcodes `v_credits_per_translation = 1`. Add a `p_amount integer default 1` parameter and use it throughout.

### Add stripe_payments table (idempotency)
```sql
create table public.stripe_payments (
  id                 uuid primary key default gen_random_uuid(),
  stripe_session_id  text unique not null,
  user_id            uuid not null references auth.users(id),
  plan               text not null,
  credits_granted    integer not null,
  fulfilled_at       timestamptz not null default now()
);
```
Webhook checks for existing `stripe_session_id` before granting credits — prevents double-fulfillment if both the redirect verify and the webhook fire.

---

## Backend: /estimate endpoint
`POST /estimate` — accepts same multipart form as `/translate` (file field only, no target_lang needed).

Returns:
```json
{ "char_count": 18432, "credits_required": 1 }
```

Character count logic (same as existing parsers):
- PDF: sum of all text block character lengths from PyMuPDF
- DOCX: sum of all paragraph/table/header run text lengths

Credit tier logic (shared constant, also used in translator page):
```python
def chars_to_credits(n: int) -> int:
    if n <= 20_000:  return 1
    if n <= 60_000:  return 2
    if n <= 120_000: return 4
    return 6
```

---

## Frontend: Checkout API route
`POST /api/checkout`

- Requires authenticated session (returns 401 if not logged in)
- Maps plan → Stripe Price ID from env vars
- Creates `checkout.Session` with:
  - `mode: 'payment'`
  - `success_url: /payment/success?session_id={CHECKOUT_SESSION_ID}`
  - `cancel_url: /payment/cancel`
  - `metadata: { user_id, plan }`
- Returns `{ url }` — frontend redirects

---

## Frontend: Verify API route
`GET /api/checkout/verify?session_id=xxx`

- Retrieves session from Stripe
- Confirms `payment_status === 'paid'`
- Checks `stripe_payments` for existing `stripe_session_id` (idempotency)
- If not fulfilled: calls `admin_grant_credits`, inserts into `stripe_payments`
- Returns `{ plan, credits_granted, credits_remaining }`

---

## Frontend: Webhook route
`POST /api/webhooks/stripe`

- Verifies `stripe-signature` header with `STRIPE_WEBHOOK_SECRET`
- Handles `checkout.session.completed` only
- Same fulfillment logic as verify route (idempotent)
- Returns 200 immediately (Stripe requires fast response)

---

## Environment Variables to Add
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_COURSE_PACK=price_...
STRIPE_PRICE_PRO_PACK=price_...
```

---

## Error Handling
- Checkout: plan not found → 400
- Verify: session not paid → show "payment pending" message, don't grant credits
- Verify: already fulfilled → return existing credits_remaining (idempotent, no error)
- Webhook: invalid signature → 400
- Estimate: unsupported file type → 400 (same validation as /translate)
- Insufficient credits: shown in UI before user can click Translate — never hits backend

---

## Not in scope
- Refunds (handled manually in Stripe dashboard)
- Subscription/recurring billing
- Invoice emails (Stripe sends these automatically)
- Admin dashboard for credits
