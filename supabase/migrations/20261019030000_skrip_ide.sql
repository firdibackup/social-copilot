-- The slide-by-slide script the AI writes from an idea, edited by the owner before the post is made from it.
-- Null until the owner asks for one; deleted with the idea when the post is made.
alter table public.content_ideas
  add column script jsonb check (script is null or (jsonb_typeof(script) = 'array' and jsonb_array_length(script) between 1 and 10));

alter table public.ai_generations drop constraint ai_generations_task_check;
alter table public.ai_generations add constraint ai_generations_task_check check (task in (
  'captions', 'ideas', 'rewrite', 'hashtags', 'image', 'image_plan',
  'brand_profile', 'brand_visual',
  'content', 'content_slide', 'slide_edit', 'caption_edit', 'content_ideas', 'content_script',
  'website_catalog', 'asset_tags'
));
