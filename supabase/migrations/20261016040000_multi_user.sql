-- Multi-user: every row belongs to a Supabase Auth user. The server still talks to the database only with
-- the service-role key (RLS on, no policies), and src/lib filters every query by user_id.
--
-- Existing rows go to the first auth user, the owner. When the database already has data, create that account
-- first (Studio → Authentication → Add user, with auto confirm); otherwise the `set not null` steps below fail.

-- One-time OAuth states now remember who started the login; old ones are useless.
delete from public.oauth_states;
alter table public.oauth_states add column user_id uuid not null references auth.users (id) on delete cascade;

-- Singletons become one row per user.
alter table public.instagram_connections add column user_id uuid references auth.users (id) on delete cascade;
update public.instagram_connections set user_id = (select id from auth.users order by created_at limit 1);
alter table public.instagram_connections
  drop column id,
  add primary key (user_id),
  add unique (instagram_user_id); -- one Instagram account per user, so a webhook's entry.id names exactly one user

alter table public.facebook_connections add column user_id uuid references auth.users (id) on delete cascade;
update public.facebook_connections set user_id = (select id from auth.users order by created_at limit 1);
alter table public.facebook_connections drop column id, add primary key (user_id);

alter table public.brand_kit add column user_id uuid references auth.users (id) on delete cascade;
update public.brand_kit set user_id = (select id from auth.users order by created_at limit 1);
alter table public.brand_kit drop column id, add primary key (user_id);

alter table public.dm_settings add column user_id uuid references auth.users (id) on delete cascade;
update public.dm_settings set user_id = (select id from auth.users order by created_at limit 1);
alter table public.dm_settings drop column id, add primary key (user_id);

-- Owned rows.
alter table public.assets add column user_id uuid references auth.users (id) on delete cascade;
update public.assets set user_id = (select id from auth.users order by created_at limit 1);
alter table public.assets alter column user_id set not null;
create index assets_user_id_created_at_idx on public.assets (user_id, created_at);

alter table public.posts add column user_id uuid references auth.users (id) on delete cascade;
update public.posts set user_id = (select id from auth.users order by created_at limit 1);
alter table public.posts alter column user_id set not null;
create index posts_user_id_scheduled_at_idx on public.posts (user_id, scheduled_at);

alter table public.brand_references add column user_id uuid references auth.users (id) on delete cascade;
update public.brand_references set user_id = (select id from auth.users order by created_at limit 1);
alter table public.brand_references alter column user_id set not null;
drop index public.brand_references_created_at_idx;
create index brand_references_user_id_created_at_idx on public.brand_references (user_id, created_at);

alter table public.dm_templates add column user_id uuid references auth.users (id) on delete cascade;
update public.dm_templates set user_id = (select id from auth.users order by created_at limit 1);
alter table public.dm_templates alter column user_id set not null;
create index dm_templates_user_id_created_at_idx on public.dm_templates (user_id, created_at);

alter table public.ai_generations add column user_id uuid references auth.users (id) on delete cascade;
update public.ai_generations set user_id = (select id from auth.users order by created_at limit 1);
alter table public.ai_generations alter column user_id set not null;
drop index public.ai_generations_created_at_idx;
create index ai_generations_user_id_created_at_idx on public.ai_generations (user_id, created_at);

-- Deleting a user cascades to both posts and assets, but post_media still restricts deleting a photo in use, and
-- the assets cascade can run first. Removing the user's posts (and so their post_media) beforehand keeps that rule.
-- Security definer: the auth service deletes users with a role that can't touch public tables.
create function public.delete_user_posts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.posts where user_id = old.id;
  return old;
end;
$$;

revoke execute on function public.delete_user_posts() from public, anon, authenticated;

create trigger delete_user_posts
  before delete on auth.users
  for each row execute function public.delete_user_posts();

-- DMs: an igsid is the customer as seen by one account, and when two users of the app message each other the
-- same mid reaches both accounts, so both keys include user_id.
alter table public.dm_conversations add column user_id uuid references auth.users (id) on delete cascade;
update public.dm_conversations set user_id = (select id from auth.users order by created_at limit 1);
alter table public.dm_messages add column user_id uuid;
update public.dm_messages set user_id = (select id from auth.users order by created_at limit 1);

