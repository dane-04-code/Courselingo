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
