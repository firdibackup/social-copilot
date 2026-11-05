-- Lapisan ajaib & editor lapisan: one editable layer document per slide image. The final JPEG stays in post_media
-- and assets, so posting, thumbnails and Instagram are unchanged. Not applied automatically: the owner applies it.

-- Layer assets (clean backgrounds, object PNGs, copies of the logo) live under <user>/layers/ in `media`.
update storage.buckets set allowed_mime_types = array['image/jpeg', 'image/png'] where id = 'media';

create table public.slide_layers (
  asset_id          uuid primary key references public.assets (id) on delete cascade,  -- the image the slide uses now
  user_id           uuid not null references auth.users (id) on delete cascade,
  -- The clean background. Cascade, not restrict: storage cleanup may remove a background no post uses any more;
  -- the slide then simply opens flat again.
  base_asset_id     uuid not null references public.assets (id) on delete cascade,
  original_asset_id uuid references public.assets (id) on delete set null,             -- for "Kembalikan ke asli"
  doc               jsonb not null check (jsonb_typeof(doc) = 'object'),                 -- validated by the app (layer-doc.ts)
  updated_at        timestamptz not null default now()
);
create index slide_layers_user_id_idx on public.slide_layers (user_id);
create index slide_layers_base_asset_id_idx on public.slide_layers (base_asset_id);
create index slide_layers_original_asset_id_idx on public.slide_layers (original_asset_id);

-- Accessed only by the server with the service role, like assets and post_media.
alter table public.slide_layers enable row level security;
revoke all on public.slide_layers from anon, authenticated;
grant all on public.slide_layers to service_role;

-- "Hasil kurang rapi": how often Lapisan ajaib leaves traces of the old text.
create table public.magic_layer_feedback (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  asset_id   uuid,
  created_at timestamptz not null default now()
);
create index magic_layer_feedback_user_id_idx on public.magic_layer_feedback (user_id);
alter table public.magic_layer_feedback enable row level security;
revoke all on public.magic_layer_feedback from anon, authenticated;
revoke all on sequence public.magic_layer_feedback_id_seq from anon, authenticated;
grant all on public.magic_layer_feedback to service_role;

alter table public.ai_generations drop constraint ai_generations_task_check;
alter table public.ai_generations add constraint ai_generations_task_check check (task in (
  'captions', 'ideas', 'rewrite', 'hashtags', 'image', 'image_plan',
  'brand_profile', 'brand_visual', 'brand_strategy',
  'content', 'content_slide', 'slide_edit', 'caption_edit', 'content_ideas', 'content_script',
  'website_catalog', 'asset_tags',
  'reply_draft',
  'template_analysis', 'reference_labels',
  'chat', 'deep_search', 'chat_summary',
  'threads_write', 'threads_edit',
  'magic_layers'
));

-- parseBillingCatalog needs a rate for every task; preserve a rate already set by an admin.
update public.billing_catalog
  set config = jsonb_set(config, '{rates,magic_layers}', '10'::jsonb, true)
  where not (config->'rates' ? 'magic_layers');

-- Whether nothing uses an image any more: no post, thread, layer document (as its image, background, original or
-- one of its layers). The caller decides which kinds of image it may then delete.
create function public.slide_layer_asset_unused(p_asset_id uuid)
returns boolean language sql stable set search_path = '' as $$
  select not exists (select 1 from public.post_media where asset_id = p_asset_id)
     and not exists (select 1 from public.thread_item_media where asset_id = p_asset_id)
     and not exists (select 1 from public.slide_layers l
                      where l.asset_id = p_asset_id or l.base_asset_id = p_asset_id or l.original_asset_id = p_asset_id
                         or l.doc->'layers' @> jsonb_build_array(jsonb_build_object('assetId', p_asset_id::text)));
$$;

