# Kalender, Aset, dan Worker Publikasi — Desain

- **Tanggal:** 2026-10-14
- **Status:** disetujui lewat brainstorming. Review spec dan rencana tertulis dilewati atas permintaan owner.
- **Cakupan PRD:** §5 P1 (kalender dan pustaka konten) dan P2 (publikasi terjadwal), serta §14 langkah 3–4.

## Tujuan dan kriteria sukses

Owner mengunggah foto ke Aset, menyusun post (caption dan 1–10 foto), lalu menjadwalkannya. Post tampil di Kalender, dan worker menerbitkannya ke Instagram tanpa tab browser, bahkan saat laptop owner mati.

Tahap ini sukses kalau:

1. Satu post terjadwal terbit di akun owner pada jam yang dipilih (WIB).
2. Statusnya menjadi `published`, dan `ig_media_id` serta `published_at` tersimpan.
3. Kalau gagal, alasannya tampil dan ada tombol **Coba lagi** yang tidak membuat post dobel.

## Keputusan

| Topik | Keputusan | Alasan |
|---|---|---|
| Tempat worker | Proses Node terpisah (`npm run worker`), di production dijalankan di VPS owner dengan pm2 atau systemd | Supabase juga self-hosted di VPS itu. Kalau VPS mati, Supabase ikut mati, jadi Railway tidak menambah keandalan. Supabase cron + Edge Function ditolak karena berjalan di Deno, sehingga kode Instagram dan kripto harus ditulis ulang. Worker di dalam Next ditolak karena bergantung pada web yang sudah di-deploy. |
| Jenis post | Foto tunggal dan carousel foto (2–10) | Reels dan Story ditunda. Post dengan 1 foto terbit sebagai foto tunggal karena carousel wajib berisi minimal 2 item. |
| Tampilan Kalender | Bulan dan Daftar | Tampilan minggu ditunda. |
| Zona waktu | WIB tetap (+07:00, tanpa DST) | Pengaturan zona waktu ditunda. |
| Batas terlewat | 60 menit | Post yang terlewat lebih dari 60 menit (misalnya karena worker mati) tidak diterbitkan otomatis. |
| Supabase | Self-hosted di VPS | Migrasi memakai `supabase db push --db-url`. Signed URL harus memakai domain HTTPS publik. |

## Batasan Meta (dicek 2026-10-14)

- **Gambar:** hanya JPEG, maksimal 8 MB, rasio 4:5 sampai 1.91:1, lebar 320–1440 px.
- **Carousel:** 2–10 item, dan semua item dipotong mengikuti rasio item pertama.
- **Caption:** maksimal 2.200 karakter, 30 hashtag, dan 20 mention.
- **Kuota:** 100 post lewat API per 24 jam (bergulir).
- **Status container:** `IN_PROGRESS`, `FINISHED`, `PUBLISHED`, `ERROR`, `EXPIRED`. Container kedaluwarsa setelah 24 jam.
- **Media:** diambil Meta dengan cURL dari URL publik saat publikasi berlangsung.

## Model data

Semua perubahan ada di satu migrasi baru. Polanya sama dengan Fondasi: RLS aktif tanpa policy, dan hanya service-role yang bisa mengakses. Hak akses tabel dan `execute` fungsi dicabut dari `anon` dan `authenticated`.

### Tabel

- **`assets`**: `id` (uuid), `storage_path` (unik), `width`, `height`, `size_bytes`, `created_at`.
- **`posts`**:
  - Konten: `id`, `caption` (CHECK ≤ 2.200 karakter), `status` (CHECK: `draft`, `scheduled`, `publishing`, `published`, `failed`, `cancelled`).
  - Penjadwalan: `scheduled_at`, `published_at`.
  - Kolom worker: `attempt_count`, `next_attempt_at`, `locked_at`, `last_error`.
  - Hasil Instagram: `ig_container_id`, `ig_media_id`, `ig_permalink`.
  - Waktu: `created_at`, `updated_at`.
  - CHECK: status `scheduled` wajib punya `scheduled_at`.
  - Tabel `publishing_jobs` dari PRD tidak dibuat. Relasinya 1:1 dengan post, jadi datanya disimpan langsung di baris post. Kolom `title` juga dihapus.
- **`post_media`**:
  - Kolom: `post_id` (`on delete cascade`), `asset_id` (`on delete restrict`), `position` (0–9).
  - Primary key-nya `(post_id, position)`.
  - Aset yang masih dipakai post tidak bisa dihapus.
