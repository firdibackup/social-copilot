-- A single post (one image, no carousel) can carry a whole text-led design: 20 examples, a formula box, a note
-- and the owner's visual spec. Carousel slides stay at 300/1000 in the app (HEADLINE_MAX_LENGTH, SCENE_MAX_LENGTH);
-- the table allows the single post's limits (SINGLE_HEADLINE_MAX_LENGTH, SINGLE_SCENE_MAX_LENGTH).
alter table public.post_slides drop constraint post_slides_headline_check;
alter table public.post_slides add constraint post_slides_headline_check check (char_length(headline) <= 5000);
alter table public.post_slides drop constraint post_slides_scene_check;
alter table public.post_slides add constraint post_slides_scene_check check (char_length(scene) between 1 and 3000);