-- The layer assets of a doc (under <user>/layers/) plus `p_extra`, keeping those nothing uses any more.
create function public.unused_layer_assets(p_user_id uuid, p_doc jsonb, p_extra uuid[])
returns uuid[] language sql stable set search_path = '' as $$
  select coalesce(array_agg(distinct a.id), '{}')
    from public.assets a
   where a.user_id = p_user_id
     and (a.id = any(p_extra)
          or (a.storage_path like p_user_id::text || '/layers/%'
              and a.id::text in (select layer->>'assetId' from jsonb_array_elements(coalesce(p_doc->'layers', '[]')) layer)))
     and public.slide_layer_asset_unused(a.id);
$$;

-- The editor's Simpan: the slide shows the new flattened image, and the layer document moves with it. Returns the
-- images nothing uses any more (the previous flattened image, layers taken out), for the app to delete.
create function public.save_slide_layers(p_user_id uuid, p_post_id uuid, p_old_asset_id uuid, p_new_asset_id uuid, p_doc jsonb)
returns uuid[] language plpgsql set search_path = '' as $$
declare
  v_base     uuid;
  v_original uuid;
  v_old_doc  jsonb;
  v_position smallint;
begin
  perform 1 from public.posts
    where id = p_post_id and user_id = p_user_id
      and status in ('draft', 'scheduled', 'failed', 'cancelled') and ig_container_id is null
    for update;
  if not found then raise exception 'post_locked'; end if;
  if not exists (select 1 from public.assets where id = p_new_asset_id and user_id = p_user_id) then
    raise exception 'invalid_media';
  end if;

  select base_asset_id, original_asset_id, doc into v_base, v_original, v_old_doc
    from public.slide_layers where asset_id = p_old_asset_id and user_id = p_user_id for update;
  if not found then
    -- A flat slide edited for the first time: its image is both the background and the original.
    v_base := p_old_asset_id;
    v_original := p_old_asset_id;
  end if;

  update public.post_media set asset_id = p_new_asset_id
   where post_id = p_post_id and asset_id = p_old_asset_id
  returning position into v_position;
  if not found then raise exception 'slide_not_found'; end if;

  -- The new image keeps the slide's prompt, so an AI edit of it later knows its format and role.
  insert into public.post_slides
    (user_id, post_id, position, headline, scene, format, role, reference_image_id, reference_id,
     product_group_id, include_logo, example, status, asset_id)
  select p_user_id, p_post_id, v_position, s.headline, s.scene, s.format, s.role, s.reference_image_id, s.reference_id,
         s.product_group_id, s.include_logo, s.example, 'ready', p_new_asset_id
    from public.post_slides s
   where s.asset_id = p_old_asset_id and s.user_id = p_user_id
   order by s.created_at desc
   limit 1;

  delete from public.slide_layers where asset_id = p_old_asset_id and user_id = p_user_id;
  insert into public.slide_layers (asset_id, user_id, base_asset_id, original_asset_id, doc)
    values (p_new_asset_id, p_user_id, v_base, v_original, p_doc)
    on conflict (asset_id) do update
      set base_asset_id = excluded.base_asset_id, original_asset_id = excluded.original_asset_id,
          doc = excluded.doc, updated_at = now();
  update public.posts set updated_at = now() where id = p_post_id;

  return public.unused_layer_assets(p_user_id, v_old_doc, array[p_old_asset_id]);
end $$;

-- "Kembalikan ke asli": the slide shows its image from before the layers again, and the layer document goes.
-- Returns the images nothing uses any more (the edited image, the background, layer images), for the app to delete.
create function public.reset_slide_layers(p_user_id uuid, p_post_id uuid, p_asset_id uuid)
returns uuid[] language plpgsql set search_path = '' as $$
declare
  v_base     uuid;
  v_original uuid;
  v_doc      jsonb;
