# Stripe Payments + Variable Credit System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up Stripe Checkout for one-time credit purchases and make credit deduction variable (based on document size) rather than hardcoded to 1.

**Architecture:** Pricing buttons on the landing page call a Next.js API route `/api/checkout` which creates a Stripe Checkout Session; Stripe redirects to `/payment/success` which calls `/api/checkout/verify` to fulfill credits via Supabase service-role RPC `admin_grant_credits`. A webhook at `/api/webhooks/stripe` provides idempotent backup fulfillment. Credit deduction in the translator uses the existing estimate value and passes it to the updated `deduct_credit` RPC.

**Tech Stack:** Stripe Node.js SDK (`stripe`), Next.js 14 App Router API routes, Supabase service-role client, existing `deduct_credit` + `admin_grant_credits` RPCs.

---

## File Map

**Create:**
- `frontend/app/api/checkout/route.ts` — creates Stripe Checkout Session
- `frontend/app/api/checkout/verify/route.ts` — verifies payment, grants credits
- `frontend/app/api/webhooks/stripe/route.ts` — handles `checkout.session.completed` webhook
- `frontend/app/payment/success/page.tsx` — polled confirmation page
- `frontend/app/payment/cancel/page.tsx` — cancel/return page
- `supabase/migrations/003_variable_credits_and_stripe.sql` — stripe_payments table + updated deduct_credit RPC

**Modify:**
- `frontend/app/translator/page.tsx` — add `deduct_credit` call with variable amount after successful translation
- `frontend/app/page.tsx` — wire pricing buttons (auth check → `/api/checkout` → redirect)
- `frontend/lib/supabase/service.ts` — NEW: service-role Supabase client for server-side admin calls

---

## Task 1: Install Stripe SDK

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install the stripe package**

Run from `frontend/` directory:
```bash
npm install stripe
```

Expected: `package.json` now has `"stripe": "^17.x.x"` in dependencies.

- [ ] **Step 2: Verify install**

Run:
```bash
node -e "require('stripe'); console.log('ok')"
```
Expected output: `ok`

- [ ] **Step 3: Commit**

```bash
cd frontend
git add package.json package-lock.json
git commit -m "chore: install stripe sdk"
```

---

## Task 2: Supabase service-role client

**Files:**
- Create: `frontend/lib/supabase/service.ts`

The existing `frontend/lib/supabase/server.ts` uses the anon key with cookie-based auth. API routes that grant credits need a service-role client that bypasses RLS.

- [ ] **Step 1: Create the file**

Create `frontend/lib/supabase/service.ts`:

```typescript
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — bypasses RLS.
 * Only use in server-side API routes; never expose to the browser.
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

- [ ] **Step 2: Commit**

```bash
git add frontend/lib/supabase/service.ts
git commit -m "feat: add supabase service-role client"
```

---

## Task 3: Supabase migration — stripe_payments table + variable deduct_credit

**Files:**
- Create: `supabase/migrations/003_variable_credits_and_stripe.sql`

This migration does two things:
1. Adds `p_amount integer default 1` to `deduct_credit` so the translator can deduct 1–6 credits depending on document size.
2. Creates `stripe_payments` for idempotent webhook/verify fulfillment.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/003_variable_credits_and_stripe.sql`:

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- CourseLingo — Migration 003
-- 1. Update deduct_credit to accept a variable amount
-- 2. Add stripe_payments table for idempotent fulfillment
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. UPDATED deduct_credit RPC ─────────────────────────────────────────────
-- Adds p_amount parameter (default 1 for backwards compat).
-- All existing callers that pass no amount still deduct 1 credit.

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
  -- Only the authenticated user may deduct from their own balance
  if auth.uid() is distinct from p_user_id then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  -- Lock the row for this transaction to prevent double-spend
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

  -- Deduct and track
  update public.user_credits
  set
    credits_remaining = credits_remaining - p_amount,
    credits_used      = credits_used      + p_amount
  where user_id = p_user_id;

  -- Audit log
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


-- ── 2. stripe_payments TABLE ──────────────────────────────────────────────────
-- One row per fulfilled Stripe checkout session.
-- stripe_session_id is UNIQUE — insert-or-skip prevents double-fulfillment.

create table if not exists public.stripe_payments (
  id                uuid        primary key default gen_random_uuid(),
  stripe_session_id text        unique not null,
  user_id           uuid        not null references auth.users(id),
  plan              text        not null,
  credits_granted   integer     not null,
  fulfilled_at      timestamptz not null default now()
);

