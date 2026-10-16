# Brand Kit — Desain

- **Tanggal:** 2026-10-16
- **Status:** disetujui lewat brainstorming. Owner memilih satu fase (Business Discovery ikut sekarang) dan meminta langsung dieksekusi tanpa review spec atau rencana tertulis.
- **Inspirasi:** brand kit Bleam.ai (dibaca dari halaman publiknya, karena dashboard butuh login): nama brand, kategori, target audiens, gaya bahasa, warna, logo, catatan brand, ditambah "membaca website dan Instagram — bio, caption terbaru, dan pola visual". Antarmuka dan kodenya milik kita sendiri (PRD §3 non-goal).

## Tujuan dan kriteria sukses

Owner punya satu brand kit yang diisi otomatis dari website-nya, akun IG-nya sendiri, dan referensi desain (upload atau impor dari akun IG lain). Brand kit bisa diedit kapan saja. Buat AI memakai bagian teksnya untuk setiap caption. Bagian visual (palet, logo, font, gaya visual, referensi) disimpan untuk gambar AI, yang menunggu model gambar di 9Router.

Sukses kalau:

1. **Analisis** dengan URL website dan akun IG sendiri mengisi form brand (nama, kategori, deskripsi, audiens, gaya bahasa, kata dipakai/dihindari, fakta) sebagai draf, plus saran warna, font, dan logo. Tidak ada yang tersimpan sebelum owner menekan **Simpan**.
2. Owner bisa menambah referensi dari upload, dari post akun sendiri, dan dari post akun Business/Creator lain lewat `@username`. Setiap referensi punya palet 5 warna yang dihitung dari pikselnya.
3. **Analisis visual** mengirim referensi ke AI vision dan mengisi "Gaya visual" (draf) serta deskripsi per referensi.
4. Caption dari Buat AI memakai nama, audiens, gaya bahasa, dan fakta brand. Fakta brand termasuk fakta yang boleh dipakai AI.

## Keputusan

| Topik | Keputusan | Alasan |
|---|---|---|
| Akun IG lain | Business Discovery API lewat **Facebook Login** (Page token) | Satu-satunya cara resmi membaca post akun lain. Scraping dilarang PRD. Instagram Login tidak punya Business Discovery. |
| Token Facebook | Page access token yang diturunkan dari long-lived user token | Page token seperti itu tidak kedaluwarsa, jadi owner tidak perlu login ulang tiap 60 hari. |
| Palet | Dihitung di browser dari piksel (canvas) | Hasilnya pasti dan gratis. AI vision hanya menebak kode hex. Supabase Storage mengirim header CORS (dicek 2026-10-16), jadi gambar hasil impor bisa dibaca canvas. |
| Pola visual | AI vision lewat 9Router | `cc/claude-haiku-4-5-20251001` membaca gambar data URL dengan benar (dicek 2026-10-16: empat kuadran warna dijawab tepat). |
| Website | Server mengambil HTML + maksimal 3 stylesheet (milik situs dulu, lalu CDN seperti Squarespace; CSS font dilewati), tanpa library baru | Warna dari CSS dan `theme-color`, font dari `font-family` dan Google Fonts, logo dari `<img>` "logo", ikon, dan `og:image`. Teks halaman dibaca AI. Headless browser dan layanan pihak ketiga ditolak (dependensi berat atau data keluar). |
| Penyimpanan gambar | Bucket privat baru `brand` (JPEG, PNG, WebP, 8 MB) | Bucket `media` hanya JPEG dan dipakai untuk publish. Foto akun lain tidak boleh masuk pemilih foto post. |
| Draf | Hasil analisis profil dan gaya visual hanya mengisi form | Aturan PRD: keluaran AI selalu draf yang bisa diedit. Deskripsi per referensi langsung tersimpan karena tetap bisa diedit di kartunya. |
| Batas AI | Tugas `brand_profile` dan `brand_visual` ikut `DAILY_LIMIT` dan dicatat di `ai_generations` | Satu kuota untuk semua pemakaian 9Router. Data gambar tidak ikut dicatat. |

## Temuan API (dicek 2026-10-16)

