-- Website assets and user-managed asset groups. Existing media remains publishable and keeps every post relation.

create table public.asset_groups (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  account_id  text,
  category    text not null check (category in ('product', 'people', 'place', 'logo', 'other')),
  title       text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 500),
  origin      text not null default 'upload' check (origin in ('upload', 'website', 'ai')),
  source_url  text check (source_url is null or octet_length(source_url) <= 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index asset_groups_user_id_account_id_created_at_idx
  on public.asset_groups (user_id, account_id, created_at desc);

create trigger stamp_account before insert on public.asset_groups
  for each row execute function public.stamp_account();

alter table public.assets
  add column origin text not null default 'upload' check (origin in ('upload', 'website', 'ai')),
  add column group_id uuid references public.asset_groups (id) on delete set null,
  add column group_position integer check (group_position >= 0),
  add column is_active boolean not null default true,
  add column source_url text check (source_url is null or octet_length(source_url) <= 2000),
  add column content_hash text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$');

-- Assets made for old AI slides belong in Hasil AI. All other old media remains Milik saya.
update public.assets a
   set origin = 'ai'
 where exists (select 1 from public.post_slides s where s.asset_id = a.id);

create unique index assets_group_id_group_position_key
  on public.assets (group_id, group_position)
  where group_id is not null and group_position is not null;
create unique index assets_website_source_url_key
  on public.assets (user_id, account_id, source_url) nulls not distinct
  where origin = 'website' and source_url is not null;
create unique index assets_website_content_hash_key
  on public.assets (user_id, account_id, content_hash) nulls not distinct
  where origin = 'website' and content_hash is not null;
create index assets_user_id_account_id_origin_created_at_idx
  on public.assets (user_id, account_id, origin, created_at desc);
create index assets_group_id_idx on public.assets (group_id);

-- The content planner stores the selected product group per slide, so retries and edits keep the same product.
alter table public.post_slides
  add column product_group_id uuid references public.asset_groups (id) on delete set null;
create index post_slides_product_group_id_idx on public.post_slides (product_group_id);

-- Content creation validates and keeps the planner's product choice independently from its design reference.
create or replace function public.create_content(
  p_user_id uuid,
  p_title   text,
  p_caption text,
  p_slides  jsonb,
  p_idea_id uuid
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if jsonb_typeof(p_slides) is distinct from 'array' or jsonb_array_length(p_slides) not between 1 and 10 then
    raise exception 'invalid_slides';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_slides) as slide
     where nullif(slide ->> 'reference_image_id', '') is not null
       and not exists (
         select 1 from public.brand_reference_images
          where id = (slide ->> 'reference_image_id')::uuid and user_id = p_user_id
       )
  ) then
    raise exception 'invalid_reference';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_slides) as slide
     where nullif(slide ->> 'product_group_id', '') is not null
       and not exists (
         select 1 from public.asset_groups
          where id = (slide ->> 'product_group_id')::uuid and user_id = p_user_id and category = 'product'
       )
  ) then
    raise exception 'invalid_product';
  end if;

  insert into public.posts (user_id, title, caption, status)
  values (p_user_id, p_title, p_caption, 'draft')
  returning id into v_id;

  insert into public.post_slides
    (user_id, post_id, position, headline, scene, format, role, reference_image_id, reference_id,
     product_group_id, include_logo)
  select p_user_id, v_id, (slides.ordinality - 1)::smallint, coalesce(slides.slide ->> 'headline', ''),
         slides.slide ->> 'scene', slides.slide ->> 'format', nullif(slides.slide ->> 'role', ''), image.id,
         image.reference_id, product.id, coalesce((slides.slide ->> 'include_logo')::boolean, false)
    from jsonb_array_elements(p_slides) with ordinality as slides (slide, ordinality)
    left join public.brand_reference_images image
      on image.id = nullif(slides.slide ->> 'reference_image_id', '')::uuid and image.user_id = p_user_id
    left join public.asset_groups product
      on product.id = nullif(slides.slide ->> 'product_group_id', '')::uuid
     and product.user_id = p_user_id and product.category = 'product';

  if p_idea_id is not null then
    delete from public.content_ideas where id = p_idea_id and user_id = p_user_id;
  end if;
  return v_id;
end;
$$;

-- An edited slide keeps its original product group just like its role and design reference.
drop function public.replace_slide(uuid, uuid, uuid, uuid, text, text, text, text, uuid, boolean);

