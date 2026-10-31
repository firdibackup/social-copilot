# Brand Kit — Desain

- **Tanggal:** 2026-10-16
- **Status:** dibangun 2026-10-16. Integrasi Facebook Login/Business Discovery dihapus 2026-10-31 atas persetujuan owner. Saat pemeriksaan, konfigurasi `FACEBOOK_*` tidak ditemukan di `.env.local`; pemakaian historis atau konfigurasi produksi tidak diverifikasi. Referensi lama bersumber `discovery` tetap bisa ditampilkan dan dihapus.
- **Inspirasi:** brand kit Bleam.ai (dibaca dari halaman publiknya, karena dashboard butuh login): nama brand, kategori, target audiens, gaya bahasa, warna, logo, catatan brand, ditambah "membaca website dan Instagram — bio, caption terbaru, dan pola visual". Antarmuka dan kodenya milik kita sendiri (PRD §3 non-goal).

## Pembaruan 2026-10-31: penghapusan Business Discovery

- Bagian Facebook di Pengaturan, tombol **Dari akun lain** di Brand, route OAuth Facebook, klien API, dan konfigurasi `FACEBOOK_*` sudah dihapus. Setup Facebook Login tidak lagi diperlukan.
- Referensi tetap bisa ditambahkan melalui **Unggah gambar**, **Dari grid**, dan post akun Instagram sendiri.
- Nilai sumber `discovery` dan label **Akun lain** dipertahankan untuk referensi yang sudah tersimpan; impor baru melalui Business Discovery tidak tersedia.
- Tabel `facebook_connections`, data yang mungkin tersimpan di dalamnya, dan migrasi historis tidak dihapus atau diubah. Penghapusan fitur ini bukan pembersihan token di database.
- Intel Kompetitor di Mimo memakai Apify, bukan Business Discovery. Parser `parseInstagramUsername` beserta tesnya dipindahkan ke `src/lib/instagram.ts` dan `src/lib/instagram.test.ts` karena masih dipakai fitur tersebut.

Bagian berikut mencatat desain awal dengan cakupan Business Discovery dihapus. Detail lain tetap merupakan catatan desain pada tanggal pembuatannya, bukan spesifikasi lengkap produk terkini.

## Tujuan dan kriteria sukses

Owner punya satu brand kit yang diisi otomatis dari website-nya, akun IG-nya sendiri, dan referensi desain dari unggahan, potongan grid, atau post akun sendiri. Brand kit bisa diedit kapan saja. Buat AI memakai bagian teksnya untuk setiap caption. Bagian visual (palet, logo, font, gaya visual, referensi) disimpan untuk gambar AI.

Sukses kalau:

1. **Analisis** dengan URL website dan akun IG sendiri mengisi form brand (nama, kategori, deskripsi, audiens, gaya bahasa, kata dipakai/dihindari, fakta) sebagai draf, plus saran warna, font, dan logo. Tidak ada yang tersimpan sebelum owner menekan **Simpan**.
2. Owner bisa menambah referensi dari unggahan, potongan grid, dan post akun sendiri. Setiap referensi punya palet yang dihitung dari pikselnya.
3. **Analisis visual** mengirim referensi ke AI vision dan mengisi "Gaya visual" (draf) serta deskripsi per referensi.
4. Caption dari Buat AI memakai nama, audiens, gaya bahasa, dan fakta brand. Fakta brand termasuk fakta yang boleh dipakai AI.

## Keputusan

| Topik | Keputusan | Alasan |
|---|---|---|
| Palet | Dihitung di browser dari piksel (canvas) | Hasilnya pasti dan gratis. AI vision hanya menebak kode hex. Supabase Storage mengirim header CORS (dicek 2026-10-16), jadi gambar hasil impor bisa dibaca canvas. |
| Pola visual | AI vision lewat 9Router | `cc/claude-haiku-4-5-20251001` membaca gambar data URL dengan benar (dicek 2026-10-16: empat kuadran warna dijawab tepat). |
| Website | Server mengambil HTML + maksimal 3 stylesheet (milik situs dulu, lalu CDN seperti Squarespace; CSS font dilewati), tanpa library baru | Warna dari CSS dan `theme-color`, font dari `font-family` dan Google Fonts, logo dari `<img>` "logo", ikon, dan `og:image`. Teks halaman dibaca AI. Headless browser dan layanan pihak ketiga ditolak (dependensi berat atau data keluar). |
| Penyimpanan gambar | Bucket privat baru `brand` (JPEG, PNG, WebP, 8 MB) | Bucket `media` hanya JPEG dan dipakai untuk publish. Referensi desain tidak boleh masuk pemilih foto post. |
| Draf | Hasil analisis profil dan gaya visual hanya mengisi form | Aturan PRD: keluaran AI selalu draf yang bisa diedit. Deskripsi per referensi langsung tersimpan karena tetap bisa diedit di kartunya. |
| Batas AI | Tugas `brand_profile` dan `brand_visual` ikut `DAILY_LIMIT` dan dicatat di `ai_generations` | Satu kuota untuk semua pemakaian 9Router. Data gambar tidak ikut dicatat. |

