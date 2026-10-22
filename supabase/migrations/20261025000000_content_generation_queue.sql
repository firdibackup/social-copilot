-- Durable draft jobs. Only the service role can enqueue/claim/finish work.
create table public.content_jobs (
  post_id uuid primary key references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id text not null,
  idea_id uuid,
  request_key uuid not null,
  kind text not null check (kind in ('script', 'content')),
  status text not null default 'pending' check (status in ('pending', 'running', 'ready', 'failed')),
  payload jsonb not null,
  error text,
  attempts integer not null default 0,
  lease uuid,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, request_key),
  unique (user_id, account_id, idea_id)
);
alter table public.content_jobs enable row level security;
revoke all on public.content_jobs from anon, authenticated;
grant all on public.content_jobs to service_role;
create index content_jobs_pending_idx on public.content_jobs(created_at) where status in ('pending', 'running');

create function public.enqueue_content_job(p_user_id uuid, p_account_id text, p_request_key uuid,
  p_idea_id uuid, p_kind text, p_payload jsonb)
returns uuid language plpgsql set search_path = '' as $$
declare v_job public.content_jobs; v_idea public.content_ideas; v_id uuid;
begin
  -- Serialize submissions for this owner, including retries from another tab.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  if not exists (select 1 from public.instagram_connections where user_id = p_user_id and instagram_user_id = p_account_id) then
    raise exception 'wrong_account';
  end if;
  select * into v_job from public.content_jobs where user_id = p_user_id and
    (request_key = p_request_key or (account_id = p_account_id and idea_id = p_idea_id)) limit 1 for update;
  if found then
    if v_job.account_id <> p_account_id then raise exception 'wrong_account'; end if;
    if p_kind = 'content' and v_job.kind = 'script' then
      if v_job.status <> 'ready' then raise exception 'script_not_ready'; end if;
      update public.content_jobs set kind = 'content', status = 'pending', payload = p_payload,
        attempts = 0, error = null, lease = null where post_id = v_job.post_id;
    end if;
    return v_job.post_id;
  end if;
  if p_idea_id is not null then
    select * into v_idea from public.content_ideas where id = p_idea_id and user_id = p_user_id and account_id = p_account_id;
    if not found then raise exception 'idea_not_found'; end if;
  end if;
  insert into public.posts(user_id, account_id, title, caption, status, pillar_id)
    values(p_user_id, p_account_id, coalesce(v_idea.title, p_payload->'request'->>'topic', 'Draft baru'), '', 'draft', v_idea.pillar_id)
    returning id into v_id;
  insert into public.content_jobs(post_id, user_id, account_id, idea_id, request_key, kind, payload, status)
    values(v_id, p_user_id, p_account_id, p_idea_id, p_request_key, p_kind, p_payload,
      case when p_kind = 'script' and v_idea.script is not null then 'ready' else 'pending' end);
  return v_id;
end $$;

-- A placeholder must never publish while a worker is assembling it.
create function public.guard_content_draft() returns trigger language plpgsql set search_path = '' as $$
begin
  if exists(select 1 from public.content_jobs where post_id = old.id and (kind = 'script' or status <> 'ready')) then
    if new.status <> 'draft' then raise exception 'post_locked'; end if;
  end if;
  return new;
end $$;
create trigger guard_content_draft before update on public.posts for each row execute function public.guard_content_draft();

create function public.claim_content_job() returns setof public.content_jobs
language plpgsql set search_path = '' as $$
declare v_id uuid;
begin
  update public.content_jobs set status = 'failed', error = 'Proses terhenti berulang kali. Klik Coba lagi.', lease = null
    where status = 'running' and claimed_at < now() - interval '10 minutes' and attempts >= 3;
  select post_id into v_id from public.content_jobs
    where status = 'pending' or (status = 'running' and claimed_at < now() - interval '10 minutes' and attempts < 3)
    order by created_at for update skip locked limit 1;
  if v_id is null then return; end if;
  return query update public.content_jobs set status = 'running', lease = gen_random_uuid(),
    claimed_at = now(), attempts = attempts + 1 where post_id = v_id returning *;
end $$;

create function public.finish_script_job(p_post_id uuid, p_lease uuid, p_script jsonb)
returns void language plpgsql set search_path = '' as $$
declare v_job public.content_jobs;
begin
  select * into v_job from public.content_jobs where post_id = p_post_id and lease = p_lease and status = 'running' and kind = 'script' for update;
  if not found then raise exception 'job_not_claimed'; end if;
  update public.content_ideas set script = p_script where id = v_job.idea_id and user_id = v_job.user_id and account_id = v_job.account_id;
  if not found then raise exception 'idea_not_found'; end if;
  update public.content_jobs set status = 'ready', lease = null, error = null where post_id = p_post_id;
end $$;

-- Reuse the existing validated slide writer, then move its output into the already-visible draft atomically.
create function public.finish_content_job(p_post_id uuid, p_lease uuid, p_title text, p_caption text, p_slides jsonb, p_pillar_id text)
returns uuid language plpgsql set search_path = '' as $$
declare v_job public.content_jobs; v_generated uuid;
begin
  select * into v_job from public.content_jobs where post_id = p_post_id and lease = p_lease and status = 'running' and kind = 'content' for update;
  if not found then raise exception 'job_not_claimed'; end if;
  if not exists (select 1 from public.instagram_connections where user_id = v_job.user_id and instagram_user_id = v_job.account_id) then
    raise exception 'wrong_account';
  end if;
  perform 1 from public.posts where id = p_post_id and status = 'draft' and ig_container_id is null for update;
  if not found then raise exception 'post_locked'; end if;
  v_generated := public.create_content(v_job.user_id, p_title, p_caption, p_slides, v_job.idea_id, p_pillar_id);
  update public.post_slides set post_id = p_post_id where post_id = v_generated;
  update public.posts set title = p_title, caption = p_caption, pillar_id = p_pillar_id, updated_at = now() where id = p_post_id;
  delete from public.posts where id = v_generated;
  update public.content_jobs set status = 'ready', lease = null, error = null where post_id = p_post_id;
  return p_post_id;
end $$;

revoke execute on function public.enqueue_content_job(uuid,text,uuid,uuid,text,jsonb), public.claim_content_job(),
  public.finish_script_job(uuid,uuid,jsonb), public.finish_content_job(uuid,uuid,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.enqueue_content_job(uuid,text,uuid,uuid,text,jsonb), public.claim_content_job(),
  public.finish_script_job(uuid,uuid,jsonb), public.finish_content_job(uuid,uuid,text,text,jsonb,text) to service_role;
