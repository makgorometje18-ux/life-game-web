create extension if not exists pgcrypto;

create table if not exists public.dating_profiles (
  user_id uuid primary key references public.players(id) on delete cascade,
  display_name text not null,
  age integer not null check (age >= 18),
  city text not null,
  bio text not null,
  interests text[] not null default '{}',
  photo_url text,
  gallery_urls text[] not null default '{}',
  gender text,
  preferred_gender text not null default 'All',
  relationship_goal text,
  preferred_contact_method text,
  contact_value text,
  contact_verified boolean not null default false,
  verification_completed_at timestamptz,
  location_label text,
  latitude double precision,
  longitude double precision,
  onboarding_complete boolean not null default false,
  profile_verified boolean not null default false,
  is_photo_verified boolean not null default false,
  selfie_url text,
  face_match_score double precision,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dating_profiles add column if not exists gallery_urls text[] not null default '{}';
alter table public.dating_profiles add column if not exists gender text;
alter table public.dating_profiles add column if not exists preferred_gender text not null default 'All';
alter table public.dating_profiles add column if not exists relationship_goal text;
alter table public.dating_profiles add column if not exists preferred_contact_method text;
alter table public.dating_profiles add column if not exists contact_value text;
alter table public.dating_profiles add column if not exists contact_verified boolean not null default false;
alter table public.dating_profiles add column if not exists verification_completed_at timestamptz;
alter table public.dating_profiles add column if not exists location_label text;
alter table public.dating_profiles add column if not exists latitude double precision;
alter table public.dating_profiles add column if not exists longitude double precision;
alter table public.dating_profiles add column if not exists onboarding_complete boolean not null default false;
alter table public.dating_profiles add column if not exists profile_verified boolean not null default false;
alter table public.dating_profiles add column if not exists is_photo_verified boolean not null default false;
alter table public.dating_profiles add column if not exists selfie_url text;
alter table public.dating_profiles add column if not exists face_match_score double precision;
alter table public.dating_profiles add column if not exists is_active boolean not null default true;

create table if not exists public.dating_likes (
  id uuid primary key default gen_random_uuid(),
  liker_id uuid not null references public.players(id) on delete cascade,
  liked_user_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (liker_id, liked_user_id)
);

create table if not exists public.dating_matches (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.players(id) on delete cascade,
  user_b uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_a, user_b),
  constraint dating_match_pair_check check (user_a <> user_b)
);

create table if not exists public.dating_messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.dating_matches(id) on delete cascade,
  sender_id uuid not null references public.players(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table if not exists public.dating_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.players(id) on delete cascade,
  blocked_user_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_user_id),
  constraint dating_block_pair_check check (blocker_id <> blocked_user_id)
);

create table if not exists public.dating_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.players(id) on delete cascade,
  reported_user_id uuid not null references public.players(id) on delete cascade,
  reason text not null default 'No details provided.',
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reporter_id, reported_user_id),
  constraint dating_report_pair_check check (reporter_id <> reported_user_id)
);

alter table public.dating_profiles enable row level security;
alter table public.dating_likes enable row level security;
alter table public.dating_matches enable row level security;
alter table public.dating_messages enable row level security;
alter table public.dating_blocks enable row level security;
alter table public.dating_reports enable row level security;

drop policy if exists "dating profiles readable by signed in users" on public.dating_profiles;
create policy "dating profiles readable by signed in users"
on public.dating_profiles for select to authenticated using (
  (is_active = true or auth.uid() = user_id)
  and not exists (
    select 1
    from public.dating_blocks block_row
    where block_row.blocker_id = public.dating_profiles.user_id
      and block_row.blocked_user_id = auth.uid()
  )
);

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

drop policy if exists "users read own matches" on public.dating_matches;
create policy "users read own matches"
on public.dating_matches for select to authenticated
using (auth.uid() = user_a or auth.uid() = user_b);

drop policy if exists "users create matches they belong to" on public.dating_matches;
create policy "users create matches they belong to"
on public.dating_matches for insert to authenticated
with check (auth.uid() = user_a or auth.uid() = user_b);

drop policy if exists "users read messages from own matches" on public.dating_messages;
create policy "users read messages from own matches"
on public.dating_messages for select to authenticated
using (
  exists (
    select 1
    from public.dating_matches match_row
    where match_row.id = match_id
      and (match_row.user_a = auth.uid() or match_row.user_b = auth.uid())
  )
);

drop policy if exists "users send messages to own matches" on public.dating_messages;
create policy "users send messages to own matches"
on public.dating_messages for insert to authenticated
with check (
  auth.uid() = sender_id
  and exists (
    select 1
    from public.dating_matches match_row
    where match_row.id = match_id
      and (match_row.user_a = auth.uid() or match_row.user_b = auth.uid())
      and not exists (
        select 1
        from public.dating_blocks block_row
        where (
          block_row.blocker_id = match_row.user_a
          and block_row.blocked_user_id = match_row.user_b
        )
        or (
          block_row.blocker_id = match_row.user_b
          and block_row.blocked_user_id = match_row.user_a
        )
      )
  )
);

drop policy if exists "users update messages from own matches" on public.dating_messages;
create policy "users update messages from own matches"
on public.dating_messages for update to authenticated
using (
  exists (
    select 1
    from public.dating_matches match_row
    where match_row.id = match_id
      and (match_row.user_a = auth.uid() or match_row.user_b = auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.dating_matches match_row
    where match_row.id = match_id
      and (match_row.user_a = auth.uid() or match_row.user_b = auth.uid())
  )
);

drop policy if exists "users read own dating blocks" on public.dating_blocks;
create policy "users read own dating blocks"
on public.dating_blocks for select to authenticated
using (auth.uid() = blocker_id or auth.uid() = blocked_user_id);

drop policy if exists "users create own dating blocks" on public.dating_blocks;
create policy "users create own dating blocks"
on public.dating_blocks for insert to authenticated
with check (auth.uid() = blocker_id);

drop policy if exists "users delete own dating blocks" on public.dating_blocks;
create policy "users delete own dating blocks"
on public.dating_blocks for delete to authenticated
using (auth.uid() = blocker_id);

drop policy if exists "users read own dating reports" on public.dating_reports;
create policy "users read own dating reports"
on public.dating_reports for select to authenticated
using (auth.uid() = reporter_id);

drop policy if exists "users create own dating reports" on public.dating_reports;
create policy "users create own dating reports"
on public.dating_reports for insert to authenticated
with check (auth.uid() = reporter_id);

drop policy if exists "users update own dating reports" on public.dating_reports;
create policy "users update own dating reports"
on public.dating_reports for update to authenticated
using (auth.uid() = reporter_id)
with check (auth.uid() = reporter_id);

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

drop policy if exists "users delete own dating photos" on storage.objects;
create policy "users delete own dating photos"
on storage.objects for delete to authenticated
using (bucket_id = 'dating-photos' and auth.uid()::text = split_part(name, '/', 1));
