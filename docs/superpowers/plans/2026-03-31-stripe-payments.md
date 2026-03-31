# Stripe Payments & Page-Based Credit System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up Stripe Checkout for one-time credit pack purchases, switch credit pricing from character-count to page-count tiers, add a free-tier PDF watermark, and enforce a 300-page hard cap.

**Architecture:** Four credit packs (1/3/7/15 credits) purchased via Stripe Checkout hosted page; webhook + verify route provide idempotent fulfillment via `admin_grant_credits` Supabase RPC. Backend gains page-based credit tiers and a PyMuPDF watermark badge drawn on free-tier PDF output. Frontend translator reads user plan from Supabase to decide whether to send `watermark=true`.

**Tech Stack:** Stripe Node.js SDK, Next.js 14 App Router API routes, Supabase service-role client, PyMuPDF (fitz), FastAPI Form fields, pytest.

---

## File Map

**Create:**
- `frontend/app/api/checkout/route.ts` — creates Stripe Checkout Session
- `frontend/app/api/checkout/verify/route.ts` — verifies payment + grants credits (idempotent)
- `frontend/app/api/webhooks/stripe/route.ts` — backup fulfillment via Stripe webhook
- `frontend/app/payment/success/page.tsx` — post-payment confirmation page
- `frontend/app/payment/cancel/page.tsx` — abandoned checkout page
- `frontend/lib/supabase/service.ts` — service-role Supabase client (bypasses RLS)
- `supabase/migrations/004_stripe_and_page_credits.sql` — free credits 1, variable deduct_credit, stripe_payments table

**Modify:**
- `backend/main.py` — replace `_chars_to_credits` with `_pages_to_credits`, update `/estimate` response, add 300-page cap, add `watermark` form field to `/translate`, update CORS for production
- `backend/services/pdf_builder.py` — add `_add_watermark_badge`, update `build_translated_pdf` signature
- `backend/tests/test_pdf_builder.py` — add watermark tests
- `frontend/app/page.tsx` — update pricing cards (prices/credits/plan keys), add checkout handler, wire buttons
- `frontend/app/translator/page.tsx` — show page count, pass `watermark` flag, deduct variable credits, add credit guard

---

## Task 1: Backend — Page-based credit tiers + hard cap + page count in /estimate

**Files:**
- Modify: `backend/main.py`
- Test: `backend/tests/test_main.py` (create if not exists)

- [ ] **Step 1: Write failing tests for `_pages_to_credits`**

Create `backend/tests/test_main.py`:

```python
"""Tests for main.py helper functions."""
import pytest
from main import _pages_to_credits


def test_pages_to_credits_tier_1():
    assert _pages_to_credits(1) == 1
    assert _pages_to_credits(25) == 1


def test_pages_to_credits_tier_2():
    assert _pages_to_credits(26) == 2
    assert _pages_to_credits(75) == 2


def test_pages_to_credits_tier_3():
    assert _pages_to_credits(76) == 3
    assert _pages_to_credits(150) == 3


def test_pages_to_credits_tier_4():
    assert _pages_to_credits(151) == 4
    assert _pages_to_credits(300) == 4


def test_pages_to_credits_over_limit_raises():
    with pytest.raises(ValueError, match="300-page"):
        _pages_to_credits(301)
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && source .venv/Scripts/activate
pytest tests/test_main.py -v
```
Expected: `ModuleNotFoundError` or `ImportError` — `_pages_to_credits` doesn't exist yet.

- [ ] **Step 3: Replace `_chars_to_credits` with `_pages_to_credits` in `backend/main.py`**

Find and replace the existing `_chars_to_credits` function (lines ~122-127):

```python
def _pages_to_credits(n: int) -> int:
    """Map page count to credit cost. Raises ValueError if over 300-page cap."""
    if n > 300:
        raise ValueError("Document exceeds the 300-page limit.")
    if n <= 25:  return 1
    if n <= 75:  return 2
    if n <= 150: return 3
    return 4
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pytest tests/test_main.py -v
```
Expected: 5 tests pass.

- [ ] **Step 5: Update `/estimate` to use page count**

Replace the entire `/estimate` endpoint in `backend/main.py`:

```python
@app.post("/estimate")
async def estimate_characters(file: UploadFile = File(...)):
    """Return page count, character count, and credit cost without translating."""
    content = await file.read()

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds 20 MB limit.")

    name = (file.filename or "").lower()

    if name.endswith(".pdf"):
        try:
            doc = fitz.open(stream=content, filetype="pdf")
            page_count = doc.page_count
            doc.close()
            blocks = extract_text_blocks(content)
            total_chars = sum(len(b["text"]) for b in blocks)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Failed to read PDF: {exc}")

    elif name.endswith(".docx"):
        try:
            segs = extract_text_segments(content)
            total_chars = sum(len(s["text"]) for s in segs)
            # DOCX has no native page count — estimate from paragraph count
            page_count = max(1, len(segs) // 20)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Failed to read DOCX: {exc}")

    else:
        raise HTTPException(status_code=400, detail="Only PDF and DOCX files are supported.")

    try:
        credits = _pages_to_credits(page_count)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {
        "char_count": total_chars,
        "page_count": page_count,
        "credits_required": credits,
    }
```

