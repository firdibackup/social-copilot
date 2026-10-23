-- Ordered after the generation queue migrations, which are ahead of the local clock.
-- Serialize Sigap scheduling by account; recheck state after taking the job/post locks.
create function public.schedule_sigap_post(p_user_id uuid, p_account_id text, p_id uuid, p_scheduled_at timestamptz)
returns void language plpgsql set search_path = '' as $$
declare v_post public.posts;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_account_id || ':schedule', 0));
  perform 1 from public.content_jobs where post_id = p_id for update;
  select * into v_post from public.posts where id = p_id and user_id = p_user_id and account_id = p_account_id for update;
  if not found then raise exception 'wrong_account'; end if;
  if v_post.status = 'scheduled' and v_post.scheduled_at = p_scheduled_at then return; end if;
  if v_post.status <> 'draft' or v_post.ig_container_id is not null then raise exception 'post_locked'; end if;
  if p_scheduled_at is null or p_scheduled_at < now() + interval '2 minutes' then raise exception 'invalid_time'; end if;
  if exists(select 1 from public.content_jobs where post_id = p_id and (kind = 'script' or status <> 'ready'))
    or exists(select 1 from public.post_slides where post_id = p_id and status <> 'ready')
    or exists(select 1 from public.slide_edit_jobs where post_id = p_id and status = 'running') then
    raise exception 'content_not_ready';
  end if;
  if exists(select 1 from public.posts where user_id = p_user_id and account_id = p_account_id
    and id <> p_id and scheduled_at = p_scheduled_at and status in ('scheduled', 'publishing', 'published')) then
    raise exception 'slot_taken';
  end if;
  perform public.schedule_post(p_user_id, p_id, p_scheduled_at);
end $$;
revoke execute on function public.schedule_sigap_post(uuid,text,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.schedule_sigap_post(uuid,text,uuid,timestamptz) to service_role;
