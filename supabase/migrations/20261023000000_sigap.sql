-- Sigap: the AI copilot chat. An owner keeps many conversations per Instagram account; each keeps every message
-- for scrolling back, and a rolling summary of the older ones, which is what the model gets instead of them.
-- Same rules as the rest: RLS on with no policies, only the server's service-role key reads or writes.

create table public.chat_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  account_id       text, -- stamped by stamp_account()
  -- The first message, cut short: no AI request just for a title.
  title            text not null default '' check (char_length(title) <= 80),
  -- What the model knows of the messages before its window; rewritten by chatSummary in after().
  summary_text     text not null default '' check (char_length(summary_text) <= 8000),
  -- How many of the oldest messages the summary covers.
  summarized_count integer not null default 0 check (summarized_count >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index chat_sessions_user_id_account_id_updated_at_idx
  on public.chat_sessions (user_id, account_id, updated_at desc);

create trigger stamp_account before insert on public.chat_sessions
  for each row execute function public.stamp_account();

create table public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  -- A PDF's text is never kept: the owner's message holds "[PDF: nama.pdf]" in its place.
  content    text not null check (char_length(content) <= 20000),
  -- What the message's cards show (tool results, confirmations, scripts, attachments), so a reload keeps them.
  parts      jsonb not null default '[]'::jsonb check (jsonb_typeof(parts) = 'array'),
  created_at timestamptz not null default now()
);

create index chat_messages_session_id_created_at_idx on public.chat_messages (session_id, created_at);

alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
revoke all on public.chat_sessions from anon, authenticated;
revoke all on public.chat_messages from anon, authenticated;

-- Sigap's requests cost no credits; their rows remain the audit trail while sigap_daily_usage enforces daily limits.
alter table public.ai_generations drop constraint ai_generations_task_check;
alter table public.ai_generations add constraint ai_generations_task_check check (task in (
  'captions', 'ideas', 'rewrite', 'hashtags', 'image', 'image_plan',
  'brand_profile', 'brand_visual', 'brand_strategy',
  'content', 'content_slide', 'slide_edit', 'caption_edit', 'content_ideas', 'content_script',
  'website_catalog', 'asset_tags',
  'reply_draft',
  'template_analysis',
  'chat', 'deep_search', 'chat_summary'
));

-- Audit remains in ai_generations. This separate counter atomically reserves daily slots even when audit logging fails.
create table public.sigap_daily_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  task text not null check (task in ('chat', 'deep_search')),
  used integer not null check (used > 0),
  primary key (user_id, day, task)
);

alter table public.sigap_daily_usage enable row level security;
revoke all on public.sigap_daily_usage from anon, authenticated;

create function public.reserve_sigap_daily_usage(p_user_id uuid, p_task text, p_limit integer)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_reserved integer;
begin
  if p_task not in ('chat', 'deep_search') or p_limit < 1 then
    raise exception 'invalid Sigap daily limit';
  end if;

  insert into public.sigap_daily_usage (user_id, day, task, used)
  values (p_user_id, (current_timestamp at time zone 'Asia/Jakarta')::date, p_task, 1)
  on conflict (user_id, day, task) do update
    set used = public.sigap_daily_usage.used + 1
    where public.sigap_daily_usage.used < p_limit
  returning used into v_reserved;

  return v_reserved is not null;
end;
$$;

-- Resolves one confirmation and its side effect in the same locked transaction. This prevents duplicate Auto DM rules
-- and preserves other cards resolved concurrently in the same message.
create function public.resolve_sigap_confirmation(
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

-- Deletes only the account-scoped idea represented by this message and updates that one nested card under a row lock.
create function public.discard_sigap_script(
  p_user_id uuid,
  p_account_id text,
  p_message_id uuid,
  p_idea_id uuid
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_parts jsonb;
  v_found boolean;
begin
  select m.parts into v_parts
  from public.chat_messages m
  join public.chat_sessions s on s.id = m.session_id
  where m.id = p_message_id and m.user_id = p_user_id
    and s.user_id = p_user_id and s.account_id = p_account_id
  for update of m;

  if v_parts is null then return 'not_found'; end if;

  select true into v_found
  from jsonb_array_elements(v_parts) as cards(part),
       jsonb_array_elements(case when part ->> 'type' = 'scripts' then part -> 'items' else '[]'::jsonb end) as scripts(item)
  where item ->> 'ideaId' = p_idea_id::text and item ->> 'state' = 'saved'
  limit 1;

  if v_found is not true then
    if exists (
      select 1 from jsonb_array_elements(v_parts) as cards(part),
      jsonb_array_elements(case when part ->> 'type' = 'scripts' then part -> 'items' else '[]'::jsonb end) as scripts(item)
      where item ->> 'ideaId' = p_idea_id::text and item ->> 'state' = 'discarded'
    ) then return 'already'; end if;
    return 'not_found';
  end if;

  delete from public.content_ideas
  where id = p_idea_id and user_id = p_user_id and account_id = p_account_id;

  select jsonb_agg(
    case when part ->> 'type' = 'scripts' then
      jsonb_set(part, '{items}', coalesce((
        select jsonb_agg(
          case when item ->> 'ideaId' = p_idea_id::text
            then jsonb_set(item, '{state}', '"discarded"'::jsonb) else item end
          order by item_ord
        )
        from jsonb_array_elements(part -> 'items') with ordinality as scripts(item, item_ord)
      ), '[]'::jsonb))
    else part end
    order by part_ord
  ) into v_parts
  from jsonb_array_elements(v_parts) with ordinality as cards(part, part_ord);

  update public.chat_messages set parts = v_parts where id = p_message_id;
  return 'discarded';
end;
$$;

revoke all on function public.reserve_sigap_daily_usage(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.resolve_sigap_confirmation(uuid, text, uuid, uuid, text, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.discard_sigap_script(uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_sigap_daily_usage(uuid, text, integer) to service_role;
grant execute on function public.resolve_sigap_confirmation(uuid, text, uuid, uuid, text, jsonb, boolean) to service_role;
grant execute on function public.discard_sigap_script(uuid, text, uuid, uuid) to service_role;

create index ai_generations_user_id_task_created_at_idx on public.ai_generations (user_id, task, created_at);
