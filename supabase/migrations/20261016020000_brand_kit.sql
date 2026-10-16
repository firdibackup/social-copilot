-- Brand kit: the owner's brand profile, design references, and the Facebook Page connection that
-- Business Discovery needs. Same rules as the other tables: RLS on with no policies, so only the
-- server's service-role key can read or write.

create table public.brand_kit (
  id           smallint primary key default 1 check (id = 1), -- one brand
  name         text not null default '' check (char_length(name) <= 100),
  category     text not null default '' check (char_length(category) <= 100),
  description  text not null default '' check (char_length(description) <= 1000),
  website_url  text not null default '' check (char_length(website_url) <= 500),
  audience     text not null default '' check (char_length(audience) <= 300),
  voice        text not null default '' check (char_length(voice) <= 1000),
  words_use    text not null default '' check (char_length(words_use) <= 500),
  words_avoid  text not null default '' check (char_length(words_avoid) <= 500),
  facts        text not null default '' check (char_length(facts) <= 2000),
  colors       jsonb not null default '[]' check (jsonb_typeof(colors) = 'array'), -- [{hex, role}]
  heading_font text not null default '' check (char_length(heading_font) <= 100),
  body_font    text not null default '' check (char_length(body_font) <= 100),
  visual_style text not null default '' check (char_length(visual_style) <= 2000),
  logo_path    text,                                                                -- object in the `brand` bucket
  updated_at   timestamptz not null default now()
);

create table public.brand_references (
  id           uuid primary key default gen_random_uuid(),
  storage_path text not null unique, -- object in the `brand` bucket
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  source       text not null check (source in ('upload', 'website', 'instagram', 'discovery')),
  source_label text not null default '' check (char_length(source_label) <= 200), -- @account or domain
  permalink    text check (char_length(permalink) <= 500),                      -- the post or page it came from
  palette      jsonb not null default '[]' check (jsonb_typeof(palette) = 'array'), -- hex strings
  description  text not null default '' check (char_length(description) <= 1000), -- written by AI, editable
  note         text not null default '' check (char_length(note) <= 500),        -- what the owner wants from it
  created_at   timestamptz not null default now()
);

create index brand_references_created_at_idx on public.brand_references (created_at);

-- The Facebook Page whose Instagram account runs Business Discovery. The Page token comes from a
-- long-lived user token, so it does not expire; it stops working only when the owner revokes access.
create table public.facebook_connections (
  id                smallint primary key default 1 check (id = 1),
  page_id           text not null,
  page_name         text not null,
  instagram_user_id text not null,
  username          text not null,
  access_token_enc  text not null, -- AES-256-GCM, "v1:<iv>:<tag>:<ciphertext>"
  status            text not null default 'active' check (status in ('active', 'needs_reconnect')),
  connected_at      timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.ai_generations drop constraint ai_generations_task_check;
alter table public.ai_generations add constraint ai_generations_task_check
  check (task in ('captions', 'ideas', 'rewrite', 'hashtags', 'brand_profile', 'brand_visual'));

-- Separate from `media`, which is JPEG-only and feeds publishing: other accounts' photos stay out of it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand', 'brand', false, 8388608, array['image/jpeg', 'image/png', 'image/webp']);

alter table public.brand_kit enable row level security;
alter table public.brand_references enable row level security;
alter table public.facebook_connections enable row level security;

revoke all on public.brand_kit, public.brand_references, public.facebook_connections from anon, authenticated;