Also add `import fitz` at the top of `main.py` (after the existing imports):

```python
import fitz  # PyMuPDF — used for page count in /estimate
```

- [ ] **Step 6: Add 300-page hard cap to `/translate`**

In `backend/main.py`, inside the `/translate` endpoint, after file bytes are read and the file type is determined (after `if len(file_bytes) > MAX_FILE_SIZE` check), add:

```python
    # 4) Enforce 300-page cap for PDFs
    if is_pdf:
        try:
            _doc = fitz.open(stream=file_bytes, filetype="pdf")
            _page_count = _doc.page_count
            _doc.close()
            _pages_to_credits(_page_count)  # raises ValueError if > 300
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
```

- [ ] **Step 7: Run all backend tests**

```bash
pytest -v
```
Expected: 31+ tests pass (26 existing + 5 new).

- [ ] **Step 8: Commit**

```bash
git add backend/main.py backend/tests/test_main.py
git commit -m "feat: page-based credit tiers, 300-page cap, page_count in /estimate"
```

---

## Task 2: Backend — Watermark badge in pdf_builder

**Files:**
- Modify: `backend/services/pdf_builder.py`
- Modify: `backend/tests/test_pdf_builder.py`

- [ ] **Step 1: Write failing test for watermark**

In `backend/tests/test_pdf_builder.py`, add at the bottom:

```python
def test_build_translated_pdf_watermark_does_not_crash():
    """Watermark=True should produce a valid PDF without raising."""
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
    # Verify it is a valid PDF
    doc = fitz.open(stream=result, filetype="pdf")
    assert doc.page_count == 1
    doc.close()


def test_build_translated_pdf_no_watermark_by_default():
    """watermark defaults to False — existing call signature still works."""
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
    # Old 3-arg call still works
    result = build_translated_pdf(blocks, page_dims, pdf_bytes)
    assert isinstance(result, bytes)
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pytest tests/test_pdf_builder.py::test_build_translated_pdf_watermark_does_not_crash tests/test_pdf_builder.py::test_build_translated_pdf_no_watermark_by_default -v
```
Expected: `TypeError` — `build_translated_pdf` doesn't accept `watermark` kwarg yet.

- [ ] **Step 3: Add `_add_watermark_badge` to `pdf_builder.py`**

Add this function just before `build_translated_pdf` in `backend/services/pdf_builder.py`:

```python
def _add_watermark_badge(page: fitz.Page) -> None:
    """Draw a small 'Translated by CourseLingo' badge in the bottom-right corner.

    Renders a light grey filled rounded rectangle with grey text.
    Called on every page when the free-tier watermark is requested.
    """
    badge_w = 180.0
    badge_h = 18.0
    margin_right = 10.0
    margin_bottom = 8.0

    pw = page.rect.width
    ph = page.rect.height

    x0 = pw - badge_w - margin_right
    y0 = ph - badge_h - margin_bottom
    x1 = pw - margin_right
    y1 = ph - margin_bottom

    badge_rect = fitz.Rect(x0, y0, x1, y1)

    # Filled grey rectangle (no border)
    page.draw_rect(badge_rect, color=None, fill=(0.93, 0.93, 0.93))

    # Text inside — left-padded 6pt
    text_rect = fitz.Rect(x0 + 6, y0, x1, y1)
    page.insert_textbox(
        text_rect,
        "Translated by CourseLingo",
        fontsize=7.0,
        fontname="helv",
        color=(0.53, 0.53, 0.53),
        align=0,  # left-align
    )
```

- [ ] **Step 4: Update `build_translated_pdf` signature**

Change the function signature from:

```python
def build_translated_pdf(
    blocks: list[dict[str, Any]],
    page_dims: list[dict[str, float]],
    original_pdf_bytes: bytes,
) -> bytes:
```

to:

```python
def build_translated_pdf(
    blocks: list[dict[str, Any]],
    page_dims: list[dict[str, float]],
    original_pdf_bytes: bytes,
    watermark: bool = False,
) -> bytes:
```

- [ ] **Step 5: Call `_add_watermark_badge` in `build_translated_pdf`**

In `build_translated_pdf`, replace the final `buf = io.BytesIO()` block (currently lines ~334-338) with:

```python
    # ── Watermark badge (free tier) ──────────────────────────────────────
    if watermark:
        for page_idx in range(len(doc)):
            _add_watermark_badge(doc[page_idx])

    buf = io.BytesIO()
    doc.save(buf)
    doc.close()

    return buf.getvalue()
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
pytest tests/test_pdf_builder.py -v
```
Expected: 16 tests pass (14 existing + 2 new).

