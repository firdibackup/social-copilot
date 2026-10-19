-- Each AI slide keeps the one reference image it follows and its role in the carousel, both chosen when the post
-- is made: a cover, inner or CTA slide follows only a reference image of its own label, never the cover's. The
-- role stays what the plan made it, even after other slides fail or are deleted.

alter table public.post_slides
  add column role text check (role in ('cover', 'isi', 'cta')),
  add column reference_image_id uuid references public.brand_reference_images (id) on delete set null;

-- Old slides: the role by place (as the image prompt read it), the image of their group with that label. A group
-- of photos lends its first photo to every slide; a missing label is left empty, not filled with the cover.
with sized as (
  select s.id, s.position, s.reference_id, max(s.position) over (partition by s.post_id) + 1 as total
    from public.post_slides s
), roled as (
  select id, reference_id,
         case
           when total <= 1 then null
           when position = 0 then 'cover'
           when total > 2 and position = total - 1 then 'cta'
           else 'isi'
         end as role
    from sized
)
update public.post_slides s
   set role = r.role,
       reference_image_id = (
         select i.id
           from public.brand_reference_images i
          where i.reference_id = r.reference_id
            and (
              i.label = coalesce(r.role, 'cover')
              or (coalesce(r.role, 'cover') = 'cover' and i.label = 'single')
              or not exists (
                select 1 from public.brand_reference_images o where o.reference_id = r.reference_id and o.label <> 'single'
              )
            )
          order by (i.label = coalesce(r.role, 'cover')) desc, i.position
          limit 1
       )
  from roled r
 where s.id = r.id;

create index post_slides_reference_image_id_idx on public.post_slides (reference_image_id);

-- p_slides is now [{headline, scene, format, role, reference_image_id, include_logo}]. The image must be one of the
-- user's own; the slide's reference_id is its group, kept for the editor's lists.
create or replace function public.create_content(
  p_user_id uuid,
  p_title   text,
  p_caption text,
  p_slides  jsonb,
  p_idea_id uuid
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

  insert into public.posts (user_id, title, caption, status)
  values (p_user_id, p_title, p_caption, 'draft')
  returning id into v_id;

  insert into public.post_slides
    (user_id, post_id, position, headline, scene, format, role, reference_image_id, reference_id, include_logo)
  select p_user_id, v_id, (slides.ordinality - 1)::smallint, coalesce(slides.slide ->> 'headline', ''),
         slides.slide ->> 'scene', slides.slide ->> 'format', nullif(slides.slide ->> 'role', ''), image.id,
         image.reference_id, coalesce((slides.slide ->> 'include_logo')::boolean, false)
    from jsonb_array_elements(p_slides) with ordinality as slides (slide, ordinality)
    left join public.brand_reference_images image
      on image.id = nullif(slides.slide ->> 'reference_image_id', '')::uuid and image.user_id = p_user_id;

  if p_idea_id is not null then
    delete from public.content_ideas where id = p_idea_id and user_id = p_user_id;
  end if;
  return v_id;
end;
$$;

-- An edited slide keeps the role and reference image it was made with. One that isn't the user's own, or was
-- deleted while the image was made, is left out.
drop function public.replace_slide(uuid, uuid, uuid, uuid, text, text, text, uuid, boolean);

create function public.replace_slide(
  p_user_id            uuid,
  p_post_id            uuid,
  p_old_asset_id       uuid,
  p_new_asset_id       uuid,
  p_headline           text,
  p_scene              text,
  p_format             text,
  p_role               text,
  p_reference_image_id uuid,
  p_include_logo       boolean
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_position smallint;
  v_image    uuid;
  v_group    uuid;
begin
  perform 1
     from public.posts
    where id = p_post_id and user_id = p_user_id
      and status in ('draft', 'scheduled', 'failed', 'cancelled') and ig_container_id is null
      for update;
  if not found then
    raise exception 'post_locked';
  end if;
  if not exists (select 1 from public.assets where id = p_new_asset_id and user_id = p_user_id) then
    raise exception 'invalid_media';
  end if;

  update public.post_media
     set asset_id = p_new_asset_id
   where post_id = p_post_id and asset_id = p_old_asset_id
  returning position into v_position;
  if not found then
    raise exception 'slide_not_found';
  end if;

  select id, reference_id into v_image, v_group
    from public.brand_reference_images
   where id = p_reference_image_id and user_id = p_user_id;

  insert into public.post_slides
    (user_id, post_id, position, headline, scene, format, role, reference_image_id, reference_id, include_logo,
     status, asset_id)
  values
    (p_user_id, p_post_id, v_position, p_headline, p_scene, p_format, p_role, v_image, v_group, p_include_logo,
     'ready', p_new_asset_id);
  update public.posts set updated_at = now() where id = p_post_id;
end;
$$;

revoke execute on function public.replace_slide(uuid, uuid, uuid, uuid, text, text, text, text, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.replace_slide(uuid, uuid, uuid, uuid, text, text, text, text, uuid, boolean)
  to service_role;