- **`publish_attempts`**: `id`, `post_id` (`on delete cascade`), `started_at`, `finished_at`, `outcome` (`published`, `retry`, `failed`), `error`.

### Fungsi SQL

- **`claim_due_post()`** mengambil satu post secara atomik dengan `FOR UPDATE SKIP LOCKED`.
  - Post yang diambil: status `scheduled` dengan `coalesce(next_attempt_at, scheduled_at) <= now()`, atau status `publishing` dengan `locked_at` lebih lama dari 10 menit (worker crash).
  - Post yang diambil diubah statusnya ke `publishing`, lalu `locked_at` diisi `now()` dan `attempt_count` ditambah 1.
- **`save_post(id, caption, status, scheduled_at, asset_ids[])`** membuat post baru (kalau `id` null) atau mengganti caption, status (`draft` atau `scheduled` saja), jadwal, dan daftar foto dalam satu transaksi.
  - Fungsi ini hanya berjalan kalau status post `draft`, `scheduled`, `failed`, atau `cancelled`, dan `ig_container_id` masih null. Selain itu, fungsi melempar error `post_locked`.
  - Menyimpan dengan status `scheduled` me-reset `attempt_count`, `next_attempt_at`, `last_error`, dan `locked_at`.
  - Status `scheduled` wajib punya 1–10 foto.

### Storage

Bucket privat `media` hanya menerima `image/jpeg` dengan ukuran maksimal 8 MB. Batasan ini dicek dengan unggahan PNG setelah migrasi, karena versi Storage self-hosted lama mengabaikannya. Server action tetap mengecek ulang. Gambar ditampilkan lewat signed URL (`createSignedUrls`, 1 jam).

## Aset

1. **Pilih foto.** Tombol **Unggah** di `/aset` dan pemilih foto di editor memakai komponen yang sama (`<input type="file" accept="image/*" multiple>`).
2. **Konversi di browser.**
   - Foto dibaca dengan `createImageBitmap` agar orientasi EXIF benar.
   - `fitToInstagram(w, h)` memotong bagian tengah kalau rasionya di luar 4:5 sampai 1.91:1, lalu memperkecil lebar sampai maksimal 1440 px.
   - Hasilnya digambar ke canvas dan disimpan sebagai JPEG dengan kualitas 0.9.
   - Format yang tidak bisa dibaca browser, misalnya HEIC, ditolak dengan pesan "ubah ke JPG/PNG dulu".
3. **Server action `uploadAsset`.**
   - Mengecek ulang `isLocalRequest()`.
   - Memastikan byte awal file `FF D8 FF` dan ukurannya ≤ 8 MB.
   - Menyimpan file sebagai `<uuid>.jpg`, lalu mengisi baris `assets`. Kalau pengisian baris gagal, file di Storage dihapus.
   - Batas body server action dinaikkan supaya muat 8 MB.
4. **Halaman Aset.** Menampilkan 100 foto terbaru dalam grid. Hapus memakai konfirmasi. Baris dihapus dulu, baru file di Storage. Kalau ditolak oleh FK, muncul pesan "Foto ini masih dipakai di post".

## Kalender dan editor

### `/kalender`

Semua state tampilan ada di URL.

- **Bulan** (`?bulan=YYYY-MM`, default bulan ini dalam WIB):
  - Minggu dimulai hari Senin.
  - Setiap post tampil sebagai chip berisi thumbnail, jam, dan warna status. Klik chip membuka editor.
  - Tautan **+** di setiap hari membuka `/buat?tanggal=YYYY-MM-DD`.
  - Di HP, chip diganti titik. Mengetuk sebuah hari membuka Daftar untuk hari itu.
- **Daftar** (`?tampilan=daftar&status=…&tanggal=…`):
  - Menampilkan semua post, termasuk draft tanpa tanggal.
  - Bisa difilter per status dan tanggal.
- **Badge "Terlambat"**: muncul kalau status `scheduled` dan `coalesce(next_attempt_at, scheduled_at)` sudah lewat lebih dari 5 menit.

### Editor: `/buat` (baru) dan `/buat/[id]`

- **Media:**
  - Foto dipilih dari Aset atau diunggah langsung. Maksimal 10, urutannya diatur dengan tombol naik dan turun.
  - Pratinjau memotong semua foto mengikuti rasio foto pertama, memakai CSS `aspect-ratio` dan `object-fit: cover`.
