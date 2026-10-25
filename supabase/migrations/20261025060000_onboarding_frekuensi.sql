-- Onboarding asks how often the user wants to post and where they heard of Carousely. The brand colour step is
-- gone; the colors column stays for answers saved before.
alter table public.onboarding
  add column posts_per_week integer not null default 0 check (posts_per_week in (0, 3, 5, 7, 14)),
  add column referral_source text not null default '' check (char_length(referral_source) <= 100);
