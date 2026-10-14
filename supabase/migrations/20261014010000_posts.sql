-- Kalender, Aset and the publishing worker. Same rules as the foundation: RLS on with no
-- policies, so only the server's service-role key can read or write.

create table public.assets (
  id           uuid primary key default gen_random_uuid(),
  storage_path text not null unique, -- object in the private `media` bucket
  width        integer not null check (width > 0),
  height       integer not null check (height > 0),
  size_bytes   integer not null check (size_bytes > 0),
  created_at   timestamptz not null default now()
);

create table public.posts (
  id              uuid primary key default gen_random_uuid(),
  caption         text not null default '' check (char_length(caption) <= 2200),
  status          text not null default 'draft'
                  check (status in ('draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled')),
  scheduled_at    timestamptz,
  published_at    timestamptz,
  attempt_count   smallint not null default 0,
  next_attempt_at timestamptz, -- retry time; null means scheduled_at
  locked_at       timestamptz, -- when a worker claimed the post
  last_error      text,
  ig_container_id text,        -- set means Instagram may already have published it: content is locked
  ig_media_id     text,
  ig_permalink    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (status not in ('scheduled', 'publishing') or scheduled_at is not null)
);

create table public.post_media (
  post_id  uuid not null references public.posts (id) on delete cascade,
  asset_id uuid not null references public.assets (id) on delete restrict, -- a photo in use can't be deleted
  position smallint not null check (position between 0 and 9),           -- Instagram allows 10 per carousel
  primary key (post_id, position)
);

create index post_media_asset_id_idx on public.post_media (asset_id);

create table public.publish_attempts (
  id          bigint generated always as identity primary key,
  post_id     uuid not null references public.posts (id) on delete cascade,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  outcome     text check (outcome in ('published', 'retry', 'failed')),
  error       text
);

create index publish_attempts_post_id_idx on public.publish_attempts (post_id);

-- Hands one due post to a worker. SKIP LOCKED keeps two workers off the same post. A post stuck in
-- 'publishing' for 10 minutes belongs to a crashed worker and is handed out again; the worker then asks
-- Instagram about ig_container_id before publishing, so the retry can't post twice.
create function public.claim_due_post()
returns setof public.posts
language sql
set search_path = ''
as $$
  update public.posts
     set status = 'publishing', locked_at = now(), attempt_count = attempt_count + 1, updated_at = now()
   where id = (
     select id
       from public.posts
      where (status = 'scheduled' and coalesce(next_attempt_at, scheduled_at) <= now())
         or (status = 'publishing' and locked_at < now() - interval '10 minutes')
      order by coalesce(next_attempt_at, scheduled_at)
      limit 1
      for update skip locked
   )
  returning *;
$$;

-- Saves the editor's content in one transaction, so the worker never sees a half-replaced media list.
-- Posts the worker owns, and posts Instagram may already have (ig_container_id set), raise post_locked.
create function public.save_post(
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
begin
  if p_status not in ('draft', 'scheduled') then
    raise exception 'invalid_status';
  end if;
  if p_status = 'scheduled' and coalesce(cardinality(p_asset_ids), 0) not between 1 and 10 then
    raise exception 'invalid_media';
  end if;

  if v_id is null then
    insert into public.posts (caption, status, scheduled_at)
    values (p_caption, p_status, p_scheduled_at)
    returning id into v_id;
  else
    update public.posts
       set caption = p_caption, status = p_status, scheduled_at = p_scheduled_at,
           attempt_count = 0, next_attempt_at = null, locked_at = null, last_error = null,
           updated_at = now()
     where id = v_id
       and status in ('draft', 'scheduled', 'failed', 'cancelled')
       and ig_container_id is null;
    if not found then
      raise exception 'post_locked';
    end if;
    delete from public.post_media where post_id = v_id;
  end if;

  insert into public.post_media (post_id, asset_id, position)
  select v_id, media.asset_id, media.ordinality - 1
    from unnest(p_asset_ids) with ordinality as media (asset_id, ordinality);

  return v_id;
end;
$$;

-- Private bucket: Meta gets short-lived signed URLs. Older self-hosted Storage versions ignore the
-- size and type limits, so the upload action checks them too.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 8388608, array['image/jpeg']);

alter table public.assets enable row level security;
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.publish_attempts enable row level security;

revoke all on public.assets, public.posts, public.post_media, public.publish_attempts from anon, authenticated;
revoke all on sequence public.publish_attempts_id_seq from anon, authenticated;

revoke execute on function public.claim_due_post() from public, anon, authenticated;
revoke execute on function public.save_post(uuid, text, text, timestamptz, uuid[]) from public, anon, authenticated;
grant execute on function public.claim_due_post() to service_role;
grant execute on function public.save_post(uuid, text, text, timestamptz, uuid[]) to service_role;
