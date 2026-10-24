-- Brand › Referensi › Dari grid: the AI sorts designs cut from one picture into Cover/Isi/CTA/Umum before saving.
-- Ordered after the generation queue migrations, which are ahead of the local clock.
alter table public.ai_generations drop constraint ai_generations_task_check;
alter table public.ai_generations add constraint ai_generations_task_check check (task in (
  'captions', 'ideas', 'rewrite', 'hashtags', 'image', 'image_plan',
  'brand_profile', 'brand_visual', 'brand_strategy',
  'content', 'content_slide', 'slide_edit', 'caption_edit', 'content_ideas', 'content_script',
  'website_catalog', 'asset_tags',
  'reply_draft',
  'template_analysis', 'reference_labels',
  'chat', 'deep_search', 'chat_summary'
));

-- parseBillingCatalog needs a rate for every task; the code that reads it ships after this migration.
update public.billing_catalog
  set config = jsonb_set(config, '{rates,reference_labels}', '2'::jsonb, true)
  where not (config->'rates' ? 'reference_labels');
