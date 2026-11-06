-- Brand › Visual › Batasan desain: the owner's must/must-not list for every image (e.g. fewer family photos in
-- interiors). Mimo proposes it through a confirmation card; accepting writes it here, like the content strategy.
alter table public.brand_kit add column if not exists design_rules text not null default ''
  check (char_length(design_rules) <= 1000);

create or replace function public.resolve_sigap_confirmation(
  p_user_id uuid,
  p_account_id text,
  p_message_id uuid,
  p_confirm_id uuid,
  p_kind text,
  p_payload jsonb,
  p_accept boolean
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_parts jsonb;
  v_card jsonb;
  v_state text := case when p_accept then 'saved' else 'cancelled' end;
begin
  select m.parts into v_parts
  from public.chat_messages m
  join public.chat_sessions s on s.id = m.session_id
  where m.id = p_message_id and m.user_id = p_user_id
    and s.user_id = p_user_id and s.account_id = p_account_id
  for update of m;

  if v_parts is null then return 'not_found'; end if;

  select part into v_card
  from jsonb_array_elements(v_parts) as cards(part)
  where part ->> 'type' = 'confirm' and part ->> 'id' = p_confirm_id::text
  limit 1;

  if v_card is null or v_card ->> 'kind' <> p_kind or v_card -> 'payload' <> p_payload then return 'not_found'; end if;
  if v_card ->> 'state' <> 'pending' then return 'already'; end if;

  if p_accept and p_kind = 'strategy' then
    insert into public.brand_kit (user_id, account_id, strategy, updated_at)
    values (p_user_id, p_account_id, p_payload, now())
    on conflict (user_id, account_id) do update
      set strategy = excluded.strategy, updated_at = excluded.updated_at;
  elsif p_accept and p_kind = 'design_rules' then
    if jsonb_typeof(p_payload -> 'designRules') <> 'string' or char_length(p_payload ->> 'designRules') > 1000 then
      return 'not_found';
    end if;
    insert into public.brand_kit (user_id, account_id, design_rules, updated_at)
    values (p_user_id, p_account_id, p_payload ->> 'designRules', now())
    on conflict (user_id, account_id) do update
      set design_rules = excluded.design_rules, updated_at = excluded.updated_at;
  elsif p_accept and p_kind = 'auto_dm_rule' then
    insert into public.auto_dm_rules (
      user_id, account_id, name, media_id, match_any, keywords, whole_word, dm_trigger,
      public_reply, public_replies, opener, opener_text, opener_button, follow_gate,
      follow_text, follow_button, main_text, link_button, link_text, link_url
    ) values (
      p_user_id, p_account_id, p_payload ->> 'name', null,
      (p_payload ->> 'matchAny')::boolean,
      array(select jsonb_array_elements_text(p_payload -> 'keywords')),
      (p_payload ->> 'wholeWord')::boolean,
      (p_payload ->> 'dmTrigger')::boolean,
      (p_payload ->> 'publicReply')::boolean,
      array(select jsonb_array_elements_text(p_payload -> 'publicReplies')),
      (p_payload ->> 'opener')::boolean, p_payload ->> 'openerText', p_payload ->> 'openerButton',
      (p_payload ->> 'followGate')::boolean, p_payload ->> 'followText', p_payload ->> 'followButton',
      p_payload ->> 'mainText', (p_payload ->> 'linkButton')::boolean,
      p_payload ->> 'linkText', p_payload ->> 'linkUrl'
    );
  elsif p_accept then
    return 'not_found';
  end if;

  select jsonb_agg(
    case when part ->> 'type' = 'confirm' and part ->> 'id' = p_confirm_id::text
      then jsonb_set(part, '{state}', to_jsonb(v_state::text)) else part end
    order by ord
  ) into v_parts
  from jsonb_array_elements(v_parts) with ordinality as cards(part, ord);

  update public.chat_messages set parts = v_parts where id = p_message_id;
  return v_state;
end;
$$;