## Temuan API (dicek 2026-10-16)

- Instagram Login, `/me`: `user_id`, `username`, `name`, `biography`, `profile_picture_url`, `media_count` terisi. `website` tidak dikirim.
- `/me/media`: `caption`, `media_url`, `permalink`; carousel punya `media_url` slide pertama dan `children{media_url}`.
- 9Router berada di belakang nginx dengan `client_max_body_size` bawaan 1 MB: body 803 KB lolos, 1.469 KB dijawab 413. Gambar lewat URL ditolak kecuali HTTPS ("Only HTTPS URLs are supported"), padahal `NEXT_PUBLIC_SUPABASE_URL` masih `http://`. Setelah error provider, 9Router bisa mengulang error itu untuk permintaan berikutnya ("reset after 30s").
- Tes langsung: analisis profil 6–9 detik, analisis visual 4 referensi sekitar 11 detik. Warna CSS tokopedia.com dan fore.coffee terbaca benar (`#00aa5b`, `#006041`). kopikenangan.com (Squarespace, warna lewat variabel HSL) tidak memberi warna, dan janjijiwa.com menolak dengan 403.

## Model data

Migrasi `20261016020000_brand_kit.sql`, pola sama: RLS aktif tanpa policy, hak `anon`/`authenticated` dicabut.

- **`brand_kit`** (satu baris, `id = 1`): `name`, `category`, `description`, `website_url`, `audience`, `voice`, `words_use`, `words_avoid`, `facts`, `colors` (jsonb `[{hex, role}]`, maks 6), `heading_font`, `body_font`, `visual_style`, `logo_path`, `updated_at`. Semua teks punya batas panjang lewat CHECK.
- **`brand_references`**: `id`, `storage_path`, `content_type`, `source` (`upload`, `website`, `instagram`, `discovery`), `source_label` (mis. `@akun` atau domain), `permalink`, `palette` (jsonb hex), `description` (AI), `note` (owner), `created_at`. Maks 30, dicek di server.
- **`ai_generations.task`**: CHECK ditambah `brand_profile` dan `brand_visual`.
- **Bucket `brand`**: privat, 8 MB, `image/jpeg`, `image/png`, `image/webp`.

## Alur

### Analisis profil (`brand_profile`)
1. Owner mengisi URL website dan/atau mencentang akun IG yang terhubung, lalu klik **Analisis**.
2. Server membaca website (`fetchPublic`: hanya http/https, host privat/loopback ditolak di setiap redirect, maks 2 MB, 10 detik) dan/atau `/me` + 12 caption terbaru.
3. Satu permintaan AI mengembalikan JSON draf: `name`, `category`, `description`, `audience`, `voice`, `wordsUse`, `wordsAvoid`, `facts`. Field kosong kalau sumber tidak menyebutnya.
4. Form terisi, field yang berubah ditandai. Saran warna (CSS), font, logo, dan gambar website tampil sebagai pilihan.

### Referensi
- **Upload:** browser memperkecil sisi terpanjang ke 1080 px (JPEG kualitas 0,85), supaya lebih banyak referensi muat dalam batas 1 MB 9Router, dan menghitung palet sebelum mengirim.
- **Akun sendiri:** server mengembalikan 24 post terbaru (gambar dari CDN Instagram). Owner memilih, server mengunduh ke bucket `brand`. Browser lalu menghitung palet dari signed URL dan menyimpannya.
- **Analisis visual (`brand_visual`):** sampai 8 referensi terbaru yang muat bersama dalam 900.000 karakter data URL (`VISUAL_BODY_BUDGET`, di bawah batas 1 MB) dikirim beserta catatan owner. Yang tidak muat dilewati dan jumlahnya ditampilkan. AI mengembalikan `visualStyle` (draf di form) dan deskripsi per referensi (langsung disimpan).

### Buat AI
`runAiTask` memuat konteks brand (teks saja). Prompt mendapat blok "Tentang brand". Audiens kosong di brief memakai audiens brand. Kalau ada fakta brand, pengingat penutup menjadi "Hanya pakai fakta dari brief dan fakta brand di atas." Kalau brand kit gagal dimuat, AI tetap jalan tanpa brand.

## Error

- Website: URL tidak valid, host privat, timeout, bukan HTML, terlalu besar → pesan Indonesia per kasus.
- AI: memakai `aiErrorMessage` yang sudah ada.

## Tes

Vitest untuk: validasi brand kit, palet, ekstraksi website dan `fetchPublic`, prompt dan parser `brand_profile`/`brand_visual`, blok brand di prompt caption, serta parser username Instagram. Pemeriksaan langsung: analisis website nyata dan analisis visual dengan `ROUTER_MODEL` sungguhan.

## Ditunda

- Gambar AI yang memakai brand kit (menunggu model gambar).
- Lebih dari satu brand.
- Membaca lebih dari satu halaman website.