- Instagram Login, `/me`: `user_id`, `username`, `name`, `biography`, `profile_picture_url`, `media_count` terisi. `website` tidak dikirim.
- `/me/media`: `caption`, `media_url`, `permalink`; carousel punya `media_url` slide pertama dan `children{media_url}`.
- 9Router berada di belakang nginx dengan `client_max_body_size` bawaan 1 MB: body 803 KB lolos, 1.469 KB dijawab 413. Gambar lewat URL ditolak kecuali HTTPS ("Only HTTPS URLs are supported"), padahal `NEXT_PUBLIC_SUPABASE_URL` masih `http://`. Setelah error provider, 9Router bisa mengulang error itu untuk permintaan berikutnya ("reset after 30s").
- Tes langsung: analisis profil 6–9 detik, analisis visual 4 referensi sekitar 11 detik. Warna CSS tokopedia.com dan fore.coffee terbaca benar (`#00aa5b`, `#006041`). kopikenangan.com (Squarespace, warna lewat variabel HSL) tidak memberi warna, dan janjijiwa.com menolak dengan 403.
- Business Discovery: butuh Facebook Login, akun IG profesional yang terhubung ke Facebook Page, izin `instagram_basic`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement` (+ `business_management` kalau Page dikelola Business Manager). Akun personal dan akun dengan batas umur tidak bisa dibaca. Owner adalah admin app, jadi Standard Access cukup tanpa App Review. Dokumentasi tidak menyebut daftar field media secara eksplisit, jadi `media_url` lewat Business Discovery perlu dites setelah Facebook Login terpasang. Video dilewati karena `media_url`-nya bukan gambar.

## Model data

Migrasi `20261016020000_brand_kit.sql`, pola sama: RLS aktif tanpa policy, hak `anon`/`authenticated` dicabut.

- **`brand_kit`** (satu baris, `id = 1`): `name`, `category`, `description`, `website_url`, `audience`, `voice`, `words_use`, `words_avoid`, `facts`, `colors` (jsonb `[{hex, role}]`, maks 6), `heading_font`, `body_font`, `visual_style`, `logo_path`, `updated_at`. Semua teks punya batas panjang lewat CHECK.
- **`brand_references`**: `id`, `storage_path`, `content_type`, `source` (`upload`, `website`, `instagram`, `discovery`), `source_label` (mis. `@akun` atau domain), `permalink`, `palette` (jsonb hex), `description` (AI), `note` (owner), `created_at`. Maks 30, dicek di server.
- **`facebook_connections`** (satu baris): `page_id`, `page_name`, `instagram_user_id`, `username`, `access_token_enc` (AES-256-GCM seperti token Instagram), `status`, `connected_at`, `updated_at`.
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
- **Akun sendiri / akun lain:** server mengembalikan 24 post terbaru (gambar dari CDN Instagram). Owner memilih, server mengunduh ke bucket `brand`. Browser lalu menghitung palet dari signed URL dan menyimpannya.
- **Analisis visual (`brand_visual`):** sampai 8 referensi terbaru yang muat bersama dalam 900.000 karakter data URL (`VISUAL_BODY_BUDGET`, di bawah batas 1 MB) dikirim beserta catatan owner. Yang tidak muat dilewati dan jumlahnya ditampilkan. AI mengembalikan `visualStyle` (draf di form) dan deskripsi per referensi (langsung disimpan).

### Buat AI
`runAiTask` memuat konteks brand (teks saja). Prompt mendapat blok "Tentang brand". Audiens kosong di brief memakai audiens brand. Kalau ada fakta brand, pengingat penutup menjadi "Hanya pakai fakta dari brief dan fakta brand di atas." Kalau brand kit gagal dimuat, AI tetap jalan tanpa brand.

### Facebook Login
`/api/auth/facebook/start` (lokal) → dialog Facebook (`config_id` kalau `FACEBOOK_LOGIN_CONFIG_ID` diisi, selain itu `scope`) → `/api/auth/facebook/callback` (publik lewat tunnel, masuk `PUBLIC_PATHS`) → tukar code, long-lived user token, `/me/accounts` → pilih Page yang akun IG-nya sama dengan akun Instagram yang terhubung (atau Page pertama yang punya akun IG) → simpan Page token. Hasil dilaporkan sebagai `?fb=` / `?fb_error=` di Pengaturan.

## Error

- Website: URL tidak valid, host privat, timeout, bukan HTML, terlalu besar → pesan Indonesia per kasus.
- Business Discovery: kode Graph 100/110 → "akun tidak ditemukan, akun personal, atau dibatasi umur"; 190 → status Facebook `needs_reconnect` dan minta hubungkan ulang; izin kurang (10, 200) → sebut izinnya.
- AI: memakai `aiErrorMessage` yang sudah ada.

## Setup Meta (sekali)

1. Di app Meta yang sama, tambah produk **Facebook Login for Business**. Buat konfigurasi (User access token) dengan izin di atas, salin Configuration ID ke `FACEBOOK_LOGIN_CONFIG_ID`.
2. Isi `FACEBOOK_APP_ID` dan `FACEBOOK_APP_SECRET` dari App settings → Basic (berbeda dengan Instagram App ID/Secret).
3. Daftarkan `https://<domain-ngrok>/api/auth/facebook/callback` di Valid OAuth Redirect URIs dan isi `FACEBOOK_REDIRECT_URI` dengan nilai yang sama.
4. Pastikan akun IG terhubung ke Facebook Page yang kamu kelola, lalu klik **Hubungkan Facebook** di Pengaturan.

## Tes

Vitest untuk: validasi brand kit, palet, ekstraksi website dan `fetchPublic`, prompt dan parser `brand_profile`/`brand_visual`, blok brand di prompt caption, klien Facebook (URL login, token, pemilihan Page, Business Discovery, username), callback Facebook, dan `PUBLIC_PATHS`. Pemeriksaan langsung: analisis website nyata dan analisis visual dengan `ROUTER_MODEL` sungguhan.

## Ditunda

- Gambar AI yang memakai brand kit (menunggu model gambar).
- Lebih dari satu brand.
- Membaca lebih dari satu halaman website.
