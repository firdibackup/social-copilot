-- Analitik: the connected account's own posts of the last 90 days with their latest insights. One row per post,
-- overwritten by every sync; Instagram's lifetime insights are already cumulative, so no history is kept.
-- account_id is set by the sync (the account whose token read the post), like the other per-account rows a
-- display filter. The thumbnail is a signed Instagram CDN link that each sync renews.
create table public.ig_media (
  user_id            uuid not null references auth.users (id) on delete cascade,
  account_id         text not null,
  media_id           text not null,
  media_type         text not null,
  media_product_type text,
  caption            text not null default '',
  permalink          text,
  thumbnail_url      text,
  posted_at          timestamptz not null,
  -- Null: Instagram gave no value (insights failed or not available), which the page shows as "—", not 0.
  views              bigint,
  reach              bigint,
  likes              bigint,
  comments           bigint,
  shares             bigint,
  saved              bigint,
  total_interactions bigint,
  -- Instagram's message when this post's insights failed in the last sync; the metrics above keep older values.
  insights_error     text,
  synced_at          timestamptz not null default now(),
  primary key (user_id, media_id)
);

create index ig_media_user_id_account_id_posted_at_idx on public.ig_media (user_id, account_id, posted_at desc);

-- One row per user and account: when the last sync started and how it ended.
create table public.analytics_syncs (
  user_id     uuid not null references auth.users (id) on delete cascade,
  account_id  text not null,
  -- Null after a failed sync, so the next page visit tries again.
  started_at  timestamptz,
  finished_at timestamptz,
  updated     integer not null default 0,
  failed      integer not null default 0,
  primary key (user_id, account_id)
);

alter table public.ig_media enable row level security;
alter table public.analytics_syncs enable row level security;
revoke all on public.ig_media, public.analytics_syncs from anon, authenticated;

-- Starts a sync unless one started less than p_cooldown_seconds ago (running or finished). This is the Refresh
-- cooldown and keeps two syncs of one account from running at once.
create function public.claim_analytics_sync(p_user_id uuid, p_account_id text, p_cooldown_seconds integer)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  insert into public.analytics_syncs (user_id, account_id, started_at)
  values (p_user_id, p_account_id, now())
  on conflict (user_id, account_id) do update
    set started_at = now()
    where public.analytics_syncs.started_at is null
       or public.analytics_syncs.started_at < now() - make_interval(secs => p_cooldown_seconds);
  return found;
end;
$$;

revoke execute on function public.claim_analytics_sync(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.claim_analytics_sync(uuid, text, integer) to service_role;