comment on table public.stripe_payments is
  'Idempotency log for Stripe checkout fulfillment. Prevents double-granting credits.';

-- Service role can insert; authenticated users can read their own
alter table public.stripe_payments enable row level security;

create policy "owner_select_stripe_payments"
  on public.stripe_payments
  for select
  using (auth.uid() = user_id);
```

- [ ] **Step 2: Apply the migration in Supabase**

Open the Supabase dashboard → SQL Editor → paste and run the contents of `supabase/migrations/003_variable_credits_and_stripe.sql`.

Expected: no errors. Confirm by running:
```sql
select proname, pronargs from pg_proc where proname = 'deduct_credit';
```
Expected: one row with `pronargs = 6` (was 5 before).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/003_variable_credits_and_stripe.sql
git commit -m "feat: variable deduct_credit + stripe_payments idempotency table"
```

---

## Task 4: Environment variables

**Files:**
- Create/modify: `frontend/.env.local`

- [ ] **Step 1: Add Stripe keys to .env.local**

Create or append to `frontend/.env.local` (get values from Stripe dashboard + Supabase project settings):

```bash
# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_COURSE_PACK=price_...
STRIPE_PRICE_PRO_PACK=price_...

# Supabase service role (Settings > API > service_role key)
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

> Note: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` should already be in this file from initial setup.

- [ ] **Step 2: Verify env vars are accessible**

In a Next.js API route (any existing one), add a temporary log and confirm these keys are non-empty when the dev server starts. Remove the log immediately after confirming.

- [ ] **Step 3: Do NOT commit .env.local**

Confirm `.env.local` is in `.gitignore`:
```bash
grep ".env.local" frontend/.gitignore
```
Expected: it appears in `.gitignore`. If not, add it.

---

## Task 5: Checkout API route

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
  starter:     { priceId: process.env.STRIPE_PRICE_STARTER!,     credits: 3  },
  course_pack: { priceId: process.env.STRIPE_PRICE_COURSE_PACK!, credits: 15 },
  pro_pack:    { priceId: process.env.STRIPE_PRICE_PRO_PACK!,    credits: 40 },
};

export async function POST(req: NextRequest) {
  // 1. Require authentication
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse and validate plan
  const { plan } = await req.json() as { plan?: string };
  if (!plan || !PLAN_MAP[plan]) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const { priceId, credits } = PLAN_MAP[plan];
  const origin = req.headers.get("origin") ?? "http://localhost:3000";

  // 3. Create Stripe Checkout Session
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

- [ ] **Step 2: Test the route manually**

Start the Next.js dev server (`npm run dev` in `frontend/`). In a browser, open DevTools console and run:

```javascript
fetch('/api/checkout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ plan: 'starter' })
}).then(r => r.json()).then(console.log)
```

Expected if not logged in: `{ error: "Unauthorized" }` (401).
Expected if logged in: `{ url: "https://checkout.stripe.com/..." }`.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/api/checkout/route.ts
git commit -m "feat: add Stripe checkout API route"
```

---

## Task 6: Verify API route

**Files:**
- Create: `frontend/app/api/checkout/verify/route.ts`

Called from the success page after Stripe redirects back. Fetches the session, confirms payment, grants credits.

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
  starter:     3,
  course_pack: 15,
  pro_pack:    40,
};

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  // 1. Require authenticated user
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Fetch session from Stripe
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

  // 3. Idempotency check — skip if already fulfilled
  const { data: existing } = await serviceClient
    .from("stripe_payments")
    .select("id")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();

  if (!existing) {
    // 4. Grant credits
    await serviceClient.rpc("admin_grant_credits", {
      p_user_id: user.id,
      p_amount:  credits,
      p_plan:    plan,
    });

    // 5. Record fulfillment
    await serviceClient.from("stripe_payments").insert({
      stripe_session_id: sessionId,
      user_id:           user.id,
      plan,
      credits_granted:   credits,
    });
  }

  // 6. Return updated balance
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
git commit -m "feat: add checkout verify route with idempotency"
```

---

## Task 7: Webhook route

**Files:**
- Create: `frontend/app/api/webhooks/stripe/route.ts`

Handles `checkout.session.completed` as a backup fulfillment path (in case the user closes the browser before the success page loads).

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
  starter:     3,
  course_pack: 15,
  pro_pack:    40,
};

