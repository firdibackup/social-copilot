-- Design templates: the admin's collection of example slides, uploaded in Admin › Template and sorted by AI into
-- design styles and a slide label. An account without design references of its own follows the templates of its
-- design style. They replace the fixed files in assets/contoh-desain; source_key keeps an imported file's old key,
-- so slides planned before the import still find their example.

create table public.design_templates (
  id           uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  source_key   text unique check (source_key ~ '^[a-z0-9-]{1,60}$'),
  styles       text[] not null default '{}' check (cardinality(styles) <= 8),
  label        text check (label in ('cover', 'isi', 'cta', 'single')),
  note         text not null default '' check (char_length(note) <= 300),
  -- pending: not analysed yet; ready: has styles and a label; failed: the analysis could not read it.
  status       text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  error        text check (char_length(error) <= 300),
  active       boolean not null default true,
  created_by   uuid references auth.users (id) on delete set null,
  analyzed_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (status <> 'ready' or (cardinality(styles) > 0 and label is not null))
);

create index design_templates_styles_idx on public.design_templates using gin (styles);

-- post_slides.example now holds a template's id, or the key of a file from before the import (its source_key).
comment on column public.post_slides.example is 'design_templates.id, or a legacy design_templates.source_key';

-- The admin's template analysis is logged with the admin as the user, and costs nothing.
alter table public.ai_generations drop constraint ai_generations_task_check;
alter table public.ai_generations add constraint ai_generations_task_check check (task in (
  'captions', 'ideas', 'rewrite', 'hashtags', 'image', 'image_plan',
  'brand_profile', 'brand_visual', 'brand_strategy',
  'content', 'content_slide', 'slide_edit', 'caption_edit', 'content_ideas', 'content_script',
  'website_catalog', 'asset_tags',
  'reply_draft',
  'template_analysis'
));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('templates', 'templates', false, 8388608, array['image/jpeg']);

alter table public.design_templates enable row level security;
revoke all on public.design_templates from anon, authenticated;
