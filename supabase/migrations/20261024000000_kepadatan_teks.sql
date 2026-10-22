-- Kepadatan teks: how much text a new post's slides carry (padat, ringkas, seimbang, or lengkap). The account setting
-- is the default the Buat composer starts with; every new post can still pick another. It lives next to the other
-- account defaults. Null means the owner never picked one and follows the app's default (seimbang), so the rows that
-- already exist for slots or Story don't pin a density; a row made only for this leaves the slots null, so they keep
-- following the Brand strategy.
alter table public.schedule_settings
  add column text_density text
  check (text_density in ('padat', 'ringkas', 'seimbang', 'lengkap'));
