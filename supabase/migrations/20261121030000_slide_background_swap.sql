-- Pisahkan objek on the background: Simpan may give the slide a new background (the background with the subject
-- removed). An overload, so callers without a new background keep the 7-argument function unchanged.
-- p_base_asset_id null keeps the current background.
create function public.save_slide_design(p_user_id uuid, p_post_id uuid, p_old_asset_id uuid, p_new_asset_id uuid,
  p_doc jsonb, p_design jsonb, p_expected_version timestamptz, p_base_asset_id uuid)
returns uuid[] language plpgsql set search_path = '' as $$
declare
  v_version timestamptz;
  v_account_id text;
  v_unused uuid[];
  v_refs uuid[];
  v_old_design jsonb;
  v_old_base uuid;
  v_original uuid;
  v_found boolean;
begin
  select account_id into v_account_id from public.posts
    where id = p_post_id and user_id = p_user_id
      and status in ('draft', 'scheduled', 'failed', 'cancelled') and ig_container_id is null for update;
  if not found then raise exception 'post_locked'; end if;
  if not exists (select 1 from public.post_media where post_id = p_post_id and asset_id = p_old_asset_id) then
    raise exception 'conflict';
  end if;
  select updated_at, design_doc, base_asset_id, original_asset_id into v_version, v_old_design, v_old_base, v_original
    from public.slide_layers where asset_id = p_old_asset_id and user_id = p_user_id for update;
  v_found := found;
  if v_version is distinct from p_expected_version then raise exception 'conflict'; end if;
  if not v_found then
    -- A flat slide: its image is both the background and the original.
    v_old_base := p_old_asset_id;
    v_original := p_old_asset_id;
  end if;
  if p_design is null or p_design->>'format' is distinct from 'carousely.design'
    or p_design->>'schemaVersion' is distinct from '1' then raise exception 'invalid_document'; end if;
  v_refs := public.design_document_asset_ids(p_design) || public.design_document_asset_ids(p_doc) || array[p_new_asset_id]
    || array_remove(array[p_base_asset_id], null);
  if exists (select 1 from unnest(v_refs) r(id) where not exists (
    select 1 from public.assets a where a.id = r.id and a.user_id = p_user_id and a.account_id = v_account_id
  )) then raise exception 'invalid_media'; end if;
  v_unused := public.save_slide_layers(p_user_id, p_post_id, p_old_asset_id, p_new_asset_id, p_doc);
  update public.slide_layers set design_doc = p_design, base_asset_id = coalesce(p_base_asset_id, base_asset_id),
    updated_at = clock_timestamp() where asset_id = p_new_asset_id;
  v_unused := v_unused || public.unused_layer_assets(p_user_id, v_old_design, '{}');
  -- The replaced background may go too, but only a layer image (a Lapisan ajaib or Pisahkan objek background), never
  -- the slide's original or anything still used elsewhere.
  if p_base_asset_id is not null and v_old_base is distinct from p_base_asset_id and v_old_base is distinct from v_original
    and exists (select 1 from public.assets a where a.id = v_old_base and a.user_id = p_user_id
      and a.storage_path like p_user_id::text || '/layers/%') then
    v_unused := v_unused || v_old_base;
  end if;
  return array(select distinct id from unnest(v_unused) id
    where id is distinct from v_original and public.slide_layer_asset_unused(id));
end;
$$;

-- The 7-argument form is the overload with the background kept.
create or replace function public.save_slide_design(p_user_id uuid, p_post_id uuid, p_old_asset_id uuid, p_new_asset_id uuid,
  p_doc jsonb, p_design jsonb, p_expected_version timestamptz)
returns uuid[] language sql set search_path = '' as $$
  select public.save_slide_design(p_user_id, p_post_id, p_old_asset_id, p_new_asset_id, p_doc, p_design,
    p_expected_version, null::uuid);
$$;

revoke execute on function public.save_slide_design(uuid, uuid, uuid, uuid, jsonb, jsonb, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.save_slide_design(uuid, uuid, uuid, uuid, jsonb, jsonb, timestamptz, uuid) to service_role;
