-- Where and how large the brand logo is stamped on every slide (Brand › Logo). The stamp is done in code after the
-- image is made, the same on every slide, instead of asking the image model to draw the logo.
alter table public.brand_kit
  add column logo_position text not null default 'bottom-right'
    check (logo_position in ('top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right')),
  add column logo_size text not null default 'medium' check (logo_size in ('small', 'medium', 'large'));
