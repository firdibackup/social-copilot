-- One Instagram account is one brand. Rows the dashboard shows carry the Instagram account they belong to
-- (account_id = instagram_connections.instagram_user_id), and the app shows only the connected account's rows.
-- Disconnecting hides an account's rows; connecting it again shows them as they were. account_id is a display
-- filter, not a security boundary: isolation between users stays user_id.
--
-- account_id is null only for rows of users who had no connection when this ran; the next account they connect
-- takes them (claim_orphan_rows).

alter table public.brand_kit add column account_id text;
alter table public.brand_references add column account_id text;
alter table public.assets add column account_id text;
alter table public.posts add column account_id text;
alter table public.content_ideas add column account_id text;
alter table public.dm_conversations add column account_id text;
alter table public.dm_messages add column account_id text;
alter table public.dm_settings add column account_id text;
alter table public.dm_templates add column account_id text;

-- Existing rows belong to the account connected now.
update public.brand_kit t set account_id = c.instagram_user_id from public.instagram_connections c where c.user_id = t.user_id;
update public.brand_references t set account_id = c.instagram_user_id from public.instagram_connections c where c.user_id = t.user_id;
update public.assets t set account_id = c.instagram_user_id from public.instagram_connections c where c.user_id = t.user_id;
update public.posts t set account_id = c.instagram_user_id from public.instagram_connections c where c.user_id = t.user_id;
update public.content_ideas t set account_id = c.instagram_user_id from public.instagram_connections c where c.user_id = t.user_id;
update public.dm_conversations t set account_id = c.instagram_user_id from public.instagram_connections c where c.user_id = t.user_id;
update public.dm_messages t set account_id = c.instagram_user_id from public.instagram_connections c where c.user_id = t.user_id;
update public.dm_settings t set account_id = c.instagram_user_id from public.instagram_connections c where c.user_id = t.user_id;
update public.dm_templates t set account_id = c.instagram_user_id from public.instagram_connections c where c.user_id = t.user_id;

create index brand_references_user_id_account_id_created_at_idx on public.brand_references (user_id, account_id, created_at);
create index assets_user_id_account_id_created_at_idx on public.assets (user_id, account_id, created_at);
create index posts_user_id_account_id_scheduled_at_idx on public.posts (user_id, account_id, scheduled_at);
create index content_ideas_user_id_account_id_created_at_idx on public.content_ideas (user_id, account_id, created_at);
create index dm_conversations_user_id_account_id_last_message_at_idx
  on public.dm_conversations (user_id, account_id, last_message_at desc);
create index dm_templates_user_id_account_id_created_at_idx on public.dm_templates (user_id, account_id, created_at);

-- Every insert gets the account connected at that moment, so no insert path (save_post, create_content,
-- record_dm_message, plain inserts) can forget it. Singletons pass account_id themselves for their upsert key.
create function public.stamp_account()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.account_id is null then
    select instagram_user_id into new.account_id from public.instagram_connections where user_id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger stamp_account before insert on public.brand_kit for each row execute function public.stamp_account();
create trigger stamp_account before insert on public.brand_references for each row execute function public.stamp_account();
create trigger stamp_account before insert on public.assets for each row execute function public.stamp_account();
create trigger stamp_account before insert on public.posts for each row execute function public.stamp_account();
create trigger stamp_account before insert on public.content_ideas for each row execute function public.stamp_account();
create trigger stamp_account before insert on public.dm_conversations for each row execute function public.stamp_account();
create trigger stamp_account before insert on public.dm_messages for each row execute function public.stamp_account();
create trigger stamp_account before insert on public.dm_settings for each row execute function public.stamp_account();
create trigger stamp_account before insert on public.dm_templates for each row execute function public.stamp_account();

-- Singletons become one row per user and account. An orphan (null account) must survive until an account takes
-- it, hence nulls not distinct (Postgres 15+).
alter table public.brand_kit drop constraint brand_kit_pkey;
alter table public.brand_kit add constraint brand_kit_user_id_account_id_key unique nulls not distinct (user_id, account_id);
alter table public.dm_settings drop constraint dm_settings_pkey;
alter table public.dm_settings add constraint dm_settings_user_id_account_id_key unique nulls not distinct (user_id, account_id);

-- The new-account fill: running while it works, failed when a step failed (the page then says so).
alter table public.brand_kit add column sync_status text check (sync_status in ('running', 'failed'));

-- The Facebook Page connection already names its Instagram account; it is kept per account.
alter table public.facebook_connections drop constraint facebook_connections_pkey;
alter table public.facebook_connections add primary key (user_id, instagram_user_id);

