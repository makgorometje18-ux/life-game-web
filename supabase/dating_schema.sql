create table if not exists public.dating_profiles (
  user_id uuid primary key references public.players(id) on delete cascade,
  display_name text not null,
  age integer not null check (age >= 18),
  city text not null,
  bio text not null,
  interests text[] default '{}',
  photo_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dating_likes (
  id uuid primary key default gen_random_uuid(),
  liker_id uuid not null references public.players(id) on delete cascade,
  liked_user_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (liker_id, liked_user_id)
);

alter table public.dating_profiles enable row level security;
alter table public.dating_likes enable row level security;

drop policy if exists "dating profiles readable by signed in users" on public.dating_profiles;
create policy "dating profiles readable by signed in users"
on public.dating_profiles for select to authenticated using (true);

drop policy if exists "users manage own dating profile" on public.dating_profiles;
create policy "users manage own dating profile"
on public.dating_profiles for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users read dating likes they are part of" on public.dating_likes;
create policy "users read dating likes they are part of"
on public.dating_likes for select to authenticated
using (auth.uid() = liker_id or auth.uid() = liked_user_id);

drop policy if exists "users create own likes" on public.dating_likes;
create policy "users create own likes"
on public.dating_likes for insert to authenticated
with check (auth.uid() = liker_id);

insert into storage.buckets (id, name, public)
values ('dating-photos', 'dating-photos', true)
on conflict (id) do nothing;

drop policy if exists "dating photos public read" on storage.objects;
create policy "dating photos public read"
on storage.objects for select to public
using (bucket_id = 'dating-photos');

drop policy if exists "users upload own dating photos" on storage.objects;
create policy "users upload own dating photos"
on storage.objects for insert to authenticated
with check (bucket_id = 'dating-photos' and auth.uid()::text = split_part(name, '/', 1));

drop policy if exists "users update own dating photos" on storage.objects;
create policy "users update own dating photos"
on storage.objects for update to authenticated
using (bucket_id = 'dating-photos' and auth.uid()::text = split_part(name, '/', 1))
with check (bucket_id = 'dating-photos' and auth.uid()::text = split_part(name, '/', 1));
