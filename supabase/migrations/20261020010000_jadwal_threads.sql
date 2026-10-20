-- Penjadwalan dan Threads: the account's weekly posting slots, a Threads connection, a Threads version of posts with
-- its own publishing state, and the replies to the account's Threads posts for Balasan. Same rules as before: RLS on
-- with no policies, every row carries user_id, and the dashboard filters by account_id (the Instagram account, which
-- is the brand).

-- 1. Posting slots: weekly recurring times in WIB, [{"time": "19:00", "days": [1, 2, 4, 5, 7]}] with ISO weekdays
-- (1 = Monday). An account without a row uses the default from its Brand strategy. Slots never move a post: a post
-- keeps its absolute scheduled_at.
create table public.schedule_settings (
  user_id    uuid not null references auth.users (id) on delete cascade,
  account_id text not null,
  slots      jsonb not null default '[]' check (jsonb_typeof(slots) = 'array'),
  updated_at timestamptz not null default now(),
  primary key (user_id, account_id)
);

-- 2. Threads connection: one per user, made for the Instagram account (brand) connected at the time. Putuskan
-- Instagram and switching to another Instagram account remove it, as they remove the Facebook Page token.
create table public.threads_connections (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  account_id         text not null,
  threads_user_id    text not null unique, -- one Threads account per user of the app
  username           text not null,
  access_token_enc   text not null,        -- AES-256-GCM, like instagram_connections
  scopes             text[] not null default '{}',
  token_expires_at   timestamptz not null,
  token_refreshed_at timestamptz not null,
  status             text not null default 'active' check (status in ('active', 'needs_reconnect')),
  connected_at       timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- When the last pull of replies started; null after a failed pull, so the next visit tries again.
  replies_synced_at  timestamptz
);

-- 3. Where a post goes. Instagram stays the default and keeps its worker loop; a post without Instagram is published
-- by the Threads loop alone, which then shows its progress on the post itself.
alter table public.posts add column instagram_enabled boolean not null default true;

