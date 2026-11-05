-- Additive rollout: keep the legacy document readable while the node renderer is introduced.
alter table public.slide_layers add column design_doc jsonb;
alter table public.slide_layers add constraint slide_design_format check (
  design_doc is null or (
    jsonb_typeof(design_doc) = 'object' and design_doc->>'format' is not distinct from 'carousely.design'
    and design_doc->>'schemaVersion' is not distinct from '1'
  )
);

-- Includes masks, fonts, nested groups and the hidden original, not just top-level image nodes.
create function public.design_document_asset_ids(p_doc jsonb)
returns uuid[] language sql immutable set search_path = '' as $$
  select coalesce(array_agg(distinct value::uuid), '{}') from (
    select item #>> '{}' as value
      from jsonb_path_query(coalesce(p_doc, '{}'::jsonb), '$.**.assetId') item
    union
    select item #>> '{}' from jsonb_path_query(coalesce(p_doc, '{}'::jsonb), '$.**.maskAssetId') item
    union
    select item->>'id' from jsonb_array_elements(
      case when jsonb_typeof(p_doc->'assets') = 'array' then p_doc->'assets' else '[]'::jsonb end
    ) item
  ) refs where value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
$$;

-- Foreign keys protect referenced images even when deleted through the asset library.
create table public.slide_design_assets (
  slide_asset_id uuid not null references public.slide_layers(asset_id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete restrict,
  primary key (slide_asset_id, asset_id)
);
create index slide_design_assets_asset_idx on public.slide_design_assets(asset_id);
alter table public.slide_design_assets enable row level security;
revoke all on public.slide_design_assets from anon, authenticated;
grant all on public.slide_design_assets to service_role;

create function public.sync_slide_design_assets()
returns trigger language plpgsql set search_path = '' as $$
begin
  delete from public.slide_design_assets where slide_asset_id = new.asset_id;
  insert into public.slide_design_assets(slide_asset_id, asset_id)
    select new.asset_id, a.id from public.assets a where a.id = any(
      public.design_document_asset_ids(new.doc) || public.design_document_asset_ids(new.design_doc)
        || array_remove(array[new.base_asset_id, new.original_asset_id], null)
    ) and a.id <> new.asset_id;
  return new;
end;
$$;
create trigger sync_slide_design_assets after insert or update of doc, design_doc, base_asset_id, original_asset_id
  on public.slide_layers for each row execute function public.sync_slide_design_assets();

insert into public.slide_design_assets(slide_asset_id, asset_id)
  select l.asset_id, a.id from public.slide_layers l join public.assets a on a.id = any(
    public.design_document_asset_ids(l.doc) || array_remove(array[l.base_asset_id, l.original_asset_id], null)
  ) where a.id <> l.asset_id on conflict do nothing;

create or replace function public.slide_layer_asset_unused(p_asset_id uuid)
returns boolean language sql stable set search_path = '' as $$
  select not exists (select 1 from public.post_media where asset_id = p_asset_id)
    and not exists (select 1 from public.thread_item_media where asset_id = p_asset_id)
    and not exists (select 1 from public.slide_layers where asset_id = p_asset_id)
    and not exists (select 1 from public.slide_design_assets where asset_id = p_asset_id);
$$;

create or replace function public.unused_layer_assets(p_user_id uuid, p_doc jsonb, p_extra uuid[])
returns uuid[] language sql stable set search_path = '' as $$
  select coalesce(array_agg(distinct a.id), '{}') from public.assets a
    where a.user_id = p_user_id and (a.id = any(p_extra)
      or (a.storage_path like p_user_id::text || '/layers/%' and a.id = any(public.design_document_asset_ids(p_doc))))
      and public.slide_layer_asset_unused(a.id);
$$;

-- The existing save owns post-media replacement and cleanup. Hold its locks before checking the version.
create function public.save_slide_design(p_user_id uuid, p_post_id uuid, p_old_asset_id uuid, p_new_asset_id uuid,
  p_doc jsonb, p_design jsonb, p_expected_version timestamptz)
returns uuid[] language plpgsql set search_path = '' as $$
declare
  v_version timestamptz;
  v_account_id text;
  v_unused uuid[];
  v_refs uuid[];
  v_old_design jsonb;
begin
  select account_id into v_account_id from public.posts
    where id = p_post_id and user_id = p_user_id
      and status in ('draft', 'scheduled', 'failed', 'cancelled') and ig_container_id is null for update;
  if not found then raise exception 'post_locked'; end if;
  if not exists (select 1 from public.post_media where post_id = p_post_id and asset_id = p_old_asset_id) then
    raise exception 'conflict';
  end if;
  select updated_at, design_doc into v_version, v_old_design from public.slide_layers
    where asset_id = p_old_asset_id and user_id = p_user_id for update;
  if v_version is distinct from p_expected_version then raise exception 'conflict'; end if;
  if p_design is null or p_design->>'format' is distinct from 'carousely.design'
    or p_design->>'schemaVersion' is distinct from '1' then raise exception 'invalid_document'; end if;
  v_refs := public.design_document_asset_ids(p_design) || public.design_document_asset_ids(p_doc) || array[p_new_asset_id];
  if exists (select 1 from unnest(v_refs) r(id) where not exists (
    select 1 from public.assets a where a.id = r.id and a.user_id = p_user_id and a.account_id = v_account_id
  )) then raise exception 'invalid_media'; end if;
  v_unused := public.save_slide_layers(p_user_id, p_post_id, p_old_asset_id, p_new_asset_id, p_doc);
  update public.slide_layers set design_doc = p_design, updated_at = clock_timestamp() where asset_id = p_new_asset_id;
  v_unused := v_unused || public.unused_layer_assets(p_user_id, v_old_design, '{}');
  return array(select id from unnest(v_unused) id where public.slide_layer_asset_unused(id));
end;
$$;

-- Reset also releases masks and fonts referenced only by the node document.
create or replace function public.reset_slide_layers(p_user_id uuid, p_post_id uuid, p_asset_id uuid)
returns uuid[] language plpgsql set search_path = '' as $$
declare
  v_base uuid;
  v_original uuid;
  v_doc jsonb;
  v_design jsonb;
begin
  perform 1 from public.posts where id = p_post_id and user_id = p_user_id
    and status in ('draft', 'scheduled', 'failed', 'cancelled') and ig_container_id is null for update;
  if not found then raise exception 'post_locked'; end if;
  select base_asset_id, original_asset_id, doc, design_doc into v_base, v_original, v_doc, v_design
    from public.slide_layers where asset_id = p_asset_id and user_id = p_user_id for update;
  if not found then raise exception 'layers_not_found'; end if;
  if v_original is null then raise exception 'original_missing'; end if;
  if v_original <> p_asset_id then
    update public.post_media set asset_id = v_original where post_id = p_post_id and asset_id = p_asset_id;
    if not found then raise exception 'slide_not_found'; end if;
  elsif not exists (select 1 from public.post_media where post_id = p_post_id and asset_id = p_asset_id) then
    raise exception 'slide_not_found';
  end if;
  delete from public.slide_layers where asset_id = p_asset_id;
  update public.posts set updated_at = now() where id = p_post_id;
  return public.unused_layer_assets(p_user_id, jsonb_build_object('legacy', v_doc, 'design', v_design),
    array_remove(array[nullif(p_asset_id, v_original), nullif(v_base, v_original)], null));
end;
$$;

create or replace function public.storage_cleanup_candidates(p_user_id uuid, p_limit integer default 100)
returns table (id uuid, size_bytes integer, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.id, a.size_bytes, a.created_at from public.assets a
    where a.user_id = p_user_id and (a.origin = 'ai' or a.storage_path like p_user_id::text || '/layers/%')
      and not exists (select 1 from public.post_media m where m.asset_id = a.id)
      and not exists (select 1 from public.thread_item_media t where t.asset_id = a.id)
      and not exists (select 1 from public.post_slides s where s.asset_id = a.id)
      and not exists (select 1 from public.slide_design_assets r where r.asset_id = a.id)
    order by a.created_at asc, a.size_bytes desc limit least(greatest(p_limit, 1), 500);
$$;

revoke execute on function public.design_document_asset_ids(jsonb), public.sync_slide_design_assets(),
  public.save_slide_design(uuid, uuid, uuid, uuid, jsonb, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.design_document_asset_ids(jsonb), public.sync_slide_design_assets(),
  public.save_slide_design(uuid, uuid, uuid, uuid, jsonb, jsonb, timestamptz) to service_role;
