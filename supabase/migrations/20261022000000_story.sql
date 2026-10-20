-- Selalu bagikan ke Story: an Instagram post's first slide also goes out as a 9:16 Story once the feed post is out.
-- The account setting is only the default; every post keeps its own choice, taken when the post is made.

-- 1. The account default lives next to its posting slots. A row made only for this switch must not turn the slots
-- custom, so slots may now be null: "follow the Brand strategy", as with no row at all.
alter table public.schedule_settings
  alter column slots drop not null,
  alter column slots set default null,
  add column always_share_to_story boolean not null default false;

-- 2. A post's Story, published apart from the feed post: a failed Story never fails the post. due_at stays null until
-- the feed post is out. container_id is saved before publishing, so a retry asks Instagram first.
create table public.post_stories (
  post_id         uuid primary key references public.posts (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  enabled         boolean not null default true,
  status          text not null default 'pending'
                  check (status in ('pending', 'publishing', 'published', 'failed')),
  due_at          timestamptz,
  attempt_count   smallint not null default 0,
  next_attempt_at timestamptz,
  locked_at       timestamptz,
  last_error      text,
  container_id    text,
  media_id        text,
  published_at    timestamptz,
  updated_at      timestamptz not null default now()
);

create index post_stories_due_idx on public.post_stories (coalesce(next_attempt_at, due_at))
  where enabled and status in ('pending', 'publishing');

alter table public.post_stories enable row level security;
revoke all on public.post_stories from anon, authenticated;

-- 3. A new post takes the account default, on every path that makes posts (editor, AI, Threads, duplicate). After
-- stamp_account, so account_id is set. A post made for Threads only keeps the choice too: it applies once Instagram is
-- switched on.
create function public.snapshot_story()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.account_id is not null and exists (
    select 1 from public.schedule_settings s
     where s.user_id = new.user_id and s.account_id = new.account_id and s.always_share_to_story
  ) then
    insert into public.post_stories (post_id, user_id) values (new.id, new.user_id) on conflict (post_id) do nothing;
  end if;
  return null;
end;
$$;

create trigger snapshot_story after insert on public.posts for each row execute function public.snapshot_story();

-- 4. The feed post going out arms its Story. Every path to published (a fresh publish, or a container Instagram
-- reports as already published) goes through this.
create function public.arm_story()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.post_stories
     set due_at = now(), next_attempt_at = null, updated_at = now()
   where post_id = new.id and enabled and status = 'pending' and due_at is null;
  return null;
end;
$$;

create trigger arm_story
  after update of status on public.posts
  for each row
  when (new.status = 'published' and old.status is distinct from 'published')
  execute function public.arm_story();

-- Hands one due Story to a worker, like claim_due_threads. Only while its post is out on Instagram. One stuck in
-- `publishing` for 10 minutes belongs to a crashed worker; its container keeps the retry from posting twice.
create function public.claim_due_story()
returns table (post_id uuid, user_id uuid, account_id text, due_at timestamptz, attempt_count smallint, container_id text)
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_post uuid;
begin
  select s.post_id into v_post
    from public.post_stories s
    join public.posts p on p.id = s.post_id
   where s.enabled and p.instagram_enabled and p.status = 'published'
     and ((s.status = 'pending' and s.due_at is not null and coalesce(s.next_attempt_at, s.due_at) <= now())
       or (s.status = 'publishing' and s.locked_at < now() - interval '10 minutes'))
   order by coalesce(s.next_attempt_at, s.due_at)
   limit 1
   for update of s skip locked;
  if v_post is null then
    return;
  end if;

  update public.post_stories s
     set status = 'publishing', locked_at = now(), attempt_count = s.attempt_count + 1, updated_at = now()
   where s.post_id = v_post;

  return query
    select s.post_id, s.user_id, p.account_id, s.due_at, s.attempt_count, s.container_id
      from public.post_stories s
      join public.posts p on p.id = s.post_id
     where s.post_id = v_post;
end;
$$;

-- Ends a Story attempt: published (with its media id), failed, or pending again at p_next_attempt_at. A failure that
-- proved nothing went out clears the container.
create function public.settle_story(
  p_post_id         uuid,
  p_status          text,
  p_error           text,
  p_next_attempt_at timestamptz,
  p_media_id        text,
  p_clear_container boolean
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_status not in ('pending', 'published', 'failed') then
    raise exception 'invalid_status';
  end if;
  update public.post_stories
     set status = p_status, locked_at = null, next_attempt_at = p_next_attempt_at, last_error = p_error,
         media_id = coalesce(p_media_id, media_id),
         container_id = case when p_clear_container then null else container_id end,
         published_at = case when p_status = 'published' then now() else published_at end,
         updated_at = now()
   where post_id = p_post_id;
end;
$$;

-- Coba lagi for a failed Story: it goes now, with fresh attempts. Its container stays, so the worker asks Instagram
-- about it before publishing again.
create function public.retry_story(p_user_id uuid, p_post_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.post_stories s
     set status = 'pending', due_at = now(), attempt_count = 0, next_attempt_at = null, last_error = null,
         updated_at = now()
    from public.posts p
   where s.post_id = p_post_id and s.user_id = p_user_id and s.enabled and s.status = 'failed'
     and p.id = s.post_id and p.status = 'published' and p.instagram_enabled;
  return found;
end;
$$;

-- The account's scheduled Instagram posts that don't share to Story yet: what "Terapkan ke post terjadwal" changes.
create function public.story_candidates(p_user_id uuid, p_account_id text)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
    from public.posts p
    left join public.post_stories s on s.post_id = p.id
   where p.user_id = p_user_id and p.account_id = p_account_id and p.status = 'scheduled' and p.instagram_enabled
     and coalesce(s.enabled, false) = false;
$$;

-- Turns Story on for those posts. Returns how many changed.
create function public.apply_story_to_scheduled(p_user_id uuid, p_account_id text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.post_stories (post_id, user_id, enabled)
  select p.id, p.user_id, true
    from public.posts p
   where p.user_id = p_user_id and p.account_id = p_account_id and p.status = 'scheduled' and p.instagram_enabled
  on conflict (post_id) do update
     set enabled = true, status = 'pending', due_at = null, attempt_count = 0, next_attempt_at = null,
         last_error = null, updated_at = now()
   where not public.post_stories.enabled and public.post_stories.status <> 'published';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 5. set_post_platforms gains the Story choice. It can't change once the post is publishing or out, or the Story may
-- already be on Instagram. With Instagram off the Story choice is kept as it was.
drop function public.set_post_platforms(uuid, uuid, boolean, boolean);

create function public.set_post_platforms(
  p_user_id   uuid,
  p_id        uuid,
  p_instagram boolean,
  p_threads   boolean,
  p_story     boolean
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_post public.posts;
  v_threads public.post_threads;
  v_story public.post_stories;
begin
  if not (p_instagram or p_threads) then
    raise exception 'no_platform';
  end if;
  select * into v_post from public.posts where id = p_id and user_id = p_user_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  select * into v_threads from public.post_threads where post_id = p_id for update;
  select * into v_story from public.post_stories where post_id = p_id for update;

  if v_post.instagram_enabled <> p_instagram
     and (v_post.status not in ('draft', 'scheduled', 'failed', 'cancelled')
       or v_post.ig_container_id is not null or v_post.ig_media_id is not null) then
    raise exception 'instagram_locked';
  end if;
  if coalesce(v_threads.enabled, false) <> p_threads
     and (v_threads.status in ('publishing', 'published') or v_post.status = 'publishing') then
    raise exception 'threads_locked';
  end if;
  if p_instagram and coalesce(v_story.enabled, false) <> p_story
     and (v_post.status in ('publishing', 'published') or v_post.ig_container_id is not null
       or v_story.status in ('publishing', 'published') or v_story.container_id is not null) then
    raise exception 'story_locked';
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
  if p_instagram and coalesce(v_story.enabled, false) <> p_story then
    insert into public.post_stories (post_id, user_id, enabled)
    values (p_id, p_user_id, p_story)
    on conflict (post_id) do update
       set enabled = excluded.enabled, status = 'pending', due_at = null, attempt_count = 0, next_attempt_at = null,
           last_error = null, updated_at = now();
  end if;
end;
$$;

revoke execute on function public.snapshot_story() from public, anon, authenticated;
revoke execute on function public.arm_story() from public, anon, authenticated;
revoke execute on function public.claim_due_story() from public, anon, authenticated;
revoke execute on function public.settle_story(uuid, text, text, timestamptz, text, boolean) from public, anon, authenticated;
revoke execute on function public.retry_story(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.story_candidates(uuid, text) from public, anon, authenticated;
revoke execute on function public.apply_story_to_scheduled(uuid, text) from public, anon, authenticated;
revoke execute on function public.set_post_platforms(uuid, uuid, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.claim_due_story() to service_role;
grant execute on function public.settle_story(uuid, text, text, timestamptz, text, boolean) to service_role;
grant execute on function public.retry_story(uuid, uuid) to service_role;
grant execute on function public.story_candidates(uuid, text) to service_role;
grant execute on function public.apply_story_to_scheduled(uuid, text) to service_role;
grant execute on function public.set_post_platforms(uuid, uuid, boolean, boolean, boolean) to service_role;