- **Caption:**
  - Penghitung karakter (/2.200), hashtag (/30), dan mention (/20).
  - `validateCaption` dipakai bersama oleh client dan server.
- **Jadwal:** `<input type="datetime-local">`, dibaca sebagai WIB.
- **Aksi per status:**
  - `draft`, `cancelled`, `failed`: Simpan draft, Jadwalkan (jadwal harus di masa depan), Terbitkan sekarang (`scheduled_at = now()`).
  - `scheduled`: Simpan perubahan, Batalkan jadwal.
  - `publishing`: hanya bisa dilihat.
  - `published`: hanya bisa dilihat, dengan link "Lihat di Instagram" kalau permalink ada.
  - `failed`: menampilkan `last_error` dan tombol **Coba lagi**.
  - Semua status: Duplikat dan Hapus. Hapus memakai konfirmasi, tidak bisa saat `publishing`, dan hanya menghapus dari aplikasi.
- **Peringatan:** muncul kalau Instagram belum tersambung atau perlu disambungkan ulang. Menjadwalkan tetap boleh.
- **Post dalam masa tunggu retry** (status `scheduled` dengan `last_error`) menampilkan "Percobaan ke-N gagal: …, dicoba lagi pukul HH.MM".

### Aturan anti-dobel

`ig_container_id` yang terisi berarti post ini mungkin sudah terbit. Selama kolom itu terisi:

- Isi post terkunci (`save_post` menolak).
- Aksi yang tersedia hanya **Coba lagi** (dari `failed` atau `cancelled`, mengubah status ke `scheduled` dengan jadwal sekarang dan `attempt_count` 0), **Batalkan**, dan **Duplikat**.
- Worker mengosongkan kolom ini hanya kalau sudah pasti post belum terbit.

## Worker

### File dan cara menjalankan

- `src/worker/index.ts`: loop dan penanganan sinyal.
- `src/worker/publish.ts`: `processPost`, dengan dependensi yang bisa diganti saat tes.
- `src/lib/instagram.ts`: ditambah `createImageContainer`, `createCarouselContainer`, `getContainerStatus`, `publishContainer`, dan `getPermalink`. `InstagramApiError` ditambah kemampuan membaca `is_transient`.
- Script: `npm run worker`, yang menjalankan `node --conditions=react-server --env-file-if-exists=.env.local --import tsx src/worker/index.ts`. Flag `react-server` membuat `server-only` resolve ke modul kosong.

### Loop

- Worker mengambil satu post lewat `claim_due_post()`. Kalau ada, post diproses lalu worker langsung mengambil berikutnya. Kalau tidak ada, worker tidur 30 detik.
- Error di dalam loop dicatat lewat `describeError`, lalu loop berlanjut.
- Saat menerima SIGTERM atau SIGINT, worker menyelesaikan post yang sedang diproses, lalu keluar.

### `processPost`

Setiap percobaan dicatat di `publish_attempts`.

1. **Cek jadwal terlewat.** Kalau `attempt_count = 1` dan jadwalnya sudah lewat lebih dari 60 menit, post jadi `failed` dengan pesan "Terlewat dari jadwal…".
2. **Ambil token.** Token diambil lewat `getValidAccessToken()`. Kalau `NeedsReconnectError` atau kode 190, post jadi `failed` dengan pesan "Sambungkan ulang Instagram", tanpa retry.
3. **Kalau `ig_container_id` sudah ada,** status container dicek dulu:
   - `PUBLISHED`: post ditandai `published` tanpa `ig_media_id`.
   - `FINISHED`: lanjut ke langkah 5.
   - `IN_PROGRESS`: dicoba lagi nanti.
   - `ERROR` atau `EXPIRED`: ID dikosongkan, lalu lanjut ke langkah 4.
4. **Buat container.**
   - Untuk setiap foto, dibuat signed URL berumur 1 jam dari URL Supabase publik.
   - Kalau hanya 1 foto, dibuat satu container gambar dengan caption. Kalau 2 atau lebih, dibuat container anak (`is_carousel_item=true`), lalu container induk `CAROUSEL` dengan caption.
   - ID induk disimpan ke database sebelum publish.
   - Status dicek sekali: `FINISHED` lanjut, `IN_PROGRESS` dicoba lagi nanti, `ERROR` berarti gagal permanen dan ID dikosongkan.
