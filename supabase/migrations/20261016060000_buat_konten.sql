-- Buat Konten: one AI step writes a post's caption and plans its slides, paid once; the slides' images are then
-- made one by one. Same rules as the other tables: RLS on with no policies, so only the server's service-role key
-- can read or write.

-- Post ideas the AI suggests from the brand kit. One becomes a post's topic and is then deleted.
create table public.content_ideas (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 200),
  created_at timestamptz not null default now()
);

create index content_ideas_user_id_created_at_idx on public.content_ideas (user_id, created_at);

-- A short name for the post lists; empty means the list shows the caption's first line.
alter table public.posts add column title text not null default '' check (char_length(title) <= 120);

-- AI slides: the prompt each image came from, read again when the owner edits the slide, and the generation queue
-- for images not made yet. post_media stays what gets published; a ready slide's image is in both. An edit adds a
-- row for the new image, so a slide is found by its asset, not by its position.
create table public.post_slides (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  post_id      uuid not null references public.posts (id) on delete cascade,
  position     smallint not null check (position between 0 and 9),
  headline     text not null default '' check (char_length(headline) <= 150),
  scene        text not null check (char_length(scene) between 1 and 1000),
  format       text not null check (format in ('4:5', '1:1')),
  reference_id uuid references public.brand_references (id) on delete set null,
  include_logo boolean not null default false,
  status       text not null default 'pending' check (status in ('pending', 'generating', 'ready', 'failed')),
  claimed_at   timestamptz,  -- when a generator took it; a generating slide older than 5 minutes is taken again
  error        text,
  asset_id     uuid references public.assets (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index post_slides_post_id_position_idx on public.post_slides (post_id, position);
create index post_slides_asset_id_idx on public.post_slides (asset_id);

alter table public.ai_generations drop constraint ai_generations_task_check;
alter table public.ai_generations add constraint ai_generations_task_check check (task in (
  'captions', 'ideas', 'rewrite', 'hashtags', 'image', 'image_plan', -- before Buat Konten, kept for old rows
  'brand_profile', 'brand_visual',
  'content', 'content_slide', 'slide_edit', 'caption_edit', 'content_ideas'
));

-- Creates the draft and its pending slides in one transaction, and uses up the idea it came from. p_slides is
-- [{headline, scene, format, reference_id, include_logo}]; a reference must be one of the user's own.
create function public.create_content(
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
     where nullif(slide ->> 'reference_id', '') is not null
       and not exists (
         select 1 from public.brand_references
          where id = (slide ->> 'reference_id')::uuid and user_id = p_user_id
       )
  ) then
    raise exception 'invalid_reference';
  end if;

  insert into public.posts (user_id, title, caption, status)
  values (p_user_id, p_title, p_caption, 'draft')
  returning id into v_id;

  insert into public.post_slides (user_id, post_id, position, headline, scene, format, reference_id, include_logo)
  select p_user_id, v_id, (slides.ordinality - 1)::smallint, coalesce(slides.slide ->> 'headline', ''),
         slides.slide ->> 'scene', slides.slide ->> 'format', nullif(slides.slide ->> 'reference_id', '')::uuid,
         coalesce((slides.slide ->> 'include_logo')::boolean, false)
    from jsonb_array_elements(p_slides) with ordinality as slides (slide, ordinality);

  if p_idea_id is not null then
    delete from public.content_ideas where id = p_idea_id and user_id = p_user_id;
  end if;
  return v_id;
end;
$$;

-- Hands one slide to a generator. Pending and failed slides can be taken; a generating one only after 5 minutes,
-- when its generator has evidently died. Two tabs on one post never make the same slide twice.
create function public.claim_slide(p_user_id uuid, p_id uuid)
returns setof public.post_slides
language sql
set search_path = ''
as $$
  update public.post_slides
     set status = 'generating', claimed_at = now(), error = null, updated_at = now()
   where id = p_id
     and user_id = p_user_id
     and (status in ('pending', 'failed') or (status = 'generating' and claimed_at < now() - interval '5 minutes'))
  returning *;
$$;

-- Puts a generated image into its post: the slide becomes ready and the photo joins post_media at the slide's
-- place, or at the first free place when an edit of the post has taken that place since. The first free place,
-- not after the last photo: a slide that landed at its own place past a renumbered list leaves a gap, and the end
-- can be past 9 while the post has room. The post row is locked first, so this waits for a save_post in progress
-- instead of interleaving with its delete and insert.
create function public.attach_slide(p_slide_id uuid, p_asset_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_user     uuid;
  v_post     uuid;
  v_position smallint;
begin
  select user_id, post_id, position into v_user, v_post, v_position
    from public.post_slides
   where id = p_slide_id and status = 'generating';
  if not found then
    raise exception 'slide_not_claimed';
  end if;
  if not exists (select 1 from public.assets where id = p_asset_id and user_id = v_user) then
    raise exception 'invalid_media';
  end if;

  perform 1
     from public.posts
    where id = v_post and status in ('draft', 'scheduled', 'failed', 'cancelled') and ig_container_id is null
      for update;
  if not found then
    raise exception 'post_locked';
  end if;

  if exists (select 1 from public.post_media where post_id = v_post and position = v_position) then
    select min(free.position) into v_position
      from generate_series(0, 9) as free (position)
     where not exists (select 1 from public.post_media where post_id = v_post and position = free.position);
  end if;
  if v_position is null then
    raise exception 'post_full';
  end if;

  insert into public.post_media (post_id, asset_id, position) values (v_post, p_asset_id, v_position);
  -- Checked again: after the 5-minute reclaim, two generators of one slide can both read it as generating above.
  -- The second waits for the post lock, then finds it ready here, and its insert is rolled back.
  update public.post_slides
     set status = 'ready', asset_id = p_asset_id, error = null, updated_at = now()
   where id = p_slide_id and status = 'generating';
  if not found then
    raise exception 'slide_not_claimed';
  end if;
  update public.posts set updated_at = now() where id = v_post;
end;
$$;

-- An edited slide: its new image takes the old one's place in post_media, and a ready row keeps the new prompt.
-- A reference that isn't the user's own, or was deleted while the image was made, is left out.
create function public.replace_slide(
  p_user_id      uuid,
  p_post_id      uuid,
  p_old_asset_id uuid,
  p_new_asset_id uuid,
  p_headline     text,
  p_scene        text,
  p_format       text,
  p_reference_id uuid,
  p_include_logo boolean
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_position smallint;
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

  insert into public.post_slides
    (user_id, post_id, position, headline, scene, format, reference_id, include_logo, status, asset_id)
  values
    (p_user_id, p_post_id, v_position, p_headline, p_scene, p_format,
     (select id from public.brand_references where id = p_reference_id and user_id = p_user_id),
     p_include_logo, 'ready', p_new_asset_id);
  update public.posts set updated_at = now() where id = p_post_id;
end;
$$;

alter table public.content_ideas enable row level security;
alter table public.post_slides enable row level security;

revoke all on public.content_ideas, public.post_slides from anon, authenticated;

revoke execute on function public.create_content(uuid, text, text, jsonb, uuid) from public, anon, authenticated;
revoke execute on function public.claim_slide(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.attach_slide(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.replace_slide(uuid, uuid, uuid, uuid, text, text, text, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.create_content(uuid, text, text, jsonb, uuid) to service_role;
grant execute on function public.claim_slide(uuid, uuid) to service_role;
grant execute on function public.attach_slide(uuid, uuid) to service_role;
grant execute on function public.replace_slide(uuid, uuid, uuid, uuid, text, text, text, uuid, boolean) to service_role;