- [ ] **Step 7: Commit**

```bash
git add backend/services/pdf_builder.py backend/tests/test_pdf_builder.py
git commit -m "feat: add watermark badge to pdf_builder for free tier"
```

---

## Task 3: Backend — Wire watermark flag into /translate + update CORS

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Add `watermark` form field to `/translate`**

In `backend/main.py`, update the `/translate` function signature. Find:

```python
async def translate_document(
    file: Annotated[UploadFile, File(description="PDF or DOCX file to translate")],
    target_lang: Annotated[
        str,
        Form(description="Target language code (e.g. DE, FR, ES, EN-US)"),
    ] = "EN-US",
) -> Response:
```

Replace with:

```python
async def translate_document(
    file: Annotated[UploadFile, File(description="PDF or DOCX file to translate")],
    target_lang: Annotated[
        str,
        Form(description="Target language code (e.g. DE, FR, ES, EN-US)"),
    ] = "EN-US",
    watermark: Annotated[
        bool,
        Form(description="If true, add a CourseLingo watermark badge to PDF output"),
    ] = False,
) -> Response:
```

- [ ] **Step 2: Pass `watermark` into `_handle_pdf`**

In the same `/translate` function, find:

```python
    if is_docx:
        output_bytes, out_ext, media = _handle_docx(file_bytes, target_lang, api_key)
    else:
        output_bytes, out_ext, media = _handle_pdf(file_bytes, target_lang, api_key)
```

Replace with:

```python
    if is_docx:
        output_bytes, out_ext, media = _handle_docx(file_bytes, target_lang, api_key)
    else:
        output_bytes, out_ext, media = _handle_pdf(file_bytes, target_lang, api_key, watermark=watermark)
```

- [ ] **Step 3: Update `_handle_pdf` to accept and pass `watermark`**

Find the `_handle_pdf` function signature:

```python
def _handle_pdf(
    file_bytes: bytes, target_lang: str, api_key: str
) -> tuple[bytes, str, str]:
```

Replace with:

```python
def _handle_pdf(
    file_bytes: bytes, target_lang: str, api_key: str, watermark: bool = False
) -> tuple[bytes, str, str]:
```

And in `_handle_pdf`, find:

```python
        output = build_translated_pdf(translated_blocks, page_dims, file_bytes)
```

Replace with:

```python
        output = build_translated_pdf(translated_blocks, page_dims, file_bytes, watermark=watermark)
```

- [ ] **Step 4: Add production domain to CORS**

In `backend/main.py`, find the `CORSMiddleware` block:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:3002", "http://localhost:3003"],
    allow_origin_regex=r"http://localhost:\d+",
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)
```

Replace with:

```python
_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:3003",
]
_PRODUCTION_ORIGIN = os.getenv("FRONTEND_ORIGIN", "")
if _PRODUCTION_ORIGIN:
    _CORS_ORIGINS.append(_PRODUCTION_ORIGIN)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_origin_regex=r"http://localhost:\d+",
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)
```

Then add `FRONTEND_ORIGIN=https://your-vercel-domain.com` to Render's environment variables (after deployment).

- [ ] **Step 5: Run all backend tests**

```bash
pytest -v
```
Expected: 31 tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/main.py
git commit -m "feat: watermark form field in /translate, production CORS support"
```

---

## Task 4: Supabase Migration 004

**Files:**
- Create: `supabase/migrations/004_stripe_and_page_credits.sql`

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/004_stripe_and_page_credits.sql`:

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- CourseLingo — Migration 004
-- 1. Free tier: seed 1 credit on signup (was 3)
-- 2. deduct_credit: add p_amount parameter for variable deductions
-- 3. stripe_payments: idempotency table for Stripe fulfillment
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. FREE TIER: 1 CREDIT ON SIGNUP ────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.user_credits (user_id, credits_remaining, plan)
  values (new.id, 1, 'free')
  on conflict (user_id) do nothing;
  return new;
end;
$$;


-- ── 2. UPDATED deduct_credit — variable p_amount ─────────────────────────────
-- Default 1 preserves backwards compatibility for any existing callers.

create or replace function public.deduct_credit(
  p_user_id         uuid,
  p_filename        text,
  p_output_filename text,
  p_target_lang     text,
  p_file_size_bytes integer default null,
  p_amount          integer default 1
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_remaining integer;
begin
  if auth.uid() is distinct from p_user_id then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  select credits_remaining
  into   v_remaining
  from   public.user_credits
  where  user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'no_account');
  end if;

  if v_remaining < p_amount then
    return jsonb_build_object('success', false, 'error', 'no_credits');
  end if;

  update public.user_credits
  set
    credits_remaining = credits_remaining - p_amount,
    credits_used      = credits_used      + p_amount
  where user_id = p_user_id;

  insert into public.translation_history
    (user_id, filename, output_filename, target_lang, file_size_bytes, credits_deducted, status)
  values
    (p_user_id, p_filename, p_output_filename, p_target_lang, p_file_size_bytes, p_amount, 'completed');

  return jsonb_build_object(
    'success',           true,
    'credits_remaining', v_remaining - p_amount
  );
