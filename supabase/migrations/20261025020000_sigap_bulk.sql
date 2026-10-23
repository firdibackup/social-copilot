-- Sigap's bulk_content card moves proposed → starting → started (or proposed → cancelled; starting → proposed when
-- nothing could be queued). Each move is a compare-and-set on the card under the message's row lock.
create function public.update_sigap_bulk(
  p_user_id uuid,
  p_account_id text,
  p_message_id uuid,
  p_bulk_id uuid,
  p_from text,
  p_patch jsonb
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_parts jsonb;
  v_card jsonb;
begin
  if coalesce(p_patch ->> 'state', '') not in ('proposed', 'starting', 'started', 'cancelled') then raise exception 'invalid_state'; end if;

  select m.parts into v_parts
  from public.chat_messages m
  join public.chat_sessions s on s.id = m.session_id
  where m.id = p_message_id and m.user_id = p_user_id
    and s.user_id = p_user_id and s.account_id = p_account_id
  for update of m;

  if v_parts is null then return 'not_found'; end if;

  select part into v_card
  from jsonb_array_elements(v_parts) as cards(part)
  where part ->> 'type' = 'bulk' and part ->> 'id' = p_bulk_id::text
  limit 1;

  if v_card is null then return 'not_found'; end if;
  if (v_card ->> 'state') is distinct from p_from then return 'already'; end if;

  -- Only the card's own fields; its id and type stay.
  select jsonb_agg(
    case when part ->> 'type' = 'bulk' and part ->> 'id' = p_bulk_id::text
      then part || (p_patch - 'id' - 'type') else part end
    order by ord
  ) into v_parts
  from jsonb_array_elements(v_parts) with ordinality as cards(part, ord);

  update public.chat_messages set parts = v_parts where id = p_message_id;
  return 'ok';
end;
$$;

revoke all on function public.update_sigap_bulk(uuid, text, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.update_sigap_bulk(uuid, text, uuid, uuid, text, jsonb) to service_role;

-- A script Sigap's approved bulk plan queued carries `auto`: the post it continues into. Its finished script moves the
-- job straight on to the caption and images, in the same transaction, so no second approval is needed and a worker
-- that stops in between leaves nothing half-done.
create or replace function public.finish_script_job(p_post_id uuid, p_lease uuid, p_script jsonb)
returns void language plpgsql set search_path = '' as $$
declare v_job public.content_jobs;
begin
  select * into v_job from public.content_jobs where post_id = p_post_id and lease = p_lease and status = 'running' and kind = 'script' for update;
  if not found then raise exception 'job_not_claimed'; end if;
  update public.content_ideas set script = p_script where id = v_job.idea_id and user_id = v_job.user_id and account_id = v_job.account_id;
  if not found then raise exception 'idea_not_found'; end if;
  if jsonb_typeof(v_job.payload -> 'auto' -> 'request') = 'object' then
    update public.content_jobs set kind = 'content', status = 'pending', attempts = 0, lease = null, error = null,
      payload = jsonb_build_object(
        'request', (v_job.payload -> 'auto' -> 'request') || jsonb_build_object('slides', jsonb_array_length(p_script)),
        'script', p_script,
        'attachmentPath', null)
      where post_id = p_post_id;
  else
    update public.content_jobs set status = 'ready', lease = null, error = null where post_id = p_post_id;
  end if;
end $$;
