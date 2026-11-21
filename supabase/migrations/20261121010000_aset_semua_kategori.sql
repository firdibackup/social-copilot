-- A slide may use any real photo group the owner has, not only category 'product': places like
-- Outdoor Gym, people and maps too. Logos stay out; they are added through include_logo.
CREATE OR REPLACE FUNCTION public.create_content(p_user_id uuid, p_title text, p_caption text, p_slides jsonb, p_idea_id uuid, p_pillar_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
          where id = (slide ->> 'product_group_id')::uuid and user_id = p_user_id and category <> 'logo'
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
     and product.user_id = p_user_id and product.category <> 'logo';

  if p_idea_id is not null then
    delete from public.content_ideas where id = p_idea_id and user_id = p_user_id;
  end if;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.replace_slide(p_user_id uuid, p_post_id uuid, p_old_asset_id uuid, p_new_asset_id uuid, p_headline text, p_scene text, p_format text, p_role text, p_reference_image_id uuid, p_product_group_id uuid, p_include_logo boolean, p_example text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_position smallint;
  v_image    uuid;
  v_group    uuid;
  v_product  uuid;
begin
  perform 1
     from public.posts
    where id = p_post_id and user_id = p_user_id
      and status in ('draft', 'scheduled', 'failed', 'cancelled') and ig_container_id is null
      for update;
  if not found then raise exception 'post_locked'; end if;
  if not exists (select 1 from public.assets where id = p_new_asset_id and user_id = p_user_id) then
    raise exception 'invalid_media';
  end if;

  update public.post_media set asset_id = p_new_asset_id
   where post_id = p_post_id and asset_id = p_old_asset_id
  returning position into v_position;
  if not found then raise exception 'slide_not_found'; end if;

  select id, reference_id into v_image, v_group from public.brand_reference_images
   where id = p_reference_image_id and user_id = p_user_id;
  select id into v_product from public.asset_groups
   where id = p_product_group_id and user_id = p_user_id and category <> 'logo';

  insert into public.post_slides
    (user_id, post_id, position, headline, scene, format, role, reference_image_id, reference_id,
     product_group_id, include_logo, example, status, asset_id)
  values
    (p_user_id, p_post_id, v_position, p_headline, p_scene, p_format, p_role, v_image, v_group,
     v_product, p_include_logo, nullif(p_example, ''), 'ready', p_new_asset_id);
  update public.posts set updated_at = now() where id = p_post_id;
end;
$function$;
