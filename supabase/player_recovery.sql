alter table public.players enable row level security;

drop policy if exists "users read own player row" on public.players;
create policy "users read own player row"
on public.players
for select
to authenticated
using (
  auth.uid() = id
  or lower(coalesce(auth.jwt()->>'email', '')) = lower(coalesce(email, ''))
);

drop policy if exists "users update own player row" on public.players;
create policy "users update own player row"
on public.players
for update
to authenticated
using (
  auth.uid() = id
  or lower(coalesce(auth.jwt()->>'email', '')) = lower(coalesce(email, ''))
)
with check (
  auth.uid() = id
  and lower(coalesce(auth.jwt()->>'email', '')) = lower(coalesce(email, ''))
);

drop policy if exists "users insert own player row" on public.players;
create policy "users insert own player row"
on public.players
for insert
to authenticated
with check (
  auth.uid() = id
  and lower(coalesce(auth.jwt()->>'email', '')) = lower(coalesce(email, ''))
);
