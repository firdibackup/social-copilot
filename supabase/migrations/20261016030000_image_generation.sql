-- Gambar AI: image generation and slide planning count towards the same 9Router daily limit.

alter table public.ai_generations drop constraint ai_generations_task_check;
alter table public.ai_generations add constraint ai_generations_task_check
  check (task in ('captions', 'ideas', 'rewrite', 'hashtags', 'brand_profile', 'brand_visual', 'image', 'image_plan'));