5. **Terbitkan.** `media_publish` mengembalikan ID media, lalu post diubah jadi `published` beserta `ig_media_id` dan `published_at`. Setelah itu permalink diambil. Kalau langkah ini gagal, cukup dicatat.

### Klasifikasi error

- **Sambungkan ulang:** kode 190 atau `NeedsReconnectError`.
- **Coba lagi:**
  - Gangguan jaringan atau timeout (status 0).
  - HTTP ≥ 500.
  - Kode Graph 1, 2, 4, 17, 32, 341, 368, 613.
  - Flag `is_transient`.
  - Error selain dari Instagram, misalnya Supabase tidak bisa dihubungi.
- **Gagal permanen:** semua error Instagram lainnya. `ig_container_id` dikosongkan kalau error terjadi saat membuat container atau saat `media_publish` membalas dengan 4xx.
- **Jeda retry:** 1, 5, 15, lalu 30 menit. Percobaan ke-5 yang gagal membuat post `failed` dengan error terakhir, dan `ig_container_id` dibiarkan karena hasilnya belum pasti.

### Keamanan

- Signed URL dan URL Graph tidak pernah masuk log.
- Env yang dibutuhkan worker: `NEXT_PUBLIC_SUPABASE_URL` (domain publik), `SUPABASE_SERVICE_ROLE_KEY`, dan `TOKEN_ENCRYPTION_KEY`.

## Tes

### Otomatis (vitest)

- `fitToInstagram`: 9:16 dipotong ke 4:5, 3:1 dipotong ke 1.91:1, 1:1 tetap, dan lebar 4000 px dikecilkan ke 1440.
- Pengecekan JPEG dan ukuran di `uploadAsset`.
- `validateCaption`, termasuk hashtag dengan huruf non-Latin.
- Konversi `datetime-local` WIB ke UTC.
- Grid bulan: dimulai Senin, 5 atau 6 baris, termasuk pergantian tahun.
- `processPost`:
  - Foto tunggal dan carousel berhasil, dengan urutan anak sesuai post.
  - `media_publish` timeout, lalu percobaan berikutnya mendapati container `PUBLISHED`. Post ditandai terbit dan publish hanya dipanggil satu kali.
  - Jeda retry berjalan, dan percobaan ke-5 berakhir `failed`.
  - Error permanen membuat container dikosongkan.
  - Kode 190 memunculkan pesan sambungkan ulang.
  - Jadwal terlewat lebih dari 60 menit langsung `failed`.

### Manual di Supabase VPS

- Dua sesi menjalankan `claim_due_post()` bersamaan, dan hasilnya tidak ada post yang diambil dua kali.
- `save_post` ditolak saat status post `publishing`.
- Bucket menolak PNG.

### Ujung ke ujung

Unggah 2 foto, jadwalkan 2 menit ke depan, lalu jalankan `npm run worker`. Hasil yang diharapkan: carousel muncul di Instagram, statusnya `published`, dan link-nya bisa dibuka.

## Urutan pengerjaan

1. Migrasi dan Aset.
2. `save_post`, editor `/buat`, serta Kalender bulan dan daftar.
3. Fungsi Instagram dan worker.

## Deploy worker di VPS

1. Clone repo, lalu jalankan `npm ci`.
2. Siapkan env production (tiga variabel di atas).
3. Jalankan `pm2 start npm --name social-worker -- run worker`, lalu `pm2 save` dan `pm2 startup`. Bisa juga memakai unit systemd dengan `Restart=always`.
4. Migrasi diterapkan dengan `npm run db:push -- --db-url "<postgres-url>"`.

## Di luar cakupan

- Reels dan Story
- Tampilan minggu
- Crop manual
- Teks alt
- Folder dan tag aset
- Paginasi aset di atas 100 foto
- Pengaturan zona waktu
- Pengecekan kuota sebelum publish
- Login owner dan deploy web

## Batasan yang diketahui

- Post yang baru diketahui terbit lewat pengecekan ulang container tidak punya `ig_media_id` maupun link.
- Post `failed` dengan container yang statusnya belum pasti tidak bisa diedit. Owner perlu memakai Coba lagi atau Duplikat.
- WIB ditulis sebagai offset tetap +07:00. Ini perlu diganti dengan `Intl` saat pengaturan zona waktu ditambahkan.
