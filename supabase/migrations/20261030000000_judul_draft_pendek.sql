-- A long composer brief (a full design spec pasted into chat) became the placeholder post's title and broke
-- posts_title_check (<= 120). The placeholder now takes the brief's first line, cut to 120 characters;
-- the planner's own title replaces it when the draft finishes.
create or replace function public.enqueue_content_job(p_user_id uuid, p_account_id text, p_request_key uuid,
  p_idea_id uuid, p_kind text, p_payload jsonb)
returns uuid language plpgsql set search_path = '' as $$
declare v_job public.content_jobs; v_idea public.content_ideas; v_id uuid; v_title text;
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
  v_title := left(btrim(split_part(coalesce(v_idea.title, p_payload->'request'->>'topic', ''), E'\n', 1)), 120);
  insert into public.posts(user_id, account_id, title, caption, status, pillar_id)
    values(p_user_id, p_account_id, coalesce(nullif(v_title, ''), 'Draft baru'), '', 'draft', v_idea.pillar_id)
    returning id into v_id;
  insert into public.content_jobs(post_id, user_id, account_id, idea_id, request_key, kind, payload, status)
    values(v_id, p_user_id, p_account_id, p_idea_id, p_request_key, p_kind, p_payload,
      case when p_kind = 'script' and v_idea.script is not null then 'ready' else 'pending' end);
  return v_id;
end $$;

revoke execute on function public.enqueue_content_job(uuid,text,uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.enqueue_content_job(uuid,text,uuid,uuid,text,jsonb) to service_role;
