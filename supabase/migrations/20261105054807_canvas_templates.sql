-- Editable user templates are separate from the admin's raster design_templates.
create table public.canvas_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id text not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  doc jsonb not null check (jsonb_typeof(doc) = 'object'
    and doc->>'format' is not distinct from 'carousely.design'
    and doc->>'schemaVersion' is not distinct from '1'),
  page_count integer generated always as (jsonb_array_length(doc->'pages')) stored,
  preview_asset_id uuid references public.assets(id) on delete restrict,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default clock_timestamp()
);
create index canvas_templates_account_idx on public.canvas_templates(user_id, account_id, updated_at desc)
  where archived_at is null;
alter table public.canvas_templates enable row level security;
revoke all on public.canvas_templates from anon, authenticated;
grant all on public.canvas_templates to service_role;

create table public.canvas_template_assets (
  template_id uuid not null references public.canvas_templates(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete restrict,
  primary key(template_id, asset_id)
);
create index canvas_template_assets_asset_idx on public.canvas_template_assets(asset_id);
alter table public.canvas_template_assets enable row level security;
revoke all on public.canvas_template_assets from anon, authenticated;
grant all on public.canvas_template_assets to service_role;

create function public.sync_canvas_template_assets()
returns trigger language plpgsql set search_path = '' as $$
declare v_refs uuid[];
begin
  v_refs := public.design_document_asset_ids(new.doc) || array_remove(array[new.preview_asset_id], null);
  -- Lock referenced assets against deletion until the foreign keys have been installed.
  perform 1 from public.assets where id = any(v_refs) for key share;
  if exists (select 1 from unnest(v_refs) r(id) where not exists (
    select 1 from public.assets a where a.id = r.id and a.user_id = new.user_id and a.account_id = new.account_id
  )) then raise exception 'invalid_media'; end if;
  delete from public.canvas_template_assets where template_id = new.id;
  insert into public.canvas_template_assets(template_id, asset_id)
    select new.id, id from unnest(v_refs) r(id) group by id;
  return new;
end;
$$;
create trigger sync_canvas_template_assets after insert or update of doc, preview_asset_id, user_id, account_id
  on public.canvas_templates for each row execute function public.sync_canvas_template_assets();

create function public.save_canvas_template(p_user_id uuid, p_account_id text, p_id uuid, p_name text,
  p_doc jsonb, p_preview_asset_id uuid, p_expected_version timestamptz)
returns public.canvas_templates language plpgsql set search_path = '' as $$
declare v_row public.canvas_templates;
begin
  if p_expected_version is null then
    insert into public.canvas_templates(id, user_id, account_id, name, doc, preview_asset_id)
      values (p_id, p_user_id, p_account_id, p_name, p_doc, p_preview_asset_id)
      on conflict (id) do nothing returning * into v_row;
    if not found then raise exception 'conflict'; end if;
  else
    select * into v_row from public.canvas_templates where id = p_id
      and user_id = p_user_id and account_id = p_account_id and archived_at is null for update;
    if not found or v_row.updated_at is distinct from p_expected_version then raise exception 'conflict'; end if;
    update public.canvas_templates set name = p_name, doc = p_doc, preview_asset_id = p_preview_asset_id,
      updated_at = greatest(clock_timestamp(), v_row.updated_at + interval '1 microsecond')
      where id = p_id returning * into v_row;
  end if;
  return v_row;
end;
$$;

create or replace function public.slide_layer_asset_unused(p_asset_id uuid)
returns boolean language sql stable set search_path = '' as $$
  select not exists (select 1 from public.post_media where asset_id = p_asset_id)
    and not exists (select 1 from public.thread_item_media where asset_id = p_asset_id)
    and not exists (select 1 from public.slide_layers where asset_id = p_asset_id)
    and not exists (select 1 from public.slide_design_assets where asset_id = p_asset_id)
    and not exists (select 1 from public.canvas_template_assets where asset_id = p_asset_id);
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
      and not exists (select 1 from public.canvas_template_assets r where r.asset_id = a.id)
    order by a.created_at asc, a.size_bytes desc limit least(greatest(p_limit, 1), 500);
$$;

revoke execute on function public.sync_canvas_template_assets(),
  public.save_canvas_template(uuid, text, uuid, text, jsonb, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.sync_canvas_template_assets(),
  public.save_canvas_template(uuid, text, uuid, text, jsonb, uuid, timestamptz) to service_role;