end;
$$;


-- ── 3. stripe_payments TABLE ─────────────────────────────────────────────────

create table if not exists public.stripe_payments (
  id                uuid        primary key default gen_random_uuid(),
  stripe_session_id text        unique not null,
  user_id           uuid        not null references auth.users(id),
  plan              text        not null,
  credits_granted   integer     not null,
  fulfilled_at      timestamptz not null default now()
);

comment on table public.stripe_payments is
  'Idempotency log for Stripe fulfillment. Prevents double-granting credits.';

alter table public.stripe_payments enable row level security;

create policy "owner_select_stripe_payments"
  on public.stripe_payments
  for select
  using (auth.uid() = user_id);
```

- [ ] **Step 2: Apply in Supabase dashboard**

Open Supabase → SQL Editor → paste the full file contents → Run.

Expected: no errors. Verify with:
```sql
-- Check deduct_credit now has 6 params
select proname, pronargs from pg_proc where proname = 'deduct_credit';
-- Expected: pronargs = 6

-- Check stripe_payments table exists
select count(*) from public.stripe_payments;
-- Expected: 0
```

- [ ] **Step 3: Commit migration file**

```bash
git add supabase/migrations/004_stripe_and_page_credits.sql
git commit -m "feat: migration 004 — 1 free credit, variable deduct_credit, stripe_payments"
```

---

## Task 5: Frontend — Install Stripe SDK + service-role Supabase client

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/lib/supabase/service.ts`

- [ ] **Step 1: Install Stripe SDK**

```bash
cd frontend && npm install stripe
```

Expected: `package.json` gains `"stripe": "^17.x.x"` in dependencies.

- [ ] **Step 2: Verify install**

```bash
node -e "require('stripe'); console.log('stripe ok')"
```
Expected output: `stripe ok`

- [ ] **Step 3: Create service-role Supabase client**

Create `frontend/lib/supabase/service.ts`:

```typescript
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — bypasses RLS.
 * Only use in server-side API routes. Never import in client components.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/lib/supabase/service.ts
git commit -m "feat: install stripe sdk, add supabase service-role client"
```

---

## Task 6: Frontend — Checkout API route

**Files:**
- Create: `frontend/app/api/checkout/route.ts`

- [ ] **Step 1: Create the route**

Create `frontend/app/api/checkout/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-03-31.basil",
});

const PLAN_MAP: Record<string, { priceId: string; credits: number }> = {
  single:       { priceId: process.env.STRIPE_PRICE_SINGLE!,       credits: 1  },
  starter:      { priceId: process.env.STRIPE_PRICE_STARTER!,      credits: 3  },
  course_pack:  { priceId: process.env.STRIPE_PRICE_COURSE_PACK!,  credits: 7  },
  full_bundle:  { priceId: process.env.STRIPE_PRICE_FULL_BUNDLE!,  credits: 15 },
};

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { plan } = await req.json() as { plan?: string };
  if (!plan || !PLAN_MAP[plan]) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const { priceId, credits } = PLAN_MAP[plan];
  const origin = req.headers.get("origin") ?? "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/payment/cancel`,
    metadata: {
      user_id: user.id,
      plan,
      credits: String(credits),
    },
  });

  return NextResponse.json({ url: session.url });
}
```

- [ ] **Step 2: Add env vars to `.env.local` and Vercel**

Add to `frontend/.env.local` (get values from Stripe dashboard → Products → create 4 one-time prices):

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_SINGLE=price_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_COURSE_PACK=price_...
STRIPE_PRICE_FULL_BUNDLE=price_...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Also add these same keys to Vercel → Project Settings → Environment Variables.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/api/checkout/route.ts
git commit -m "feat: add Stripe checkout API route"
```

---

## Task 7: Frontend — Verify API route

**Files:**
- Create: `frontend/app/api/checkout/verify/route.ts`

- [ ] **Step 1: Create the route**

