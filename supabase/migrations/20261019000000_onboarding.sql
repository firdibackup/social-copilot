-- Onboarding: the wizard a paying user sees once, before connecting Instagram. Its answers are kept per user,
-- since no account exists yet, and seed the brand kit of every account connected afterwards. The brand kit
-- gains the account kind and the chosen design style, which the image prompt turns into fonts and layouts.

create table public.onboarding (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  account_kind  text not null default '' check (account_kind in ('', 'bisnis', 'jasa', 'kreator', 'edukasi')),
  name          text not null default '' check (char_length(name) <= 100),
  category      text not null default '' check (char_length(category) <= 100),
  description   text not null default '' check (char_length(description) <= 1000),
  audience      text not null default '' check (char_length(audience) <= 300),
  design_style  text not null default '' check (char_length(design_style) <= 40),
  heading_font  text not null default '' check (char_length(heading_font) <= 100),
  body_font     text not null default '' check (char_length(body_font) <= 100),
  colors        jsonb not null default '[]' check (jsonb_typeof(colors) = 'array'), -- [{hex, role}]
  completed_at  timestamptz,
  updated_at    timestamptz not null default now()
);

alter table public.brand_kit
  add column account_kind text not null default '' check (account_kind in ('', 'bisnis', 'jasa', 'kreator', 'edukasi')),
  add column design_style text not null default '' check (char_length(design_style) <= 40);

alter table public.onboarding enable row level security;
revoke all on public.onboarding from public, anon, authenticated;
