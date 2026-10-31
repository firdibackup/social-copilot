-- Buat › Threads: write a new chain or edit a whole chain/one post with AI.
alter table public.ai_generations drop constraint ai_generations_task_check;
alter table public.ai_generations add constraint ai_generations_task_check check (task in (
  'captions', 'ideas', 'rewrite', 'hashtags', 'image', 'image_plan',
  'brand_profile', 'brand_visual', 'brand_strategy',
  'content', 'content_slide', 'slide_edit', 'caption_edit', 'content_ideas', 'content_script',
  'website_catalog', 'asset_tags',
  'reply_draft',
  'template_analysis', 'reference_labels',
  'chat', 'deep_search', 'chat_summary',
  'threads_write', 'threads_edit'
));

-- parseBillingCatalog needs a rate for every task; preserve any rates already set by an admin.
update public.billing_catalog
  set config = jsonb_set(config, '{rates,threads_write}', '3'::jsonb, true)
  where not (config->'rates' ? 'threads_write');

update public.billing_catalog
  set config = jsonb_set(config, '{rates,threads_edit}', '2'::jsonb, true)
  where not (config->'rates' ? 'threads_edit');