Create `frontend/app/api/checkout/verify/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-03-31.basil",
});

const CREDITS_MAP: Record<string, number> = {
  single:      1,
  starter:     3,
  course_pack: 7,
  full_bundle: 15,
};

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (session.payment_status !== "paid") {
    return NextResponse.json({ status: "pending" }, { status: 202 });
  }

  const plan    = session.metadata?.plan ?? "";
  const credits = CREDITS_MAP[plan];
  if (!credits) {
    return NextResponse.json({ error: "Unknown plan in session metadata" }, { status: 400 });
  }

  const serviceClient = createServiceClient();

  // Idempotency: only fulfill once
  const { data: existing } = await serviceClient
    .from("stripe_payments")
    .select("id")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();

  if (!existing) {
    await serviceClient.rpc("admin_grant_credits", {
      p_user_id: user.id,
      p_amount:  credits,
      p_plan:    plan,
    });

    await serviceClient.from("stripe_payments").insert({
      stripe_session_id: sessionId,
      user_id:           user.id,
      plan,
      credits_granted:   credits,
    });
  }

  const { data: creditRow } = await supabase
    .from("user_credits")
    .select("credits_remaining")
    .eq("user_id", user.id)
    .single();

  return NextResponse.json({
    plan,
    credits_granted:   credits,
    credits_remaining: creditRow?.credits_remaining ?? null,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/api/checkout/verify/route.ts
git commit -m "feat: add checkout verify route with idempotency check"
```

---

## Task 8: Frontend — Stripe webhook route

**Files:**
- Create: `frontend/app/api/webhooks/stripe/route.ts`

- [ ] **Step 1: Create the route**

Create `frontend/app/api/webhooks/stripe/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/service";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-03-31.basil",
});

const CREDITS_MAP: Record<string, number> = {
  single:      1,
  starter:     3,
  course_pack: 7,
  full_bundle: 15,
};

export async function POST(req: NextRequest) {
  const body      = await req.text();
  const signature = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  if (session.payment_status !== "paid") {
    return NextResponse.json({ received: true });
  }

  const plan    = session.metadata?.plan ?? "";
  const userId  = session.metadata?.user_id ?? "";
  const credits = CREDITS_MAP[plan];

  if (!credits || !userId) {
    console.error("[webhook] missing metadata", session.metadata);
    return NextResponse.json({ received: true });
  }

  const serviceClient = createServiceClient();

  const { data: existing } = await serviceClient
    .from("stripe_payments")
    .select("id")
    .eq("stripe_session_id", session.id)
    .maybeSingle();

  if (!existing) {
    await serviceClient.rpc("admin_grant_credits", {
      p_user_id: userId,
      p_amount:  credits,
      p_plan:    plan,
    });

    await serviceClient.from("stripe_payments").insert({
      stripe_session_id: session.id,
      user_id:           userId,
      plan,
      credits_granted:   credits,
    });
  }

  return NextResponse.json({ received: true });
}
```

- [ ] **Step 2: Register webhook in Stripe dashboard**

Stripe dashboard → Developers → Webhooks → Add endpoint:
- URL: `https://your-vercel-domain.com/api/webhooks/stripe`
- Events to listen to: `checkout.session.completed`
- Copy the signing secret → add as `STRIPE_WEBHOOK_SECRET` in Vercel env vars and `.env.local`

- [ ] **Step 3: Commit**

```bash
git add frontend/app/api/webhooks/stripe/route.ts
git commit -m "feat: add Stripe webhook handler with idempotency"
```

---

## Task 9: Frontend — Payment success + cancel pages

**Files:**
- Create: `frontend/app/payment/success/page.tsx`
- Create: `frontend/app/payment/cancel/page.tsx`

- [ ] **Step 1: Create the success page**

