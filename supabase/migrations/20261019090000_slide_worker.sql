-- AI slides are made by the worker, not the browser: a slide is made even when the owner closes the tab.
-- attempt_count counts the worker's tries; a slide that failed for a passing reason waits for next_attempt_at.
alter table public.post_slides
  add column attempt_count   smallint not null default 0,
  add column next_attempt_at timestamptz;

create index post_slides_queue_idx on public.post_slides (status, next_attempt_at) where status in ('pending', 'generating');

-- Hands the worker the next slide due. Within a post, slides go one at a time in carousel order, so later inner
-- slides can follow the first one; different posts run side by side. A generating slide is taken again after
-- 5 minutes, when its generator has evidently died.
create function public.claim_next_slide()
returns setof public.post_slides
language sql
set search_path = ''
as $$
  update public.post_slides
     set status = 'generating', claimed_at = now(), attempt_count = attempt_count + 1, updated_at = now()
   where id = (
     select s.id
       from public.post_slides s
      where ((s.status = 'pending' and coalesce(s.next_attempt_at, s.created_at) <= now())
          or (s.status = 'generating' and s.claimed_at < now() - interval '5 minutes'))
        and not exists (
          select 1
            from public.post_slides e
           where e.post_id = s.post_id
             and e.id <> s.id
             and ((e.status = 'generating' and e.claimed_at >= now() - interval '5 minutes')
               or (e.position < s.position and e.status in ('pending', 'generating')))
        )
      order by coalesce(s.next_attempt_at, s.created_at), s.position
      limit 1
      for update of s skip locked
   )
  returning *;
$$;

-- A slide that failed for a passing reason goes back to the queue, after p_delay.
create function public.requeue_slide(p_id uuid, p_error text, p_delay interval)
returns void
language sql
set search_path = ''
as $$
  update public.post_slides
     set status = 'pending', error = p_error, next_attempt_at = now() + p_delay, updated_at = now()
   where id = p_id and status = 'generating';
$$;

-- The owner's Coba lagi: a failed slide goes back to the queue with fresh attempts. False when it isn't failed.
create function public.retry_slide(p_user_id uuid, p_id uuid)
returns boolean
language sql
set search_path = ''
as $$
  with retried as (
    update public.post_slides
       set status = 'pending', error = null, attempt_count = 0, next_attempt_at = null, updated_at = now()
     where id = p_id and user_id = p_user_id and status = 'failed'
    returning id
  )
  select exists (select 1 from retried);
$$;

revoke execute on function public.claim_next_slide() from public, anon, authenticated;
revoke execute on function public.requeue_slide(uuid, text, interval) from public, anon, authenticated;
revoke execute on function public.retry_slide(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_next_slide() to service_role;
grant execute on function public.requeue_slide(uuid, text, interval) to service_role;
grant execute on function public.retry_slide(uuid, uuid) to service_role;
