-- Keyword tags per photo: written by AI (asset_tags, or with the website catalog) and editable by the owner.
alter table public.assets
  add column tags text[] not null default '{}' check (cardinality(tags) <= 20);

-- Photo tagging is billed and shown apart from website cataloging.
alter table public.ai_generations drop constraint ai_generations_task_check;
alter table public.ai_generations add constraint ai_generations_task_check check (task in (
  'captions', 'ideas', 'rewrite', 'hashtags', 'image', 'image_plan',
  'brand_profile', 'brand_visual',
  'content', 'content_slide', 'slide_edit', 'caption_edit', 'content_ideas',
  'website_catalog', 'asset_tags'
));
