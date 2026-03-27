-- ─────────────────────────────────────────────────────────────────────────────
-- CourseLingo — Credit & Usage Schema
-- Run this in your Supabase SQL editor (or via supabase db push)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. TABLES ────────────────────────────────────────────────────────────────

-- One row per user; tracks credit balance and plan tier.
-- "plan" is a free-form string so you can add tiers later without a migration.
-- "credits_remaining" is the spendable balance.
-- "credits_used" is a running lifetime counter (never decremented).
create table if not exists public.user_credits (
  user_id           uuid        primary key references auth.users(id) on delete cascade,
  credits_remaining integer     not null default 0 check (credits_remaining >= 0),
  credits_used      integer     not null default 0 check (credits_used >= 0),
  plan              text        not null default 'free',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table  public.user_credits                   is 'One row per user; tracks spendable credit balance.';
comment on column public.user_credits.credits_remaining is 'Credits the user can still spend.';
comment on column public.user_credits.credits_used      is 'Lifetime total credits consumed (never decremented).';
comment on column public.user_credits.plan              is 'free | starter | course_pack | full_bundle — or any future tier name.';


-- One row per completed translation attempt.
create table if not exists public.translation_history (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users(id) on delete cascade,
  filename          text        not null,
  output_filename   text,
  target_lang       text        not null,
  file_size_bytes   integer,
  credits_deducted  integer     not null default 1,
  status            text        not null default 'completed', -- 'completed' | 'failed'
  created_at        timestamptz not null default now()
);

comment on table public.translation_history is 'Audit log of every translation job.';


-- ── 2. INDEXES ───────────────────────────────────────────────────────────────

-- Fast lookup of a user's history sorted by date
create index if not exists translation_history_user_id_created_at
  on public.translation_history (user_id, created_at desc);


-- ── 3. ROW-LEVEL SECURITY ────────────────────────────────────────────────────

alter table public.user_credits       enable row level security;
alter table public.translation_history enable row level security;

-- Users may read their own credit row
create policy "owner_select_credits"
  on public.user_credits
  for select
  using (auth.uid() = user_id);

-- Users may read their own history
create policy "owner_select_history"
  on public.translation_history
  for select
  using (auth.uid() = user_id);

-- No direct INSERT/UPDATE/DELETE from clients — all writes go through RPCs below


-- ── 4. AUTO-UPDATE updated_at ────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_user_credits_updated_at
  before update on public.user_credits
  for each row execute procedure public.set_updated_at();


-- ── 5. SEED CREDITS ON SIGNUP ────────────────────────────────────────────────
-- Whenever a new row appears in auth.users, give the new user their free quota.
-- FREE_CREDITS is set to 3 here — change this constant to adjust the free tier.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.user_credits (user_id, credits_remaining, plan)
  values (new.id, 3, 'free')
  on conflict (user_id) do nothing;  -- idempotent: safe to re-run
  return new;
end;
$$;

-- Drop then recreate so this file is safely re-runnable
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ── 6. ATOMIC DEDUCT RPC ─────────────────────────────────────────────────────
-- Called from the frontend after a successful translation.
-- Runs as SECURITY DEFINER so it can bypass RLS to perform writes.
-- Auth check inside ensures users can only deduct from their own balance.
--
-- Returns JSON:
--   { "success": true,  "credits_remaining": N }
--   { "success": false, "error": "no_credits" }
--   { "success": false, "error": "no_account" }
--   { "success": false, "error": "unauthorized" }

create or replace function public.deduct_credit(
  p_user_id        uuid,
  p_filename       text,
  p_output_filename text,
  p_target_lang    text,
  p_file_size_bytes integer default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_remaining integer;
  v_credits_per_translation constant integer := 1;  -- change here to adjust cost
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

  if v_remaining < v_credits_per_translation then
    return jsonb_build_object('success', false, 'error', 'no_credits');
  end if;

  -- Deduct and track
  update public.user_credits
  set
    credits_remaining = credits_remaining - v_credits_per_translation,
    credits_used      = credits_used      + v_credits_per_translation
  where user_id = p_user_id;

  -- Audit log
  insert into public.translation_history
    (user_id, filename, output_filename, target_lang, file_size_bytes, credits_deducted, status)
  values
    (p_user_id, p_filename, p_output_filename, p_target_lang, p_file_size_bytes, v_credits_per_translation, 'completed');

  return jsonb_build_object(
    'success',           true,
    'credits_remaining', v_remaining - v_credits_per_translation
  );
end;
$$;


-- ── 7. ADMIN HELPERS (service-role only) ─────────────────────────────────────
-- Use these from your backend or Supabase dashboard to top up users after payment.
-- NOT callable by anon/authenticated roles.

-- Grant credits to a user (e.g. after payment webhook)
create or replace function public.admin_grant_credits(
  p_user_id uuid,
  p_amount  integer,
  p_plan    text default null
)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.user_credits (user_id, credits_remaining, plan)
  values (p_user_id, p_amount, coalesce(p_plan, 'free'))
  on conflict (user_id) do update
    set
      credits_remaining = public.user_credits.credits_remaining + excluded.credits_remaining,
      plan              = coalesce(p_plan, public.user_credits.plan),
      updated_at        = now();
end;
$$;

-- Revoke direct execution from non-service roles
revoke execute on function public.admin_grant_credits from anon, authenticated;