Create `frontend/app/payment/success/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type State = "loading" | "done" | "pending" | "error";

export default function PaymentSuccessPage() {
  const params    = useSearchParams();
  const sessionId = params.get("session_id") ?? "";
  const [state, setState]     = useState<State>("loading");
  const [credits, setCredits] = useState<number | null>(null);
  const [plan, setPlan]       = useState("");

  useEffect(() => {
    if (!sessionId) { setState("error"); return; }

    fetch(`/api/checkout/verify?session_id=${encodeURIComponent(sessionId)}`)
      .then((r) => {
        if (r.status === 202) return { status: "pending" };
        return r.json();
      })
      .then((data) => {
        if (data.status === "pending") {
          setState("pending");
        } else if (data.error) {
          setState("error");
        } else {
          setPlan(data.plan ?? "");
          setCredits(data.credits_remaining ?? null);
          setState("done");
        }
      })
      .catch(() => setState("error"));
  }, [sessionId]);

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--cream)", padding: "2rem",
    }}>
      <div style={{
        maxWidth: 480, width: "100%", textAlign: "center",
        background: "white", borderRadius: 16, padding: "3rem 2rem",
        border: "1px solid var(--border)", boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
      }}>
        {state === "loading" && (
          <>
            <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>⏳</div>
            <h1 style={{ fontFamily: "var(--font-fraunces), Fraunces, serif", fontSize: "1.6rem", fontWeight: 400 }}>
              Confirming your payment…
            </h1>
          </>
        )}
        {state === "done" && (
          <>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🎉</div>
            <h1 style={{ fontFamily: "var(--font-fraunces), Fraunces, serif", fontSize: "1.8rem", fontWeight: 400, marginBottom: "0.75rem" }}>
              Payment confirmed!
            </h1>
            <p style={{ color: "var(--ink-light)", lineHeight: 1.6, marginBottom: "1.5rem" }}>
              Your {plan.replace(/_/g, " ")} credits have been added.
              {credits !== null && <> You now have <strong>{credits} credit{credits !== 1 ? "s" : ""}</strong> remaining.</>}
            </p>
            <a href="/translator" className="btn-primary" style={{ display: "inline-block" }}>
              Start translating →
            </a>
          </>
        )}
        {state === "pending" && (
          <>
            <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>⌛</div>
            <h1 style={{ fontFamily: "var(--font-fraunces), Fraunces, serif", fontSize: "1.6rem", fontWeight: 400, marginBottom: "0.75rem" }}>
              Payment processing
            </h1>
            <p style={{ color: "var(--ink-light)", lineHeight: 1.6, marginBottom: "1.5rem" }}>
              Your payment is still processing. Credits will appear within a few minutes.
            </p>
            <a href="/translator" style={{ color: "var(--terracotta)", textDecoration: "underline" }}>
              Go to translator →
            </a>
          </>
        )}
        {state === "error" && (
          <>
            <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>⚠️</div>
            <h1 style={{ fontFamily: "var(--font-fraunces), Fraunces, serif", fontSize: "1.6rem", fontWeight: 400, marginBottom: "0.75rem" }}>
              Something went wrong
            </h1>
            <p style={{ color: "var(--ink-light)", lineHeight: 1.6, marginBottom: "1.5rem" }}>
              We couldn&apos;t confirm your payment. If you were charged, credits will be added automatically within a few minutes.
            </p>
            <a href="mailto:support@courselingo.com" style={{ color: "var(--terracotta)", textDecoration: "underline" }}>
              Contact support
            </a>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the cancel page**

Create `frontend/app/payment/cancel/page.tsx`:

```tsx
export default function PaymentCancelPage() {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--cream)", padding: "2rem",
    }}>
      <div style={{
        maxWidth: 480, width: "100%", textAlign: "center",
        background: "white", borderRadius: 16, padding: "3rem 2rem",
        border: "1px solid var(--border)", boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
      }}>
        <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>👋</div>
        <h1 style={{ fontFamily: "var(--font-fraunces), Fraunces, serif", fontSize: "1.8rem", fontWeight: 400, marginBottom: "0.75rem" }}>
          No worries
        </h1>
        <p style={{ color: "var(--ink-light)", lineHeight: 1.6, marginBottom: "2rem" }}>
          You cancelled the checkout — no charge was made. Come back whenever you&apos;re ready.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
          <a href="/#pricing" className="btn-primary" style={{ display: "inline-block" }}>
            View pricing →
          </a>
          <a href="/translator" style={{ display: "inline-flex", alignItems: "center", color: "var(--ink-light)", fontSize: "0.9rem", textDecoration: "underline" }}>
            Back to translator
          </a>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/payment/success/page.tsx frontend/app/payment/cancel/page.tsx
git commit -m "feat: add payment success and cancel pages"
```

---

## Task 10: Frontend — Update pricing section in landing page

**Files:**
- Modify: `frontend/app/page.tsx` (lines ~615–663)

The current pricing section has wrong prices ($9/$49/$99), wrong credit amounts (3/15/40), and is missing the Single pack.

- [ ] **Step 1: Replace the pricing grid**

In `frontend/app/page.tsx`, find and replace the entire `<div className="pricing-grid">` block (lines ~615–659) with:

```tsx
        <div className="pricing-grid">
          {/* Single */}
          <div className="price-card">
            <div className="price-name">Single</div>
            <div className="price-amount">£12</div>
            <div className="price-desc">1 credit · one-time</div>
            <ul className="price-features">
              <li>1 credit included</li>
              <li>Up to 25 pages</li>
              <li>19 languages</li>
              <li>Layout &amp; fonts preserved</li>
              <li>Download instantly</li>
            </ul>
            <button className="btn-outline" onClick={() => handleCheckout("single")} disabled={checkoutLoading !== null}>
              {checkoutLoading === "single" ? "Loading…" : "Get started"}
            </button>
          </div>
          {/* Starter */}
          <div className="price-card">
            <div className="price-name">Starter</div>
            <div className="price-amount">£32</div>
            <div className="price-desc">3 credits · one-time</div>
            <ul className="price-features">
              <li>3 credits included</li>
              <li>Up to 75 pages per credit</li>
              <li>19 languages</li>
              <li>Layout &amp; fonts preserved</li>
              <li>Credits never expire</li>
            </ul>
            <button className="btn-outline" onClick={() => handleCheckout("starter")} disabled={checkoutLoading !== null}>
              {checkoutLoading === "starter" ? "Loading…" : "Buy starter"}
            </button>
          </div>
          {/* Course Pack */}
          <div className="price-card featured">
            <div className="price-tag">Most popular</div>
            <div className="price-name">Course Pack</div>
            <div className="price-amount">£69</div>
            <div className="price-desc">7 credits · one-time</div>
            <ul className="price-features">
              <li>7 credits included</li>
              <li>Best for multi-language launches</li>
              <li>19 languages</li>
              <li>Layout &amp; fonts preserved</li>
              <li>Credits never expire</li>
            </ul>
            <button className="btn-primary-sm" onClick={() => handleCheckout("course_pack")} disabled={checkoutLoading !== null}>
              {checkoutLoading === "course_pack" ? "Loading…" : "Get the pack"}
            </button>
          </div>
          {/* Full Bundle */}
          <div className="price-card">
            <div className="price-name">Full Bundle</div>
            <div className="price-amount">£129</div>
            <div className="price-desc">15 credits · one-time</div>
            <ul className="price-features">
              <li>15 credits included</li>
              <li>Best value per credit</li>
              <li>19 languages</li>
              <li>Layout &amp; fonts preserved</li>
              <li>Credits never expire</li>
            </ul>
            <button className="btn-outline" onClick={() => handleCheckout("full_bundle")} disabled={checkoutLoading !== null}>
              {checkoutLoading === "full_bundle" ? "Loading…" : "Get the bundle"}
            </button>
          </div>
        </div>