-- A design reference becomes a group: one image for a photo, every slide for a carousel, each with a label so
-- Buat Konten can follow the cover for slide 1, the inner slides for the middle and the CTA for the last.
create table public.brand_reference_images (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  reference_id uuid not null references public.brand_references (id) on delete cascade,
  position     smallint not null check (position between 0 and 19),
  storage_path text not null unique, -- object in the `brand` bucket
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  label        text not null check (label in ('cover', 'isi', 'cta', 'single')),
  unique (reference_id, position)
);

insert into public.brand_reference_images (user_id, reference_id, position, storage_path, content_type, label)
select user_id, id, 0, storage_path, content_type, 'single' from public.brand_references;

alter table public.brand_references drop column storage_path, drop column content_type;

alter table public.brand_reference_images enable row level security;
revoke all on public.brand_reference_images from anon, authenticated;

-- Scheduled posts of an account that stops being the connected one go back to draft, a status-only change.
create function public.draft_scheduled_posts(p_user_id uuid, p_account_id text)
returns integer
language sql
set search_path = ''
as $$
  with drafted as (
    update public.posts
       set status = 'draft', next_attempt_at = null, updated_at = now()
     where user_id = p_user_id and account_id = p_account_id and status = 'scheduled'
    returning 1
  )
  select count(*)::integer from drafted;
$$;

-- Putuskan: the account's scheduled posts become drafts and the connection goes, in one transaction. A post
-- being published is left to the worker. Returns how many posts became drafts.
create function public.disconnect_instagram(p_user_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_account text;
  v_drafted integer := 0;
begin
  select instagram_user_id into v_account from public.instagram_connections where user_id = p_user_id for update;
  if v_account is not null then
    v_drafted := public.draft_scheduled_posts(p_user_id, v_account);
  end if;
  delete from public.instagram_connections where user_id = p_user_id;
  return v_drafted;
end;
$$;

-- Rows without an account go to the account being connected. A singleton the account already has wins; the
-- orphan is dropped.
create function public.claim_orphan_rows(p_user_id uuid, p_account_id text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.brand_kit where user_id = p_user_id and account_id = p_account_id) then
    delete from public.brand_kit where user_id = p_user_id and account_id is null;
  else
    update public.brand_kit set account_id = p_account_id where user_id = p_user_id and account_id is null;
  end if;
  if exists (select 1 from public.dm_settings where user_id = p_user_id and account_id = p_account_id) then
    delete from public.dm_settings where user_id = p_user_id and account_id is null;
  else
    update public.dm_settings set account_id = p_account_id where user_id = p_user_id and account_id is null;
  end if;
  update public.brand_references set account_id = p_account_id where user_id = p_user_id and account_id is null;
  update public.assets set account_id = p_account_id where user_id = p_user_id and account_id is null;
  update public.posts set account_id = p_account_id where user_id = p_user_id and account_id is null;
  update public.content_ideas set account_id = p_account_id where user_id = p_user_id and account_id is null;
  update public.dm_conversations set account_id = p_account_id where user_id = p_user_id and account_id is null;
  update public.dm_messages set account_id = p_account_id where user_id = p_user_id and account_id is null;
  update public.dm_templates set account_id = p_account_id where user_id = p_user_id and account_id is null;
end;
$$;

-- save_post as before, but a post can be scheduled only on the account connected now.
drop function public.save_post(uuid, uuid, text, text, timestamptz, uuid[]);

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

  if p_status = 'scheduled' and not exists (
    select 1
      from public.posts p
      join public.instagram_connections c on c.user_id = p.user_id and c.instagram_user_id = p.account_id
     where p.id = v_id
  ) then
    raise exception 'wrong_account';
  end if;

  insert into public.post_media (post_id, asset_id, position)
  select v_id, media.asset_id, media.ordinality - 1
    from unnest(p_asset_ids) with ordinality as media (asset_id, ordinality);

  return v_id;
end;
$$;

revoke execute on function public.stamp_account() from public, anon, authenticated;
revoke execute on function public.draft_scheduled_posts(uuid, text) from public, anon, authenticated;
revoke execute on function public.disconnect_instagram(uuid) from public, anon, authenticated;
revoke execute on function public.claim_orphan_rows(uuid, text) from public, anon, authenticated;
revoke execute on function public.save_post(uuid, uuid, text, text, timestamptz, uuid[]) from public, anon, authenticated;
grant execute on function public.draft_scheduled_posts(uuid, text) to service_role;
grant execute on function public.disconnect_instagram(uuid) to service_role;
grant execute on function public.claim_orphan_rows(uuid, text) to service_role;
grant execute on function public.save_post(uuid, uuid, text, text, timestamptz, uuid[]) to service_role;
