-- Auto DM: rules that answer a comment (or a DM) containing a keyword with a DM, and the runs they started.
-- Same rules as the rest: RLS on with no policies, only the server's service-role key reads or writes.

create table public.auto_dm_rules (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  account_id     text, -- stamped by stamp_account()
  name           text not null check (name <> ''),
  is_active      boolean not null default true,
  -- Null: every post of the account. Otherwise the one post (Instagram media id) the rule listens to.
  media_id       text,
  -- "kata apa pun": every comment matches. The keywords stay stored for when the owner switches back.
  match_any      boolean not null default false,
  keywords       text[] not null default '{}',
  whole_word     boolean not null default true,
  -- Also answer a DM that contains a keyword.
  dm_trigger     boolean not null default false,
  public_reply   boolean not null default false,
  public_replies text[] not null default '{}',
  -- "Chat dulu": an opening DM with a postback button; the main message follows the tap.
  opener         boolean not null default true,
  opener_text    text not null default '',
  opener_button  text not null default '',
  follow_gate    boolean not null default false,
  follow_text    text not null default '',
  follow_button  text not null default '',
  main_text      text not null check (main_text <> ''),
  link_button    boolean not null default false,
  link_text      text not null default '',
  link_url       text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index auto_dm_rules_user_id_account_id_created_at_idx on public.auto_dm_rules (user_id, account_id, created_at);

create trigger stamp_account before insert on public.auto_dm_rules for each row execute function public.stamp_account();

-- One row per comment or DM that set a rule off: the dedupe key and the card's "Aktivitas terakhir".
create table public.auto_dm_runs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  account_id  text not null,
  rule_id     uuid not null references public.auto_dm_rules (id) on delete cascade,
  source      text not null check (source in ('comment', 'dm')),
  -- The comment id or the DM's mid.
  trigger_id  text not null,
  -- Who set it off (the commenter's or sender's id): one run per rule and person a day.
  person_id   text,
  -- The DM conversation the run talks in; known once the first DM is out. Postbacks find the run by it.
  igsid       text,
  username    text,
  text        text not null default '',
  step        text not null default 'started'
              check (step in ('started', 'opener_sent', 'follow_requested', 'main_sent', 'failed')),
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, source, trigger_id)
);

create index auto_dm_runs_rule_id_updated_at_idx on public.auto_dm_runs (rule_id, updated_at desc);
create index auto_dm_runs_user_id_account_id_created_at_idx on public.auto_dm_runs (user_id, account_id, created_at desc);
create index auto_dm_runs_rule_id_person_id_created_at_idx on public.auto_dm_runs (rule_id, person_id, created_at desc);

alter table public.auto_dm_rules enable row level security;
alter table public.auto_dm_runs enable row level security;
revoke all on public.auto_dm_rules, public.auto_dm_runs from anon, authenticated;

-- Starts a run unless this comment or DM already started one, or the rule ran for the same person in the last
-- p_person_hours. The advisory lock keeps two comments of one person arriving together from both passing.
-- Returns the run's id, or null when it was not started.
create function public.claim_auto_dm_run(
  p_user_id      uuid,
  p_rule_id      uuid,
  p_source       text,
  p_trigger_id   text,
  p_person_id    text,
  p_username     text,
  p_text         text,
  p_person_hours integer
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_account_id text;
  v_id uuid;
begin
  select account_id into v_account_id from public.auto_dm_rules where id = p_rule_id and user_id = p_user_id;
  if v_account_id is null then
    return null;
  end if;

  if p_person_id is not null then
    perform pg_advisory_xact_lock(hashtext(p_rule_id::text || ':' || p_person_id));
    if exists (
      select 1 from public.auto_dm_runs
       where rule_id = p_rule_id
         and person_id = p_person_id
         and created_at > now() - make_interval(hours => p_person_hours)
    ) then
      return null;
    end if;
  end if;

  insert into public.auto_dm_runs (user_id, account_id, rule_id, source, trigger_id, person_id, username, text)
  values (p_user_id, v_account_id, p_rule_id, p_source, p_trigger_id, p_person_id, p_username, coalesce(p_text, ''))
  on conflict (user_id, source, trigger_id) do nothing
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.claim_auto_dm_run(uuid, uuid, text, text, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_auto_dm_run(uuid, uuid, text, text, text, text, text, integer) to service_role;

-- The webhook now also needs messaging_postbacks (the Auto DM buttons): subscribe every connection again.
update public.instagram_connections set webhooks_subscribed_at = null, webhooks_attempted_at = null;
