# Penyetelan hook dan isi slide (22 Nov 2026)

## Perubahan (di atas 147187d)
- `hook-knowledge.json`: 9 mekanisme hook (Spesimen, Kebalikan, Adegan, Angka menempel di benda, Uji 10 detik, Jawaban di depan, Harga yang tidak terlihat, Hasil dulu, Taruhan keputusan) dengan contoh lemah/kuat dari niche lain; daftar pola yang dihindari (kategori tanpa benda nyata, cetakan "Benarkah…?"/"Sebelum…, cek N hal", label fitur, kuis mudah); aturan baru (hook membuka celah dan memakai detail paling tajam dari isi, suara pembicara brand, tidak memperluas fakta, klaim produk sebatas fakta, variasi mekanisme); `slideRules` (judul klaim, klaim + bukti + tindakan, contoh berlabel "misalnya") dan 8 `slidePatterns`. Template lama tetap di file sebagai sumber migrasi `hook_templates`.
- `hook-guide.ts`: `hookGuide(templates)` selalu memuat aturan, mekanisme, dan pola yang dihindari; struktur dari `retrieve_hooks` tetap dipakai sebagai "struktur pendukung". `slideGuide()` baru, dipanggil dari `carouselGuide`.
- `carousel-guide.ts`: `HOOK_QUALITY_RULE` baru (ujian "masih cocok di brand lain?"), hook 5–12 kata, dan 11 bullet (hook bukan perkenalan brand, informasi baru per slide, default 4–5 slide, tanpa generalisasi tanpa dasar, sudut orang pertama sesuai suara, CTA nyambung dan berbeda antar ide, hook menyisakan satu hal untuk slide 2, isi menjawab kenapa/bagaimana, tulis untuk pembaca).
- `content-ai.ts`: ide memakai sudut dan fakta utama berbeda.
- Mekanisme dan pola slide sengaja TIDAK disimpan di `hook_templates`: `retrieve_hooks` mencocokkan kata kunci dan akan menyisipkan contoh fiktif (mis. angka cicilan) sebagai "struktur hook" ke akun properti.

## Hasil (juri Claude Opus 5.5, kode produksi 147187d, model produksi cc/claude-sonnet-5-5, hook dan studi kasus dari Supabase)
Merek: Salah dulu English, Brovolution, Engineering Wakanda, PARKSPRING Gading. "Layak" = stop ≥4, jujur ≥4, lainnya ≥3. Dua ulangan.

| Versi | Ide layak | Skrip layak | Stop (ide) | Spesifik (ide) | Isi (ide) | Jujur (ide) |
|---|---|---|---|---|---|---|
| 147187d | 3/20, 2/20 | 0/8, 0/8 | 2.85 / 2.55 | 3.15 / 2.75 | 2.80 / 2.20 | 3.80 / 4.05 |
| Patch ini | 6/20, 4/20 | 5/8, 4/8 | 3.25 / 3.15 | 3.55 / 3.50 | 2.65 / 2.70 | 3.80 / 3.65 |
| Patch + aturan pengetahuan umum (dibatalkan) | 3/20, 4/20 | 3/8, 4/8 | 2.90 / 2.95 | 3.20 / 3.25 | 2.65 / 2.75 | 3.70 / 3.95 |

Juri berubah-ubah sekitar ±2 ide per 20; perbedaan skrip (0/16 lawan 9/16) dan skor hook konsisten di kedua ulangan.

## Sisa masalah
- Jalur ide (5 skrip dalam satu jawaban) tetap tipis: skor isi ~2.7. Skrip yang ditulis per ide jauh lebih baik (isi ~3.3–3.7). Kandidat perbaikan: ide hanya judul + sudut, skrip ditulis saat ide dibuka.
- Engineering Wakanda: model kadang tidak menjelaskan pengetahuan umum (arti P/S pada BJTP/BJTS) karena aturan kejujuran; aturan tambahan untuk itu tidak menaikkan hasil.
- Hook topik umum yang sudah dipakai banyak akun ("I'm agree", "rajin gym tapi…") tetap gagal di juri; perlu data postingan berperforma atau pilihan hook oleh owner.

## Studi kasus (generik)
1. Hook = nama kategori → satu kesalahan nyata yang dikutip persis.
2. Hook membocorkan jawaban → tahan satu bagian untuk slide 2.
3. Detail terkuat di slide 3 → jadikan hook.
4. Hook jualan ("X, Y, Z: brand punya panduannya") → mulai dari masalah pembaca.
5. Carousel 7 slide, 3 informasi → 4–5 slide.
6. Poin mengulang judul ("Slime — bermain dengan slime") → alasan, contoh, atau langkah.
7. Generalisasi tanpa dasar ("pemula paling sering…") → hapus.
8. Fakta diperluas ("satu penawaran" → "semua tiket") → sebut cakupan.
9. CTA seragam atau tidak nyambung → CTA mengikuti isi.
10. Bahasa internal bocor ke slide ("salah satu caption menyebut…") → tulis untuk pembaca.
