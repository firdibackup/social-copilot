-- Mimo answers in the background. A message becomes a job; the worker answers it, so the answer arrives even when
-- the owner closes the tab or leaves the page, and is not bound to a web request's time limit.
create table public.chat_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id text not null,
  session_id uuid not null references public.chat_sessions (id) on delete cascade,
  -- The owner's message this job answers, and the answer once it is stored.
  user_message_id uuid not null references public.chat_messages (id) on delete cascade,
  assistant_message_id uuid references public.chat_messages (id) on delete set null,
  -- What the worker needs to answer: the turn (text, small images, PDF text), the languages, the research toggle.
  -- Emptied when the job ends: it may hold the owner's attachments.
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  -- The tool Mimo is using right now, for the waiting line in the chat.
  tool text,
  attempts integer not null default 0,
  -- Refreshed while the worker works on it: a job whose worker died is taken again.
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index chat_jobs_queue on public.chat_jobs (created_at) where status in ('pending', 'running');
create index chat_jobs_session on public.chat_jobs (session_id, created_at desc);
alter table public.chat_jobs enable row level security;
revoke all on public.chat_jobs from anon, authenticated;
grant all on public.chat_jobs to service_role;

-- The next job: the oldest waiting one, or one whose worker stopped sending signs of life. A job that was already
-- tried twice fails instead, so a message that crashes the worker cannot loop.
create function public.claim_chat_job() returns setof public.chat_jobs
language plpgsql set search_path = '' as $$
declare v_id uuid;
begin
  update public.chat_jobs set status = 'failed', payload = '{}'::jsonb, tool = null, finished_at = now()
    where status = 'running' and claimed_at < now() - interval '90 seconds' and attempts >= 2;
  select j.id into v_id from public.chat_jobs j
    where j.status = 'pending' or (j.status = 'running' and j.claimed_at < now() - interval '90 seconds' and j.attempts < 2)
    order by j.created_at
    for update skip locked limit 1;
  if v_id is null then return; end if;
  return query update public.chat_jobs set status = 'running', claimed_at = now(), attempts = attempts + 1, tool = null
    where id = v_id returning *;
end $$;

revoke execute on function public.claim_chat_job() from public, anon, authenticated;
grant execute on function public.claim_chat_job() to service_role;
