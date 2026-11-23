-- Brand › Bahasa konten: the language the brand's content is written in (ideas, scripts, slide text, captions,
-- Threads): Indonesian, English, or Indonesian mixed with everyday English. Empty keeps the earlier behaviour: the
-- content follows the language the owner reads the app in.
alter table public.brand_kit
  add column content_language text not null default '' check (content_language in ('', 'id', 'en', 'mixed'));

-- What the onboarding already asked ("Caption post-mu pakai bahasa apa?").
update public.brand_kit k set content_language = o.caption_language
  from public.onboarding o
  where o.user_id = k.user_id and o.caption_language in ('id', 'en', 'mixed') and k.content_language = '';