// Next.js 14: must disable body parsing for Stripe signature verification
export const config = { api: { bodyParser: false } };

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
    console.error("Webhook: missing metadata", session.metadata);
    return NextResponse.json({ received: true });
  }

  const serviceClient = createServiceClient();

  // Idempotency check
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

- [ ] **Step 2: Register the webhook in Stripe**

In the Stripe dashboard → Developers → Webhooks → Add endpoint:
- URL: `https://your-domain.com/api/webhooks/stripe` (use ngrok for local testing: `ngrok http 3000`)
- Event: `checkout.session.completed`
- Copy the signing secret into `STRIPE_WEBHOOK_SECRET` in `.env.local`

- [ ] **Step 3: Commit**

```bash
git add frontend/app/api/webhooks/stripe/route.ts
git commit -m "feat: add Stripe webhook handler with idempotency"
```

---

## Task 8: Payment success page

**Files:**
- Create: `frontend/app/payment/success/page.tsx`

- [ ] **Step 1: Create the page**

Create `frontend/app/payment/success/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type State = "loading" | "done" | "pending" | "error";

export default function PaymentSuccessPage() {
  const params    = useSearchParams();
  const sessionId = params.get("session_id") ?? "";
  const [state, setState]   = useState<State>("loading");
  const [credits, setCredits] = useState<number | null>(null);
  const [plan, setPlan]     = useState("");

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
              Your {plan.replace("_", " ")} credits have been added to your account.
              {credits !== null && <> You now have <strong>{credits} credits</strong> remaining.</>}
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
              Your payment is still processing. Credits will appear in your account within a few minutes.
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
              We couldn't confirm your payment. If you were charged, your credits will be added automatically within a few minutes via our webhook.
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

- [ ] **Step 2: Commit**

```bash
git add frontend/app/payment/success/page.tsx
git commit -m "feat: add payment success page"
```

---

## Task 9: Payment cancel page

**Files:**
- Create: `frontend/app/payment/cancel/page.tsx`

- [ ] **Step 1: Create the page**

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
          You cancelled the checkout — no charge was made. Come back whenever you&apos;re ready to top up your credits.
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

- [ ] **Step 2: Commit**

```bash
git add frontend/app/payment/cancel/page.tsx
git commit -m "feat: add payment cancel page"
```

---

## Task 10: Wire up pricing buttons on landing page

**Files:**
- Modify: `frontend/app/page.tsx` (lines ~615–660, the `<div className="pricing-grid">` section)

The pricing buttons are currently plain `<button>` elements. They need to call `/api/checkout` and redirect to Stripe. The landing page is already `"use client"`.

- [ ] **Step 1: Add checkout handler**

In `frontend/app/page.tsx`, add a `checkoutLoading` state and `handleCheckout` function. Place these near the top of the component function (after existing state declarations):

```typescript
const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null); // plan key while loading

const handleCheckout = useCallback(async (plan: string) => {
  setCheckoutLoading(plan);
  try {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const data = await res.json();
    if (res.status === 401) {
      // Not logged in → redirect to signup with return hint
      window.location.href = `/signup?next=/pricing`;
      return;
    }
    if (data.url) {
      window.location.href = data.url;
    }
  } catch {
    // silent — button just stops spinning
  } finally {
    setCheckoutLoading(null);
  }
}, []);
```

Make sure `useCallback` is already imported (it is — check line 3 of page.tsx).

- [ ] **Step 2: Update the three pricing buttons**

Replace the three `<button>` elements inside `<div className="pricing-grid">` with onClick handlers:

**Starter button** (was `<button className="btn-outline">Get started</button>`):
```tsx
<button
  className="btn-outline"
  onClick={() => handleCheckout("starter")}
  disabled={checkoutLoading !== null}
>
  {checkoutLoading === "starter" ? "Loading…" : "Get started"}
</button>
```

**Course Pack button** (was `<button className="btn-primary-sm">Get the pack</button>`):
```tsx
<button
  className="btn-primary-sm"
  onClick={() => handleCheckout("course_pack")}
  disabled={checkoutLoading !== null}
>
  {checkoutLoading === "course_pack" ? "Loading…" : "Get the pack"}
</button>
```

**Pro Pack button** (was `<button className="btn-outline">Get the pro pack</button>`):
```tsx
<button
  className="btn-outline"
  onClick={() => handleCheckout("pro_pack")}
  disabled={checkoutLoading !== null}
