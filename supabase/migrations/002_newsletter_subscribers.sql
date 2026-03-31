-- ─────────────────────────────────────────────────────────────────────────────
-- CourseLingo — Newsletter Subscribers
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.newsletter_subscribers (
  id            uuid        primary key default gen_random_uuid(),
  email         text        not null unique,
  subscribed_at timestamptz not null default now()
);

comment on table public.newsletter_subscribers is 'Emails collected from the blog newsletter signup form.';

-- RLS: no client-side reads — view subscribers in the Supabase dashboard only.
alter table public.newsletter_subscribers enable row level security;

-- Allow anonymous inserts (the signup form doesn't require auth)
create policy "anyone_can_subscribe"
  on public.newsletter_subscribers
  for insert
  with check (true);

-- No SELECT/UPDATE/DELETE from client — admin only via dashboard / service role.
