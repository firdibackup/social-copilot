-- Brand › Referensi "Dari akun lain": recent posts of another public Instagram profile, scraped through Apify
-- (src/lib/apify.ts fetchProfilePosts), at most a few distinct profiles per user and calendar week in WIB, Monday to Sunday
-- (REFERENCE_SCRAPE_WEEKLY in src/lib/reference-scrape.ts; never shown to the owner).
-- One row per user, week and username is both the quota slot and a cache: opening the same username again in that
-- week costs no slot, and its stored posts are served while fetched_at is under 12 hours old.
-- posts is null while the first scrape runs; a failed first scrape deletes the row and gives the slot back.
-- Same rules as the rest: RLS on with no policies, only the server's service-role key reads or writes.
create table public.reference_profile_scrapes (
  user_id    uuid not null references auth.users (id) on delete cascade,
  -- Monday of the week in Asia/Jakarta.
  week       date not null check (extract(isodow from week) = 1),
  username   text not null check (username ~ '^[a-z0-9._]{1,30}$'),
  -- InstagramPost[] (src/lib/instagram.ts); the image links are signed CDN URLs: never log them.
  posts      jsonb check (posts is null or jsonb_typeof(posts) = 'array'),
  fetched_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, week, username)
);

alter table public.reference_profile_scrapes enable row level security;
revoke all on public.reference_profile_scrapes from anon, authenticated;
grant all on public.reference_profile_scrapes to service_role;

-- 'existing' when the user already has this username this week (no new slot), 'reserved' when a free slot was
-- taken for it, 'full' when the week's slots are used up. One call at a time per user, so two tabs can't both
-- take the last slot.
create function public.reserve_reference_scrape(p_user_id uuid, p_username text, p_limit integer)
returns text language plpgsql set search_path = '' as $$
declare
  v_week date := date_trunc('week', current_timestamp at time zone 'Asia/Jakarta')::date;
  v_used integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('reference_profile_scrapes:' || p_user_id::text, 0));
  if exists (
    select 1 from public.reference_profile_scrapes
    where user_id = p_user_id and week = v_week and username = p_username
  ) then
    return 'existing';
  end if;
  select count(*) into v_used from public.reference_profile_scrapes where user_id = p_user_id and week = v_week;
  if v_used >= p_limit then
    return 'full';
  end if;
  insert into public.reference_profile_scrapes (user_id, week, username) values (p_user_id, v_week, p_username);
  return 'reserved';
end $$;
revoke execute on function public.reserve_reference_scrape(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.reserve_reference_scrape(uuid, text, integer) to service_role;

-- Gives back the slot of a first scrape that failed: deletes the user's newest row for the username, only while it
-- holds no posts yet, so a scrape that already succeeded is never undone.
create function public.release_reference_scrape(p_user_id uuid, p_username text)
returns void language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('reference_profile_scrapes:' || p_user_id::text, 0));
  delete from public.reference_profile_scrapes
  where user_id = p_user_id
    and username = p_username
    and posts is null
    and week = (
      select max(week) from public.reference_profile_scrapes where user_id = p_user_id and username = p_username
    );
end $$;
revoke execute on function public.release_reference_scrape(uuid, text) from public, anon, authenticated;
grant execute on function public.release_reference_scrape(uuid, text) to service_role;