>
  {checkoutLoading === "pro_pack" ? "Loading…" : "Get the pro pack"}
</button>
```

- [ ] **Step 3: Test in browser**

1. While logged out, click "Get started" → should redirect to `/signup?next=/pricing`.
2. While logged in, click "Get started" → should open Stripe Checkout test mode page.
3. Complete Stripe test checkout (use card `4242 4242 4242 4242`, any future expiry, any CVC).
4. Should redirect to `/payment/success?session_id=...` and show credits confirmed.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/page.tsx
git commit -m "feat: wire pricing buttons to Stripe checkout"
```

---

## Task 11: Add credit deduction to translator page

**Files:**
- Modify: `frontend/app/translator/page.tsx`

Currently the translator page calls the backend, downloads the file, and refreshes credits — but never actually calls `deduct_credit`. This task adds the deduction call using the variable credit amount from the estimate.

- [ ] **Step 1: Add deduct_credit call in handleTranslate**

In `frontend/app/translator/page.tsx`, inside `handleTranslate`, after the successful translation response (after `setDownloadName(...)` and before `setStatus("done")`), add:

```typescript
// Deduct credits atomically
const creditsToDeduct = estimatedCredits ?? 1;
const { data: { user: currentUser } } = await supabase.auth.getUser();
if (currentUser) {
  const { data: deductResult } = await supabase.rpc("deduct_credit", {
    p_user_id:         currentUser.id,
    p_filename:        file.name,
    p_output_filename: match?.[1] ?? "translated.pdf",
    p_target_lang:     language,
    p_file_size_bytes: file.size,
    p_amount:          creditsToDeduct,
  });
  if (deductResult?.error === "no_credits") {
    // This shouldn't happen (UI already blocks it), but handle gracefully
    setErrorMsg("Insufficient credits. Please purchase more.");
    setStatus("error");
    setShowModal(false);
    if (progressInterval.current) clearInterval(progressInterval.current);
    return;
  }
}
```

The full updated success block (after `const match = cd.match(...)`) should look like:

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
setTimeout(() => setModalDone(true), 600);
fetchCreditsAndHistory();
```

- [ ] **Step 2: Add insufficient-credits guard before translate**

Add a check at the top of `handleTranslate` (before setting status to "uploading") to block the call if credits are insufficient:

```typescript
// Guard: block if we know credits are insufficient
if (credits !== null && estimatedCredits !== null && credits < estimatedCredits) {
  setErrorMsg(`You need ${estimatedCredits} credit${estimatedCredits !== 1 ? "s" : ""} but only have ${credits}. Please buy more.`);
  return;
}
```

- [ ] **Step 3: Update the credit cost display to show warning when insufficient**

Find the `tr-estimate-row` section (around line 425) and update the cost display to show a warning color when the user can't afford it:

```tsx
<div className="tr-estimate-row">
  <span>Credit cost</span>
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

- [ ] **Step 4: Test end-to-end**

1. Upload a small PDF/DOCX.
2. Confirm "Credit cost" shows e.g. "1 credit".
3. Click Translate.
4. After completion, confirm credits decreased by 1 in the credit card.
5. Check Supabase `translation_history` table — confirm a row was inserted with `credits_deducted = 1`.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/translator/page.tsx
git commit -m "feat: deduct variable credits after successful translation"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| Credit tiers (1/2/4/6 based on char count) | Backend already has `_chars_to_credits` ✅; Task 11 reads `estimatedCredits` |
| Credit packs (3/15/40) | Tasks 5, 6, 7, 10 |
| Stripe Checkout flow | Tasks 5, 8, 10 |
| Auth redirect if not logged in | Task 10 |
| Success page + verify route | Tasks 6, 8 |
| Webhook idempotency | Tasks 3, 7 |
| `deduct_credit` variable amount | Tasks 3, 11 |
| `stripe_payments` table | Task 3 |
| Insufficient credits UI guard | Task 11 |
| Payment cancel page | Task 9 |
| Env vars | Task 4 |

**No placeholders found.**

**Type consistency:** `p_amount` added to both the SQL migration (Task 3) and the Supabase RPC call (Task 11). `CREDITS_MAP` is defined identically in both Task 6 (verify) and Task 7 (webhook). `PLAN_MAP` in Task 5 matches the plan keys used in Tasks 6, 7, 10, 11.