alter table public.dm_messages drop constraint dm_messages_igsid_fkey, drop constraint dm_messages_pkey;
alter table public.dm_conversations
  drop constraint dm_conversations_pkey,
  alter column user_id set not null,
  add primary key (user_id, igsid);
alter table public.dm_messages
  alter column user_id set not null,
  add primary key (user_id, mid),
  add foreign key (user_id, igsid) references public.dm_conversations (user_id, igsid) on delete cascade;

drop index public.dm_conversations_last_message_at_idx;
create index dm_conversations_user_id_last_message_at_idx on public.dm_conversations (user_id, last_message_at desc);
drop index public.dm_messages_igsid_sent_at_idx;
create index dm_messages_user_id_igsid_sent_at_idx on public.dm_messages (user_id, igsid, sent_at);

-- save_post now works on one user's posts and refuses another user's photos.
drop function public.save_post(uuid, text, text, timestamptz, uuid[]);

create function public.save_post(
  p_user_id      uuid,
  p_id           uuid,
  p_caption      text,
  p_status       text,
  p_scheduled_at timestamptz,
  p_asset_ids    uuid[]
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := p_id;
begin
  if p_status not in ('draft', 'scheduled') then
    raise exception 'invalid_status';
  end if;
  if p_status = 'scheduled' and coalesce(cardinality(p_asset_ids), 0) not between 1 and 10 then
    raise exception 'invalid_media';
  end if;
  if exists (
    select 1
      from unnest(p_asset_ids) as media (asset_id)
     where not exists (select 1 from public.assets where id = media.asset_id and user_id = p_user_id)
  ) then
    raise exception 'invalid_media';
  end if;

  if v_id is null then
    insert into public.posts (user_id, caption, status, scheduled_at)
    values (p_user_id, p_caption, p_status, p_scheduled_at)
    returning id into v_id;
  else
    update public.posts
       set caption = p_caption, status = p_status, scheduled_at = p_scheduled_at,
           attempt_count = 0, next_attempt_at = null, locked_at = null, last_error = null,
           updated_at = now()
     where id = v_id
       and user_id = p_user_id
       and status in ('draft', 'scheduled', 'failed', 'cancelled')
       and ig_container_id is null;
    if not found then
      raise exception 'post_locked';
    end if;
    delete from public.post_media where post_id = v_id;
  end if;

  insert into public.post_media (post_id, asset_id, position)
  select v_id, media.asset_id, media.ordinality - 1
    from unnest(p_asset_ids) with ordinality as media (asset_id, ordinality);

  return v_id;
end;
$$;

drop function public.record_dm_message(text, text, boolean, text, timestamptz);

-- Same rules as before, within one user's inbox: only a newer message moves the summary, a known mid changes nothing.
create function public.record_dm_message(
  p_user_id       uuid,
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
  insert into public.dm_conversations (user_id, igsid, last_text, last_from_customer, last_message_at)
  values (p_user_id, p_igsid, p_text, p_from_customer, p_sent_at)
  on conflict (user_id, igsid) do nothing;

  insert into public.dm_messages (user_id, mid, igsid, from_customer, text, sent_at)
  values (p_user_id, p_mid, p_igsid, p_from_customer, p_text, p_sent_at)
  on conflict (user_id, mid) do nothing;
  if not found then
    return false;
  end if;

  update public.dm_conversations
     set last_text          = case when p_sent_at >= last_message_at then p_text else last_text end,
         last_from_customer = case when p_sent_at >= last_message_at then p_from_customer else last_from_customer end,
         last_message_at    = greatest(last_message_at, p_sent_at),
         last_incoming_at   = case when p_from_customer then greatest(last_incoming_at, p_sent_at)
                                   else last_incoming_at end
   where user_id = p_user_id and igsid = p_igsid;
  return true;
end;
$$;

revoke execute on function public.save_post(uuid, uuid, text, text, timestamptz, uuid[]) from public, anon, authenticated;
revoke execute on function public.record_dm_message(uuid, text, text, boolean, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.save_post(uuid, uuid, text, text, timestamptz, uuid[]) to service_role;
grant execute on function public.record_dm_message(uuid, text, text, boolean, text, timestamptz) to service_role;