-- The Threads version of a post and how far it got. due_at is set while the post is scheduled (arm_threads below),
-- so a Threads version switched on after the post went out waits for an explicit Terbitkan.
create table public.post_threads (
  post_id         uuid primary key references public.posts (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  enabled         boolean not null default true,
  status          text not null default 'pending'
                  check (status in ('pending', 'publishing', 'published', 'failed')),
  due_at          timestamptz,
  attempt_count   smallint not null default 0,
  next_attempt_at timestamptz, -- retry time; null means due_at
  locked_at       timestamptz, -- when a worker claimed it
  last_error      text,
  media_id        text,        -- the first post of the chain, once out
  permalink       text,
  published_at    timestamptz,
  updated_at      timestamptz not null default now()
);

create index post_threads_due_idx on public.post_threads (due_at) where enabled and status in ('pending', 'publishing');

-- The chain once the owner changed it from the caption; without rows it follows the caption and photos. Item 0 is
-- the post and every next item replies to the one before. container_id is saved before publishing and media_id
-- after, so a retry continues where it stopped and never posts an item twice.
create table public.thread_items (
  post_id      uuid not null references public.posts (id) on delete cascade,
  position     smallint not null check (position between 0 and 9),
  text         text not null default '' check (char_length(text) <= 500),
  container_id text,
  media_id     text,
  primary key (post_id, position)
);

create table public.thread_item_media (
  post_id       uuid not null,
  item_position smallint not null,
  position      smallint not null check (position between 0 and 19), -- Threads allows 20 per carousel
  asset_id      uuid not null references public.assets (id) on delete restrict, -- a photo in use can't be deleted
  primary key (post_id, item_position, position),
  foreign key (post_id, item_position) references public.thread_items (post_id, position) on delete cascade
);

create index thread_item_media_asset_id_idx on public.thread_item_media (asset_id);

-- 4. The account's Threads posts of the last 30 days and their replies, pulled for the Komentar tab. Threads nests
-- replies at any depth; parent_id is the top-level reply of the branch (null for a top-level reply), so the tab shows
-- one level like Instagram, and replied_to_id keeps what a reply actually answers.
create table public.threads_media (
  user_id       uuid not null references auth.users (id) on delete cascade,
  account_id    text not null,
  media_id      text not null,
  text          text not null default '',
  permalink     text,
  thumbnail_url text, -- a signed CDN link: never log it
  posted_at     timestamptz not null,
  primary key (user_id, media_id)
);

create index threads_media_user_id_account_id_posted_at_idx on public.threads_media (user_id, account_id, posted_at desc);

create table public.threads_replies (
  user_id       uuid not null references auth.users (id) on delete cascade,
  account_id    text not null,
  reply_id      text not null,
  media_id      text not null,
  replied_to_id text not null,
  parent_id     text,
  username      text,
  text          text not null default '',
  created_at    timestamptz not null,
  is_hidden     boolean not null default false,
  -- The connected account's own replies: shown, never counted as waiting or new.
  is_from_owner boolean not null default false,
  -- When the owner first replied in the branch after this reply.
  replied_at    timestamptz,
  seen_at       timestamptz,
  primary key (user_id, reply_id)
);

create index threads_replies_user_id_account_id_created_at_idx
  on public.threads_replies (user_id, account_id, created_at desc);
create index threads_replies_user_id_media_id_created_at_idx on public.threads_replies (user_id, media_id, created_at);

alter table public.schedule_settings enable row level security;
alter table public.threads_connections enable row level security;
alter table public.post_threads enable row level security;
alter table public.thread_items enable row level security;
alter table public.thread_item_media enable row level security;
alter table public.threads_media enable row level security;
alter table public.threads_replies enable row level security;

revoke all on public.schedule_settings, public.threads_connections, public.post_threads, public.thread_items,
  public.thread_item_media, public.threads_media, public.threads_replies from anon, authenticated;

-- 5. Scheduling a post arms its Threads version for the same time; taking the post off the schedule disarms it. One
-- trigger, so every path that changes a post's status (save_post, schedule_post, Batalkan, Coba lagi, Putuskan)
-- keeps Threads in step. The worker's own transitions (a retry after `publishing`) leave it alone, so a transient
-- Instagram retry never revives a Threads version that failed for good.
create function public.arm_threads()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'scheduled'
     and old.status <> 'publishing'
     and (old.status <> 'scheduled' or old.scheduled_at is distinct from new.scheduled_at) then
    update public.post_threads
       set due_at = new.scheduled_at,
           status = 'pending',
           attempt_count = case when status = 'failed' then 0 else attempt_count end,
           next_attempt_at = null,
           last_error = case when status = 'failed' then null else last_error end,
           updated_at = now()
     where post_id = new.id and status in ('pending', 'failed');
  elsif new.status in ('draft', 'cancelled') then
    update public.post_threads
       set due_at = null, next_attempt_at = null, updated_at = now()
     where post_id = new.id and status = 'pending';
  end if;
  return null;
end;
$$;

create trigger arm_threads
  after update of status, scheduled_at on public.posts
  for each row
  when (old.status is distinct from new.status or old.scheduled_at is distinct from new.scheduled_at)
  execute function public.arm_threads();

-- The Instagram loop skips posts without Instagram: the Threads loop publishes those.
create or replace function public.claim_due_post()
returns setof public.posts
language sql
set search_path = ''
as $$
  update public.posts
     set status = 'publishing', locked_at = now(), attempt_count = attempt_count + 1, updated_at = now()
   where id = (
     select id
       from public.posts
      where instagram_enabled
        and ((status = 'scheduled' and coalesce(next_attempt_at, scheduled_at) <= now())
          or (status = 'publishing' and locked_at < now() - interval '10 minutes'))
      order by coalesce(next_attempt_at, scheduled_at)
      limit 1
      for update skip locked
   )
  returning *;
$$;

-- save_post as before, except that a post without Instagram can be scheduled without photos: its content is the
-- Threads chain.
create or replace function public.save_post(
  p_user_id      uuid,
  p_id           uuid,
  p_caption      text,
  p_status       text,
  p_scheduled_at timestamptz,
  p_asset_ids    uuid[]
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := p_id;
  v_instagram boolean := true;
begin
  if p_status not in ('draft', 'scheduled') then
    raise exception 'invalid_status';
  end if;
  if coalesce(cardinality(p_asset_ids), 0) > 10 then
    raise exception 'invalid_media';
  end if;
  if exists (
    select 1
      from unnest(p_asset_ids) as media (asset_id)
     where not exists (select 1 from public.assets where id = media.asset_id and user_id = p_user_id)
  ) then
    raise exception 'invalid_media';
  end if;

  if v_id is null then
    insert into public.posts (user_id, caption, status, scheduled_at)
    values (p_user_id, p_caption, p_status, p_scheduled_at)
    returning id into v_id;
  else
    update public.posts
       set caption = p_caption, status = p_status, scheduled_at = p_scheduled_at,
           attempt_count = 0, next_attempt_at = null, locked_at = null, last_error = null,
           updated_at = now()
     where id = v_id
       and user_id = p_user_id
       and status in ('draft', 'scheduled', 'failed', 'cancelled')
       and ig_container_id is null
    returning instagram_enabled into v_instagram;
    if not found then
      raise exception 'post_locked';
    end if;
    delete from public.post_media where post_id = v_id;
  end if;

  if p_status = 'scheduled' and v_instagram and coalesce(cardinality(p_asset_ids), 0) = 0 then
    raise exception 'invalid_media';
  end if;
  if p_status = 'scheduled' and not exists (
    select 1
      from public.posts p
      join public.instagram_connections c on c.user_id = p.user_id and c.instagram_user_id = p.account_id
     where p.id = v_id
  ) then
    raise exception 'wrong_account';
  end if;

  insert into public.post_media (post_id, asset_id, position)
  select v_id, media.asset_id, media.ordinality - 1
    from unnest(p_asset_ids) with ordinality as media (asset_id, ordinality);

  return v_id;
end;
$$;

-- Puts a post on the schedule without touching its content: Kalender's Pilih fills a slot with a finished draft.
-- The same checks as save_post: the worker doesn't own it, Instagram can't have it, a post for Instagram has photos,
-- and only the connected account's posts are scheduled.
create function public.schedule_post(p_user_id uuid, p_id uuid, p_scheduled_at timestamptz)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_instagram boolean;
begin
  update public.posts
     set status = 'scheduled', scheduled_at = p_scheduled_at,
         attempt_count = 0, next_attempt_at = null, locked_at = null, last_error = null,
         updated_at = now()
   where id = p_id
     and user_id = p_user_id
     and status in ('draft', 'scheduled', 'failed', 'cancelled')
     and ig_container_id is null
  returning instagram_enabled into v_instagram;
  if not found then
    raise exception 'post_locked';
  end if;
  if v_instagram and not exists (select 1 from public.post_media where post_id = p_id) then
    raise exception 'invalid_media';
  end if;
  if not exists (
    select 1
      from public.posts p
      join public.instagram_connections c on c.user_id = p.user_id and c.instagram_user_id = p.account_id
     where p.id = p_id
  ) then
    raise exception 'wrong_account';
  end if;
end;
$$;

-- Turns Instagram and Threads on or off for a post. A platform that already has the post, or is publishing it,
-- can't change. Threads switched on for a scheduled post goes at the post's time; for any other post it waits for
-- the schedule (or Terbitkan ke Threads).
create function public.set_post_platforms(p_user_id uuid, p_id uuid, p_instagram boolean, p_threads boolean)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_post public.posts;
  v_threads public.post_threads;
begin
  if not (p_instagram or p_threads) then
    raise exception 'no_platform';
  end if;
  select * into v_post from public.posts where id = p_id and user_id = p_user_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  select * into v_threads from public.post_threads where post_id = p_id for update;

  if v_post.instagram_enabled <> p_instagram
     and (v_post.status not in ('draft', 'scheduled', 'failed', 'cancelled')
       or v_post.ig_container_id is not null or v_post.ig_media_id is not null) then
    raise exception 'instagram_locked';
  end if;
  if coalesce(v_threads.enabled, false) <> p_threads
     and (v_threads.status in ('publishing', 'published') or v_post.status = 'publishing') then
    raise exception 'threads_locked';
  end if;
  if p_instagram and not v_post.instagram_enabled and v_post.status = 'scheduled'
     and not exists (select 1 from public.post_media where post_id = p_id) then
    raise exception 'invalid_media';
  end if;

  update public.posts set instagram_enabled = p_instagram, updated_at = now() where id = p_id;
  insert into public.post_threads (post_id, user_id, enabled, due_at)
  values (p_id, p_user_id, p_threads, case when v_post.status = 'scheduled' then v_post.scheduled_at end)
  on conflict (post_id) do update
     set enabled = excluded.enabled,
         due_at = case
           when public.post_threads.status in ('pending', 'failed') then excluded.due_at
           else public.post_threads.due_at
         end,
         status = case
           when excluded.enabled and public.post_threads.status = 'failed' and excluded.due_at is not null then 'pending'
           else public.post_threads.status
         end,
         updated_at = now();
end;
$$;

-- Replaces a post's Threads chain in one transaction; an empty chain makes it follow the caption again. A null post
-- starts a new post for Threads only, titled after its first line. Refused once the post is out of the owner's hands
-- (post_locked) or any item may already be on Threads (threads_locked).
create function public.save_thread_items(p_user_id uuid, p_post_id uuid, p_items jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := p_post_id;
  v_title text := left(btrim(split_part(coalesce(p_items -> 0 ->> 'text', ''), E'\n', 1)), 120);
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 10
     or (v_id is null and jsonb_array_length(p_items) = 0) then
    raise exception 'invalid_items';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_items) as item,
           jsonb_array_elements_text(coalesce(item -> 'asset_ids', '[]')) as media (asset_id)
     where not exists (select 1 from public.assets where id = media.asset_id::uuid and user_id = p_user_id)
  ) then
    raise exception 'invalid_media';
  end if;

  if v_id is null then
    insert into public.posts (user_id, title, caption, status, instagram_enabled)
    values (p_user_id, v_title, '', 'draft', false)
    returning id into v_id;
    insert into public.post_threads (post_id, user_id) values (v_id, p_user_id);
  else
    perform 1
       from public.posts
      where id = v_id and user_id = p_user_id and status in ('draft', 'scheduled', 'failed', 'cancelled')
        for update;
    if not found then
      raise exception 'post_locked';
    end if;
    if exists (select 1 from public.post_threads where post_id = v_id and status in ('publishing', 'published'))
       or exists (
         select 1 from public.thread_items
          where post_id = v_id and (container_id is not null or media_id is not null)
       ) then
      raise exception 'threads_locked';
    end if;
    delete from public.thread_items where post_id = v_id;
    if jsonb_array_length(p_items) > 0 then
      update public.posts set title = v_title, updated_at = now() where id = v_id and not instagram_enabled;
    end if;
  end if;

  insert into public.thread_items (post_id, position, text)
  select v_id, (items.ordinality - 1)::smallint, coalesce(items.item ->> 'text', '')
    from jsonb_array_elements(p_items) with ordinality as items (item, ordinality);
  insert into public.thread_item_media (post_id, item_position, position, asset_id)
  select v_id, (items.ordinality - 1)::smallint, (media.ordinality - 1)::smallint, media.asset_id::uuid
    from jsonb_array_elements(p_items) with ordinality as items (item, ordinality),
         jsonb_array_elements_text(coalesce(items.item -> 'asset_ids', '[]')) with ordinality as media (asset_id, ordinality);
  return v_id;
end;
$$;

-- The worker freezes a chain that still follows the caption into rows before publishing, so every item's container
-- and media id has a place. A post that already has items keeps them.
create function public.materialize_thread_items(p_post_id uuid, p_items jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.thread_items where post_id = p_post_id) then
    return;
  end if;
  insert into public.thread_items (post_id, position, text)
  select p_post_id, (items.ordinality - 1)::smallint, coalesce(items.item ->> 'text', '')
    from jsonb_array_elements(p_items) with ordinality as items (item, ordinality);
  insert into public.thread_item_media (post_id, item_position, position, asset_id)
  select p_post_id, (items.ordinality - 1)::smallint, (media.ordinality - 1)::smallint, media.asset_id::uuid
    from jsonb_array_elements(p_items) with ordinality as items (item, ordinality),
         jsonb_array_elements_text(coalesce(items.item -> 'asset_ids', '[]')) with ordinality as media (asset_id, ordinality);
end;
$$;

-- Hands one due Threads version to a worker, like claim_due_post. One stuck in `publishing` for 10 minutes belongs
-- to a crashed worker and is handed out again; its items' container ids keep the retry from posting twice. A post
-- without Instagram shows the Threads progress itself.
create function public.claim_due_threads()
returns table (post_id uuid, user_id uuid, account_id text, due_at timestamptz, attempt_count smallint)
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_post uuid;
begin
  select t.post_id into v_post
    from public.post_threads t
   where t.enabled
     and ((t.status = 'pending' and t.due_at is not null and coalesce(t.next_attempt_at, t.due_at) <= now())
       or (t.status = 'publishing' and t.locked_at < now() - interval '10 minutes'))
   order by coalesce(t.next_attempt_at, t.due_at)
   limit 1
   for update of t skip locked;
  if v_post is null then
    return;
  end if;

  update public.post_threads t
     set status = 'publishing', locked_at = now(), attempt_count = t.attempt_count + 1, updated_at = now()
   where t.post_id = v_post;
  update public.posts p
     set status = 'publishing', locked_at = now(),
         attempt_count = (select t.attempt_count from public.post_threads t where t.post_id = v_post),
         updated_at = now()
   where p.id = v_post and not p.instagram_enabled and p.status in ('scheduled', 'publishing');

  return query
    select t.post_id, t.user_id, p.account_id, t.due_at, t.attempt_count
      from public.post_threads t
      join public.posts p on p.id = t.post_id
     where t.post_id = v_post;
end;
$$;

-- Ends a Threads attempt: published, failed, or pending again at p_next_attempt_at. A post without Instagram takes
-- the same outcome (pending shows as scheduled with its retry time).
create function public.settle_threads(p_post_id uuid, p_status text, p_error text, p_next_attempt_at timestamptz)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_status not in ('pending', 'published', 'failed') then
    raise exception 'invalid_status';
  end if;
  update public.post_threads
     set status = p_status, locked_at = null, next_attempt_at = p_next_attempt_at, last_error = p_error,
         published_at = case when p_status = 'published' then now() else published_at end,
         updated_at = now()
   where post_id = p_post_id;
  update public.posts
     set status = case when p_status = 'pending' then 'scheduled' else p_status end,
         locked_at = null, next_attempt_at = p_next_attempt_at, last_error = p_error,
         published_at = case when p_status = 'published' then now() else published_at end,
         updated_at = now()
   where id = p_post_id and not instagram_enabled and status = 'publishing';
end;
$$;

-- Putuskan Instagram also removes the Threads connection: it was made for that account, and a token left behind
-- could no longer be removed from the app.
create or replace function public.disconnect_instagram(p_user_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_account text;
  v_drafted integer := 0;
begin
  select instagram_user_id into v_account from public.instagram_connections where user_id = p_user_id for update;
  if v_account is not null then
    v_drafted := public.draft_scheduled_posts(p_user_id, v_account);
  end if;
  delete from public.instagram_connections where user_id = p_user_id;
  delete from public.facebook_connections where user_id = p_user_id;
  delete from public.threads_connections where user_id = p_user_id;
  return v_drafted;
end;
$$;

revoke execute on function public.arm_threads() from public, anon, authenticated;
revoke execute on function public.claim_due_post() from public, anon, authenticated;
revoke execute on function public.save_post(uuid, uuid, text, text, timestamptz, uuid[]) from public, anon, authenticated;
revoke execute on function public.schedule_post(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.set_post_platforms(uuid, uuid, boolean, boolean) from public, anon, authenticated;
revoke execute on function public.save_thread_items(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.materialize_thread_items(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.claim_due_threads() from public, anon, authenticated;
revoke execute on function public.settle_threads(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.disconnect_instagram(uuid) from public, anon, authenticated;
grant execute on function public.claim_due_post() to service_role;
grant execute on function public.save_post(uuid, uuid, text, text, timestamptz, uuid[]) to service_role;
grant execute on function public.schedule_post(uuid, uuid, timestamptz) to service_role;
grant execute on function public.set_post_platforms(uuid, uuid, boolean, boolean) to service_role;
grant execute on function public.save_thread_items(uuid, uuid, jsonb) to service_role;
grant execute on function public.materialize_thread_items(uuid, jsonb) to service_role;
grant execute on function public.claim_due_threads() to service_role;
grant execute on function public.settle_threads(uuid, text, text, timestamptz) to service_role;
grant execute on function public.disconnect_instagram(uuid) to service_role;
