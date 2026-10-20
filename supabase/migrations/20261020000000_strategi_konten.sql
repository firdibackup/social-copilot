-- Content strategy: the brand's identity, its content pillars with their shares, tone, current focus and posts per
-- week, edited on Brand and read by every AI prompt. Ideas and posts remember the pillar they serve, by the pillar's
-- id inside the strategy, so renaming a pillar keeps them; a removed pillar's id simply matches nothing.

alter table public.brand_kit
  add column strategy jsonb check (strategy is null or jsonb_typeof(strategy) = 'object');

alter table public.posts
  add column pillar_id text check (pillar_id ~ '^[a-z0-9-]{1,40}$');

alter table public.content_ideas
  add column pillar_id text check (pillar_id ~ '^[a-z0-9-]{1,40}$');

alter table public.ai_generations drop constraint ai_generations_task_check;
alter table public.ai_generations add constraint ai_generations_task_check check (task in (
  'captions', 'ideas', 'rewrite', 'hashtags', 'image', 'image_plan',
  'brand_profile', 'brand_visual', 'brand_strategy',
  'content', 'content_slide', 'slide_edit', 'caption_edit', 'content_ideas', 'content_script',
  'website_catalog', 'asset_tags',
  'reply_draft'
));

-- create_content gains the pillar the post serves.
drop function public.create_content(uuid, text, text, jsonb, uuid);

create function public.create_content(
  p_user_id uuid,
  p_title   text,
  p_caption text,
  p_slides  jsonb,
  p_idea_id uuid,
  p_pillar_id text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if jsonb_typeof(p_slides) is distinct from 'array' or jsonb_array_length(p_slides) not between 1 and 10 then
    raise exception 'invalid_slides';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_slides) as slide
     where nullif(slide ->> 'reference_image_id', '') is not null
       and not exists (
         select 1 from public.brand_reference_images
          where id = (slide ->> 'reference_image_id')::uuid and user_id = p_user_id
       )
  ) then
    raise exception 'invalid_reference';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_slides) as slide
     where nullif(slide ->> 'product_group_id', '') is not null
       and not exists (
         select 1 from public.asset_groups
          where id = (slide ->> 'product_group_id')::uuid and user_id = p_user_id and category = 'product'
       )
  ) then
    raise exception 'invalid_product';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_slides) as slide
     where nullif(slide ->> 'attachment_path', '') is not null
       and split_part(slide ->> 'attachment_path', '/', 1) <> p_user_id::text
  ) then
    raise exception 'invalid_attachment';
  end if;

  insert into public.posts (user_id, title, caption, status, pillar_id)
  values (p_user_id, p_title, p_caption, 'draft', nullif(p_pillar_id, ''))
  returning id into v_id;

  insert into public.post_slides
    (user_id, post_id, position, headline, scene, format, role, reference_image_id, reference_id,
     product_group_id, include_logo, example, attachment_path, attachment_note)
  select p_user_id, v_id, (slides.ordinality - 1)::smallint, coalesce(slides.slide ->> 'headline', ''),
         slides.slide ->> 'scene', slides.slide ->> 'format', nullif(slides.slide ->> 'role', ''), image.id,
         image.reference_id, product.id, coalesce((slides.slide ->> 'include_logo')::boolean, false),
         nullif(slides.slide ->> 'example', ''), nullif(slides.slide ->> 'attachment_path', ''),
         coalesce(slides.slide ->> 'attachment_note', '')
    from jsonb_array_elements(p_slides) with ordinality as slides (slide, ordinality)
    left join public.brand_reference_images image
      on image.id = nullif(slides.slide ->> 'reference_image_id', '')::uuid and image.user_id = p_user_id
    left join public.asset_groups product
      on product.id = nullif(slides.slide ->> 'product_group_id', '')::uuid
     and product.user_id = p_user_id and product.category = 'product';

  if p_idea_id is not null then
    delete from public.content_ideas where id = p_idea_id and user_id = p_user_id;
  end if;
  return v_id;
end;
$$;

revoke execute on function public.create_content(uuid, text, text, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.create_content(uuid, text, text, jsonb, uuid, text) to service_role;