create function public.replace_slide(
  p_user_id            uuid,
  p_post_id            uuid,
  p_old_asset_id       uuid,
  p_new_asset_id       uuid,
  p_headline           text,
  p_scene              text,
  p_format             text,
  p_role               text,
  p_reference_image_id uuid,
  p_product_group_id   uuid,
  p_include_logo       boolean
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_position smallint;
  v_image    uuid;
  v_group    uuid;
  v_product  uuid;
begin
  perform 1
     from public.posts
    where id = p_post_id and user_id = p_user_id
      and status in ('draft', 'scheduled', 'failed', 'cancelled') and ig_container_id is null
      for update;
  if not found then raise exception 'post_locked'; end if;
  if not exists (select 1 from public.assets where id = p_new_asset_id and user_id = p_user_id) then
    raise exception 'invalid_media';
  end if;

  update public.post_media set asset_id = p_new_asset_id
   where post_id = p_post_id and asset_id = p_old_asset_id
  returning position into v_position;
  if not found then raise exception 'slide_not_found'; end if;

  select id, reference_id into v_image, v_group from public.brand_reference_images
   where id = p_reference_image_id and user_id = p_user_id;
  select id into v_product from public.asset_groups
   where id = p_product_group_id and user_id = p_user_id and category = 'product';

  insert into public.post_slides
    (user_id, post_id, position, headline, scene, format, role, reference_image_id, reference_id,
     product_group_id, include_logo, status, asset_id)
  values
    (p_user_id, p_post_id, v_position, p_headline, p_scene, p_format, p_role, v_image, v_group,
     v_product, p_include_logo, 'ready', p_new_asset_id);
  update public.posts set updated_at = now() where id = p_post_id;
end;
$$;

-- Moving one photo locks the destination group and appends it without racing another move.
create function public.move_asset_to_group(
  p_user_id    uuid,
  p_account_id text,
  p_asset_id   uuid,
  p_group_id   uuid
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_position integer;
begin
  if p_group_id is not null then
    perform 1 from public.asset_groups
     where id = p_group_id and user_id = p_user_id and account_id = p_account_id
     for update;
    if not found then return false; end if;
    select coalesce(max(group_position), -1) + 1 into v_position
      from public.assets where group_id = p_group_id;
  end if;
  update public.assets
     set group_id = p_group_id, group_position = case when p_group_id is null then null else v_position end
   where id = p_asset_id and user_id = p_user_id and account_id = p_account_id;
  return found;
end;
$$;

-- Website cataloging is billed and shown separately from Brand visual analysis.
alter table public.ai_generations drop constraint ai_generations_task_check;
alter table public.ai_generations add constraint ai_generations_task_check check (task in (
  'captions', 'ideas', 'rewrite', 'hashtags', 'image', 'image_plan',
  'brand_profile', 'brand_visual',
  'content', 'content_slide', 'slide_edit', 'caption_edit', 'content_ideas',
  'website_catalog'
));

-- An atomic group creator validates that every selected asset belongs to the same owner, account and origin.
create function public.create_asset_group(
  p_user_id     uuid,
  p_account_id  text,
  p_category    text,
  p_title       text,
  p_description text,
  p_origin      text,
  p_source_url  text,
  p_asset_ids   uuid[]
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_account_id is null then
    raise exception 'invalid_account';
  end if;
  if coalesce(cardinality(p_asset_ids), 0) <> (
    select count(distinct item.id)
      from unnest(coalesce(p_asset_ids, array[]::uuid[])) as item (id)
  ) then
    raise exception 'invalid_assets';
  end if;
  if exists (
    select 1
      from unnest(coalesce(p_asset_ids, array[]::uuid[])) as item (id)
     where not exists (
       select 1
         from public.assets a
        where a.id = item.id
          and a.user_id = p_user_id
           and a.account_id = p_account_id
           and a.origin = p_origin
      )

  ) then
    raise exception 'invalid_assets';
  end if;

  insert into public.asset_groups (user_id, account_id, category, title, description, origin, source_url)
  values (p_user_id, p_account_id, p_category, p_title, p_description, p_origin, p_source_url)
  returning id into v_id;

  update public.assets a
     set group_id = v_id, group_position = item.ordinality - 1
    from unnest(coalesce(p_asset_ids, array[]::uuid[])) with ordinality as item (id, ordinality)
   where a.id = item.id;

  return v_id;
end;
$$;

-- Account adoption also carries groups created before an Instagram connection existed.
create or replace function public.claim_orphan_rows(p_user_id uuid, p_account_id text)
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
  update public.asset_groups set account_id = p_account_id where user_id = p_user_id and account_id is null;
  update public.assets set account_id = p_account_id where user_id = p_user_id and account_id is null;
  update public.posts set account_id = p_account_id where user_id = p_user_id and account_id is null;
  update public.content_ideas set account_id = p_account_id where user_id = p_user_id and account_id is null;
  update public.dm_conversations set account_id = p_account_id where user_id = p_user_id and account_id is null;
  update public.dm_messages set account_id = p_account_id where user_id = p_user_id and account_id is null;
  update public.dm_templates set account_id = p_account_id where user_id = p_user_id and account_id is null;
end;
$$;

alter table public.asset_groups enable row level security;
revoke all on public.asset_groups from public, anon, authenticated;
revoke execute on function public.create_asset_group(uuid, text, text, text, text, text, text, uuid[])
  from public, anon, authenticated;
revoke execute on function public.claim_orphan_rows(uuid, text) from public, anon, authenticated;
revoke execute on function public.move_asset_to_group(uuid, text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.replace_slide(uuid, uuid, uuid, uuid, text, text, text, text, uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.create_asset_group(uuid, text, text, text, text, text, text, uuid[])
  to service_role;
grant execute on function public.claim_orphan_rows(uuid, text) to service_role;
grant execute on function public.move_asset_to_group(uuid, text, uuid, uuid) to service_role;
grant execute on function public.replace_slide(uuid, uuid, uuid, uuid, text, text, text, text, uuid, uuid, boolean)
  to service_role;