begin
  perform 1 from public.posts
    where id = p_post_id and user_id = p_user_id
      and status in ('draft', 'scheduled', 'failed', 'cancelled') and ig_container_id is null
    for update;
  if not found then raise exception 'post_locked'; end if;
  select base_asset_id, original_asset_id, doc into v_base, v_original, v_doc
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

  -- The edited image and the background may go; the owner's own photos in the doc stay (only /layers/ ones go).
  return public.unused_layer_assets(p_user_id, v_doc,
    array_remove(array[nullif(p_asset_id, v_original), nullif(v_base, v_original)], null));
end $$;

-- Lapisan ajaib runs inline in the request like an AI slide edit (slide_edit_jobs for cancellation). Its result only
-- adds a layer document: the slide keeps its image until the owner saves in the editor.
create function public.finish_magic_layers(p_user_id uuid, p_id uuid, p_post_id uuid, p_asset_id uuid,
  p_base_asset_id uuid, p_doc jsonb)
returns void language plpgsql set search_path = '' as $$
begin
  perform 1 from public.posts
    where id = p_post_id and user_id = p_user_id
      and status in ('draft', 'scheduled', 'failed', 'cancelled') and ig_container_id is null
    for update;
  if not found then raise exception 'post_locked'; end if;
  perform 1 from public.slide_edit_jobs where id = p_id and user_id = p_user_id and status = 'running' for update;
  if not found then raise exception 'generation_cancelled'; end if;
  if not exists (select 1 from public.post_media where post_id = p_post_id and asset_id = p_asset_id) then
    raise exception 'slide_not_found';
  end if;
  if not exists (select 1 from public.assets where id = p_base_asset_id and user_id = p_user_id) then
    raise exception 'invalid_media';
  end if;
  insert into public.slide_layers (asset_id, user_id, base_asset_id, original_asset_id, doc)
    values (p_asset_id, p_user_id, p_base_asset_id, p_asset_id, p_doc)
    on conflict (asset_id) do nothing;
  if not found then raise exception 'layers_exist'; end if;
  update public.slide_edit_jobs set status = 'ready' where id = p_id;
end $$;

-- Cleanup must not suggest what a slide's layers still draw. Layers of a slide no post shows any more may go.
create or replace function public.storage_cleanup_candidates(p_user_id uuid, p_limit integer default 100)
returns table (id uuid, size_bytes integer, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.size_bytes, a.created_at
    from public.assets a
   where a.user_id = p_user_id
     -- An owner's upload under /layers/ is only ever a layer: once no saved doc draws it, it may go too.
     and (a.origin = 'ai' or a.storage_path like p_user_id::text || '/layers/%')
     and not exists (select 1 from public.post_media m where m.asset_id = a.id)
     and not exists (select 1 from public.thread_item_media t where t.asset_id = a.id)
     and not exists (select 1 from public.post_slides s where s.asset_id = a.id)
     and not exists (
       select 1 from public.slide_layers l
         join public.post_media m on m.asset_id = l.asset_id
        where l.base_asset_id = a.id or l.original_asset_id = a.id
           or l.doc->'layers' @> jsonb_build_array(jsonb_build_object('assetId', a.id::text)))
   order by a.created_at asc, a.size_bytes desc
   limit least(greatest(p_limit, 1), 500);
$$;

revoke execute on function public.slide_layer_asset_unused(uuid), public.unused_layer_assets(uuid, jsonb, uuid[]),
  public.save_slide_layers(uuid, uuid, uuid, uuid, jsonb), public.reset_slide_layers(uuid, uuid, uuid),
  public.finish_magic_layers(uuid, uuid, uuid, uuid, uuid, jsonb), public.storage_cleanup_candidates(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.slide_layer_asset_unused(uuid), public.unused_layer_assets(uuid, jsonb, uuid[]),
  public.save_slide_layers(uuid, uuid, uuid, uuid, jsonb), public.reset_slide_layers(uuid, uuid, uuid),
  public.finish_magic_layers(uuid, uuid, uuid, uuid, uuid, jsonb), public.storage_cleanup_candidates(uuid, integer)
  to service_role;