```

- [ ] **Step 2: Update the pricing footnote**

Find:
```tsx
          Credit cost scales with document size — short docs (≤20k chars) cost 1 credit · large docs (120k+) cost 6 credits.
```

Replace with:
```tsx
          Credit cost scales with document size — 1–25 pages costs 1 credit · up to 300 pages costs 4 credits.
```

- [ ] **Step 3: Add `checkoutLoading` state and `handleCheckout` to the component**

In `frontend/app/page.tsx`, after the existing state declarations near the top of the `Home` component (after `const [dragging, setDragging]...` line), add:

```tsx
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  const handleCheckout = useCallback(async (plan: string) => {
    setCheckoutLoading(plan);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (res.status === 401) {
        window.location.href = "/signup";
        return;
      }
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      // silent — button stops spinning
    } finally {
      setCheckoutLoading(null);
    }
  }, []);
```

`useCallback` is already imported on line 3 of `page.tsx`.

- [ ] **Step 4: Run lint**

```bash
cd frontend && npm run lint
```
Expected: no errors (warnings about `<img>` and `useEffect` are pre-existing and acceptable).

- [ ] **Step 5: Commit**

```bash
git add frontend/app/page.tsx
git commit -m "feat: update pricing cards and wire Stripe checkout buttons"
```

---

## Task 11: Frontend — Update translator page (page count, watermark, variable credits)

**Files:**
- Modify: `frontend/app/translator/page.tsx`

- [ ] **Step 1: Add `pageCount` state and update estimate response handling**

In `frontend/app/translator/page.tsx`, find:

```tsx
  const [estimatedCredits, setEstimatedCredits] = useState<number | null>(null);
```

Replace with:

```tsx
  const [estimatedCredits, setEstimatedCredits] = useState<number | null>(null);
  const [pageCount, setPageCount]               = useState<number | null>(null);
  const [userPlan, setUserPlan]                 = useState<string>("free");
