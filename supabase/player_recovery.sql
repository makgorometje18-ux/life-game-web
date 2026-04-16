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

create or replace function public.recover_player_for_current_user()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := lower(coalesce(auth.jwt()->>'email', ''));
  recovered_id uuid;
begin
  if current_user_id is null or current_email = '' then
    raise exception 'Missing authenticated user or email';
  end if;

  update public.players
  set
    email = current_email,
    is_online = true,
    updated_at = now()
  where id = current_user_id
  returning id into recovered_id;

  if recovered_id is not null then
    return recovered_id;
  end if;

  update public.players
  set
    id = current_user_id,
    email = current_email,
    is_online = true,
    updated_at = now()
  where lower(coalesce(email, '')) = current_email
  returning id into recovered_id;

  if recovered_id is not null then
    return recovered_id;
  end if;

  insert into public.players (id, email, name, age, money, country, is_online, updated_at)
  values (
    current_user_id,
    current_email,
    split_part(current_email, '@', 1),
    18,
    370,
    'South Africa',
    true,
    now()
  )
  returning id into recovered_id;

  return recovered_id;
end;
$$;

revoke all on function public.recover_player_for_current_user() from public;
grant execute on function public.recover_player_for_current_user() to authenticated;
