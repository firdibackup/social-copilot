-- Balasan: Instagram DMs received through the Meta webhook, and the owner's reply templates.
-- Same rules as the foundation: RLS on with no policies, so only the server's service-role key
-- can read or write.

create table public.dm_conversations (
  igsid              text primary key, -- the customer's Instagram-scoped id
  username           text,             -- filled from the profile API; null until it answers
  name               text,
  last_text          text,             -- null when the last message was only an attachment
  last_from_customer boolean not null, -- true means it still waits for the owner's reply
  last_message_at    timestamptz not null,
  last_incoming_at   timestamptz       -- start of Meta's 24-hour reply window
);

create index dm_conversations_last_message_at_idx on public.dm_conversations (last_message_at desc);

create table public.dm_messages (
  mid           text primary key, -- Meta's id: webhook retries and the echo of our own send dedupe on it
  igsid         text not null references public.dm_conversations (igsid) on delete cascade,
  from_customer boolean not null,
  text          text,
  sent_at       timestamptz not null
);

create index dm_messages_igsid_sent_at_idx on public.dm_messages (igsid, sent_at);

create table public.dm_templates (
  id         uuid primary key default gen_random_uuid(),
  keyword    text check (keyword <> ''), -- null: picked by hand only, never suggested
  body       text not null check (body <> ''),
  created_at timestamptz not null default now()
);

-- Owner variables for templates, e.g. {"brand_name": "Toko Sinar"}. One row, like instagram_connections,
-- but separate so disconnecting Instagram keeps them.
create table public.dm_settings (
  id        smallint primary key default 1 check (id = 1),
  variables jsonb not null default '{}'
);

-- Stores one message and keeps its conversation's summary current. Webhooks can arrive late or twice,
-- so only a newer message moves the summary, and a known mid changes nothing. Returns false for a duplicate.
create function public.record_dm_message(
  p_mid           text,
  p_igsid         text,
  p_from_customer boolean,
  p_text          text,
  p_sent_at       timestamptz
)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  insert into public.dm_conversations (igsid, last_text, last_from_customer, last_message_at)
  values (p_igsid, p_text, p_from_customer, p_sent_at)
  on conflict (igsid) do nothing;

  insert into public.dm_messages (mid, igsid, from_customer, text, sent_at)
  values (p_mid, p_igsid, p_from_customer, p_text, p_sent_at)
  on conflict (mid) do nothing;
  if not found then
    return false;
  end if;

  update public.dm_conversations
     set last_text          = case when p_sent_at >= last_message_at then p_text else last_text end,
         last_from_customer = case when p_sent_at >= last_message_at then p_from_customer else last_from_customer end,
         last_message_at    = greatest(last_message_at, p_sent_at),
         last_incoming_at   = case when p_from_customer then greatest(last_incoming_at, p_sent_at)
                                   else last_incoming_at end
   where igsid = p_igsid;
  return true;
end;
$$;

alter table public.dm_conversations enable row level security;
alter table public.dm_messages enable row level security;
alter table public.dm_templates enable row level security;
alter table public.dm_settings enable row level security;

revoke all on public.dm_conversations, public.dm_messages, public.dm_templates, public.dm_settings
  from anon, authenticated;

revoke execute on function public.record_dm_message(text, text, boolean, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_dm_message(text, text, boolean, text, timestamptz) to service_role;
