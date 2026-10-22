-- Follows content_generation_queue, whose timestamp is already ahead of the local clock.
alter table public.content_jobs drop constraint content_jobs_status_check;
alter table public.content_jobs add constraint content_jobs_status_check
  check (status in ('pending', 'running', 'ready', 'failed', 'cancelled'));
alter table public.post_slides drop constraint post_slides_status_check;
alter table public.post_slides add constraint post_slides_status_check
  check (status in ('pending', 'generating', 'ready', 'failed', 'cancelled'));
alter table public.post_slides add column lease uuid;

-- Inline image revisions need a durable cancellation token too: Next actions are serialized per tab.
create table public.slide_edit_jobs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  status text not null check (status in ('running', 'ready', 'failed', 'cancelled')),
  created_at timestamptz not null default now()
);
alter table public.slide_edit_jobs enable row level security;
revoke all on public.slide_edit_jobs from anon, authenticated;
grant all on public.slide_edit_jobs to service_role;
create index slide_edit_jobs_post_idx on public.slide_edit_jobs(post_id);

-- Lock in the same order as finish_content_job: job, post, slides. A completed plan may have
-- queued images just before cancellation; cancel those in the same transaction as the job.
create function public.cancel_generation(p_user_id uuid, p_account_id text, p_post_id uuid,
  p_target text, p_id uuid default null)
returns boolean language plpgsql set search_path = '' as $$
declare v_changed integer := 0; v_rows integer := 0;
begin
  if p_target not in ('content', 'images', 'slide', 'edit') then raise exception 'invalid_target'; end if;
  if p_target in ('slide', 'edit') and p_id is null then raise exception 'invalid_target'; end if;
  perform 1 from public.content_jobs where post_id = p_post_id and user_id = p_user_id and account_id = p_account_id for update;
  perform 1 from public.posts where id = p_post_id and user_id = p_user_id and account_id = p_account_id
    and status in ('draft', 'scheduled', 'failed', 'cancelled') and ig_container_id is null for update;
  if not found then return false; end if;

  if p_target = 'edit' then
    -- A cancellation arriving before the server action starts leaves a tombstone.
    insert into public.slide_edit_jobs(id, user_id, post_id, status)
      values(p_id, p_user_id, p_post_id, 'cancelled')
      on conflict(id) do update set status = 'cancelled'
        where slide_edit_jobs.user_id = p_user_id and slide_edit_jobs.post_id = p_post_id
          and slide_edit_jobs.status in ('running', 'cancelled');
    get diagnostics v_changed = row_count;
    return v_changed > 0;
  end if;

  if p_target = 'content' then
    update public.content_jobs set status = 'cancelled', lease = null, error = null
      where post_id = p_post_id and user_id = p_user_id and account_id = p_account_id
        and status in ('pending', 'running', 'cancelled');
    get diagnostics v_changed = row_count;
  end if;
  update public.post_slides set status = 'cancelled', lease = null, error = null,
    next_attempt_at = null, updated_at = now()
    where post_id = p_post_id and user_id = p_user_id and status in ('pending', 'generating', 'cancelled')
      and (p_target <> 'slide' or id = p_id);
  get diagnostics v_rows = row_count;
  return v_changed + v_rows > 0;
end $$;

create or replace function public.claim_next_slide()
returns setof public.post_slides language sql set search_path = '' as $$
  update public.post_slides set status = 'generating', lease = gen_random_uuid(), claimed_at = now(),
    attempt_count = attempt_count + 1, updated_at = now()
  where id = (
    select s.id from public.post_slides s
    where ((s.status = 'pending' and coalesce(s.next_attempt_at, s.created_at) <= now())
      or (s.status = 'generating' and s.claimed_at < now() - interval '5 minutes'))
    and not exists (
      select 1 from public.post_slides e where e.post_id = s.post_id and e.id <> s.id
        and ((e.status = 'generating' and e.claimed_at >= now() - interval '5 minutes')
          or (e.position < s.position and e.status in ('pending', 'generating')))
    )
    order by coalesce(s.next_attempt_at, s.created_at), s.position limit 1 for update of s skip locked
  ) returning *;
$$;

create or replace function public.retry_slide(p_user_id uuid, p_id uuid)
returns boolean language sql set search_path = '' as $$
  with retried as (
    update public.post_slides set status = 'pending', lease = null, error = null, attempt_count = 0,
      next_attempt_at = null, updated_at = now()
    where id = p_id and user_id = p_user_id and status in ('failed', 'cancelled') returning id
  ) select exists(select 1 from retried);
$$;

-- Fence every result with its exact attempt, including cancel -> retry before an old provider answers.
create function public.attach_claimed_slide(p_slide_id uuid, p_asset_id uuid, p_lease uuid)
returns void language plpgsql set search_path = '' as $$
begin
  perform 1 from public.posts where id = (select post_id from public.post_slides where id = p_slide_id) for update;
  perform 1 from public.post_slides where id = p_slide_id and status = 'generating' and lease = p_lease for update;
  if not found then raise exception 'slide_not_claimed'; end if;
  perform public.attach_slide(p_slide_id, p_asset_id);
  update public.post_slides set lease = null where id = p_slide_id;
end $$;

create function public.begin_slide_edit(p_user_id uuid, p_account_id text, p_post_id uuid, p_id uuid)
returns boolean language plpgsql set search_path = '' as $$
begin
  perform 1 from public.posts where id = p_post_id and user_id = p_user_id and account_id = p_account_id
    and status in ('draft', 'scheduled', 'failed', 'cancelled') and ig_container_id is null for update;
  if not found then raise exception 'post_locked'; end if;
  insert into public.slide_edit_jobs(id, user_id, post_id, status) values(p_id, p_user_id, p_post_id, 'running')
    on conflict(id) do nothing;
  return found;
end $$;

create function public.finish_slide_edit(p_user_id uuid, p_id uuid, p_replacement jsonb)
returns void language plpgsql set search_path = '' as $$
declare v_post uuid;
begin
  select post_id into v_post from public.slide_edit_jobs where id = p_id and user_id = p_user_id;
  perform 1 from public.posts where id = v_post for update;
  perform 1 from public.slide_edit_jobs where id = p_id and user_id = p_user_id and status = 'running' for update;
  if not found then raise exception 'generation_cancelled'; end if;
  perform public.replace_slide(p_user_id, v_post, (p_replacement->>'oldAssetId')::uuid,
    (p_replacement->>'newAssetId')::uuid, p_replacement->>'headline', p_replacement->>'scene',
    p_replacement->>'format', p_replacement->>'role', (p_replacement->>'referenceImageId')::uuid,
    (p_replacement->>'productGroupId')::uuid, (p_replacement->>'includeLogo')::boolean, p_replacement->>'example');
  update public.slide_edit_jobs set status = 'ready' where id = p_id;
end $$;

revoke execute on function public.cancel_generation(uuid,text,uuid,text,uuid),
  public.attach_claimed_slide(uuid,uuid,uuid), public.begin_slide_edit(uuid,text,uuid,uuid),
  public.finish_slide_edit(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.cancel_generation(uuid,text,uuid,text,uuid),
  public.attach_claimed_slide(uuid,uuid,uuid), public.begin_slide_edit(uuid,text,uuid,uuid),
  public.finish_slide_edit(uuid,uuid,jsonb) to service_role;