```

- [ ] **Step 2: Load user plan alongside credits**

In the `fetchCreditsAndHistory` callback, find:

```typescript
    const [creditsRes, historyRes] = await Promise.all([
      supabase
        .from("user_credits")
        .select("credits_remaining")
        .eq("user_id", u.id)
        .single(),
```

Replace with:

```typescript
    const [creditsRes, historyRes] = await Promise.all([
      supabase
        .from("user_credits")
        .select("credits_remaining, plan")
        .eq("user_id", u.id)
        .single(),
```

And find:

```typescript
    if (creditsRes.data) setCredits(creditsRes.data.credits_remaining);
```

Replace with:

```typescript
    if (creditsRes.data) {
      setCredits(creditsRes.data.credits_remaining);
      setUserPlan(creditsRes.data.plan ?? "free");
    }
```

- [ ] **Step 3: Update the estimate effect to read page_count**

Find the estimate `useEffect`:

```typescript
      .then((d) => setEstimatedCredits(d.credits_required ?? null))
```

Replace with:

```typescript
      .then((d) => {
        setEstimatedCredits(d.credits_required ?? null);
        setPageCount(d.page_count ?? null);
      })
```

Also reset `pageCount` when file is cleared. Find:

```typescript
    if (!file) { setEstimatedCredits(null); return; }
```

Replace with:

```typescript
    if (!file) { setEstimatedCredits(null); setPageCount(null); return; }
```

- [ ] **Step 4: Add credit guard at start of `handleTranslate`**

In `handleTranslate`, add at the very top of the function body (before `setStatus("uploading")`):

```typescript
    if (credits !== null && estimatedCredits !== null && credits < estimatedCredits) {
      setErrorMsg(`You need ${estimatedCredits} credit${estimatedCredits !== 1 ? "s" : ""} but only have ${credits}. Buy more credits to continue.`);
      return;
    }
```

- [ ] **Step 5: Pass `watermark` flag in translate form data**

In `handleTranslate`, find:

```typescript
      const form = new FormData();
      form.append("file", file);
      form.append("target_lang", language);
```

Replace with:

```typescript
      const form = new FormData();
      form.append("file", file);
      form.append("target_lang", language);
      form.append("watermark", userPlan === "free" ? "true" : "false");
```

- [ ] **Step 6: Add `deduct_credit` call after successful translation**

In `handleTranslate`, find:

```typescript
      setDownloadName(match?.[1] ?? "translated.pdf");

      setStatus("done");
```

Replace with:

```typescript
      setDownloadName(match?.[1] ?? "translated.pdf");

      // Deduct credits atomically
      const creditsToDeduct = estimatedCredits ?? 1;
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser) {
        await supabase.rpc("deduct_credit", {
          p_user_id:         currentUser.id,
          p_filename:        file.name,
          p_output_filename: match?.[1] ?? "translated.pdf",
          p_target_lang:     language,
          p_file_size_bytes: file.size,
          p_amount:          creditsToDeduct,
        });
      }

      setStatus("done");
```

- [ ] **Step 7: Update credit cost display to show page count and warn on insufficient credits**

Find the `tr-estimate-row` section:

```tsx
          <div className="tr-estimate-row">
            <span>Credit cost</span>
            <span className="tr-estimate-cost">
              {file
                ? estimatedCredits === null
                  ? "Estimating…"
                  : `${estimatedCredits} credit${estimatedCredits !== 1 ? "s" : ""}`
                : "—"}
            </span>
          </div>
```

Replace with:

```tsx
          <div className="tr-estimate-row">
            <span>
              {pageCount !== null ? `Pages: ${pageCount} · Credit cost` : "Credit cost"}
            </span>
            <span
              className="tr-estimate-cost"
              style={
                credits !== null && estimatedCredits !== null && credits < estimatedCredits
                  ? { color: "#e05a3a" }
                  : undefined
              }
            >
              {file
                ? estimatedCredits === null
                  ? "Estimating…"
                  : `${estimatedCredits} credit${estimatedCredits !== 1 ? "s" : ""}`
                : "—"}
            </span>
          </div>
```

- [ ] **Step 8: Run lint**

```bash
cd frontend && npm run lint
```
Expected: no new errors.

- [ ] **Step 9: Run backend tests one final time**

```bash
cd backend && source .venv/Scripts/activate && pytest -v
```
Expected: 31 tests pass.

- [ ] **Step 10: Commit and push**

```bash
git add frontend/app/translator/page.tsx
git commit -m "feat: page count display, watermark flag, variable credit deduction, credit guard"
git push origin main
```

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|-------------|------|
| Page-based tiers (1–25=1, 26–75=2, 76–150=3, 151–300=4) | Task 1 |
| Hard cap at 300 pages | Tasks 1 + 3 |
| `/estimate` returns `page_count` | Task 1 |
| Watermark badge bottom-right, PyMuPDF text | Task 2 |
| Watermark on free plan only | Tasks 3 + 11 |
| Watermark PDF only, not DOCX | Task 3 (`_handle_docx` unchanged) |
| Free tier: 1 credit on signup | Task 4 migration |
| `deduct_credit` variable p_amount | Task 4 migration + Task 11 |
| `stripe_payments` idempotency table | Task 4 migration |
| Stripe SDK installed | Task 5 |
| Service-role Supabase client | Task 5 |
| Checkout API route | Task 6 |
| Verify route with idempotency | Task 7 |
| Webhook with idempotency | Task 8 |
| Payment success page | Task 9 |
| Payment cancel page | Task 9 |
| Pricing cards updated (£12/£32/£69/£129, 1/3/7/15 credits) | Task 10 |
| 4 plan keys: single/starter/course_pack/full_bundle | Tasks 6+7+8+10 |
| Buy buttons wired to `/api/checkout` | Task 10 |
| Redirect to `/signup` if not logged in | Task 10 |
| Page count shown in translator UI | Task 11 |
| Credit guard before translate | Task 11 |
| Variable `deduct_credit` call | Task 11 |
| Production CORS | Task 3 |

**No placeholders found.**

**Type consistency:** `CREDITS_MAP` is defined identically in Tasks 7 and 8 (`single=1, starter=3, course_pack=7, full_bundle=15`). `PLAN_MAP` in Task 6 uses the same keys. `p_amount` in Task 4 SQL matches `p_amount` in Task 11 RPC call. `_pages_to_credits` defined in Task 1 is called in both `/estimate` and `/translate` in Task 1 and 3.
