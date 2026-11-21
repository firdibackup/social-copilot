-- Global curated structures only: never store tenant facts or messages here.
create table if not exists public.hook_templates (
  id text primary key, structure text not null, use_when text not null,
  sources jsonb not null, version text not null
);
alter table public.hook_templates enable row level security;
revoke all on public.hook_templates from public, anon, authenticated;
grant select, insert, update, delete on public.hook_templates to service_role;
insert into public.hook_templates (id, structure, use_when, sources, version) values
('H001','Cara [HASIL] tanpa [HAMBATAN]','Tutorial yang benar-benar mengatasi hambatan audiens.','["S02", "S03"]','2026-10-28'),
('H007','[ALAT/METODE] untuk [KEBUTUHAN_SPESIFIK]','Isi menyediakan alat atau metode beserta cara memakainya.','["S03"]','2026-10-28'),
('H008','Sebelum [TINDAKAN], periksa [HAL]','Checklist persiapan dengan tindakan yang jelas.','["S01"]','2026-10-28'),
('H009','[JUMLAH] cara [HASIL_SPESIFIK]','Ada sejumlah cara berbeda yang muat dan dijelaskan di isi.','["S03"]','2026-10-28'),
('H010','[JUMLAH] langkah menuju [HASIL]','Tutorial berurutan yang bisa diikuti pembaca.','["S03"]','2026-10-28'),
('H012','[JUMLAH] tanda [MASALAH_SPESIFIK]','Isi menjelaskan indikator yang bisa diperiksa tanpa diagnosis berlebihan.','["S03"]','2026-10-28'),
('H026','Benarkah [KEYAKINAN_UMUM]?','Mitos yang bisa dibahas dengan alasan atau bukti; jangan menciptakan konsensus palsu.','["S02"]','2026-10-28'),
('H035','Mengapa [MASALAH_SPESIFIK] terjadi?','Isi mampu menjelaskan penyebab dan tindakan perbaikannya.','["S01", "S02"]','2026-10-28'),
('H041','[AUDIENS], masih [KESULITAN_SPESIFIK]?','Masalah yang relevan dengan segmen brand; sapaan mengikuti brand.','["S03"]','2026-10-28'),
('H049','Temuan dari [PENGAMATAN_NYATA]','Hanya jika riset atau pengalaman yang dimaksud tersedia dalam konteks.','["S01"]','2026-10-28'),
('H050','Bagaimana [SUBJEK] mencapai [HASIL]?','Studi kasus nyata dengan hasil dan proses yang tersedia, bukan rekaan.','["S02"]','2026-10-28'),
('H060','Pelajaran dari [KESALAHAN_NYATA]','Pengalaman personal atau brand memang diberikan; jangan mengaku pernah mengalaminya tanpa sumber.','["S03"]','2026-10-28'),
('H069','Bisakah membedakan [A] dan [B]?','Kuis dengan jawaban dan penjelasan yang disediakan di isi.','["S01"]','2026-10-28'),
('H070','[A] atau [B] untuk [KEBUTUHAN]?','Perbandingan dengan kriteria pemilihan, tanpa pemenang universal palsu.','["S01"]','2026-10-28'),
('IG-20','Template [KEGUNAAN] untuk [SITUASI]','Isi benar-benar menyediakan template yang bisa digunakan.','["S02"]','2026-10-28'),
('WEB-01','Masih melakukan [KESALAHAN] saat [AKTIVITAS]?','Adaptasi formula Do You Make These Mistakes; tunjukkan koreksi konkret pada isi.','["S03"]','2026-10-28'),
('WEB-02','[HASIL] tanpa harus [PRASYARAT_YANG_DIKIRA_WAJIB]','Adaptasi You Don''t Have to Be; isi membuktikan bahwa hambatan tersebut memang tidak wajib.','["S03"]','2026-10-28'),
('WEB-03','Dari [KONDISI_AWAL] menuju [KONDISI_TUJUAN]','Adaptasi Before–After–Bridge; jelaskan jembatannya di isi. Aspirasi bukan klaim hasil pelanggan.','["S02"]','2026-10-28'),
('WEB-04','Sudah [UPAYA], mengapa masih [MASALAH]?','Adaptasi Situation–Complication–Question–Answer; isi menjawab kesenjangan antara upaya dan hasil.','["S02"]','2026-10-28')
on conflict (id) do update set structure=excluded.structure, use_when=excluded.use_when,
sources=excluded.sources, version=excluded.version;

-- ponytail: scan 19 rows; index/semantic retrieval only if the library grows.
create or replace function public.retrieve_hooks(query_text text)
returns table(id text, structure text, use_when text)
language sql stable security invoker set search_path = public
as $$
  with terms as (
    select distinct token from regexp_split_to_table(lower(left(coalesce(query_text, ''), 6000)), '[^[:alnum:]_]+') token
    where length(token) > 3 and token not in ('yang','untuk','dengan','dari','buat','tentang','brand','konten','slide','carousel','instagram')
  ), ranked as (
    select h.*, (select count(*) from terms where
      lower(h.structure || ' ' || h.use_when) like '%' || replace(token, '_', '\_') || '%') as score
    from public.hook_templates h
  )
  select id, structure, use_when from ranked where score > 0
  order by score desc, id limit 3;
$$;
revoke all on function public.retrieve_hooks(text) from public, anon, authenticated;
grant execute on function public.retrieve_hooks(text) to service_role;
notify pgrst, 'reload schema';
