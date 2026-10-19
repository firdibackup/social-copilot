# Analitik

- **Status:** disetujui di chat (2026-10-18). Titik awalnya rencana aplikasi pesaing (Bleam), disesuaikan dengan aplikasi ini.

## Masalah

Pemilik akun belum bisa melihat performa post Instagram-nya di aplikasi. Menu Analitik masih berlabel "Segera".

## Keputusan pemilik

| Pertanyaan | Jawaban |
|---|---|
| Post mana yang muncul | **Semua post akun** dari 90 hari terakhir, bukan hanya yang dipublish lewat app. Post yang terbit lewat worker diberi tanda **Lewat app**. |
| Kapan sync | **Saat halaman dibuka** kalau sync terakhir dimulai lebih dari 6 jam lalu, ditambah tombol **Refresh** dengan jeda 10 menit. Tanpa cron. |
| Riwayat angka | **Angka terbaru saja**, satu baris per post yang ditimpa tiap sync. Insights Instagram sudah kumulatif (lifetime). |

## Keputusan pembangun

- **Tanpa tabel `social_accounts` atau route OAuth baru.** `instagram_connections` sudah menyimpan token terenkripsi (AES-256-GCM), me-refresh-nya, dan menandai `needs_reconnect`. Yang ditambah hanya scope `instagram_business_manage_insights` di `INSTAGRAM_SCOPES`.
- **Tanpa pola provider.** Saat ini hanya ada Instagram. Kalau Threads atau TikTok masuk, `analytics-sync.ts` dipecah per platform.
- **Tanpa policy RLS.** Polanya tetap: RLS aktif tanpa policy, semua lewat server dengan filter `user_id`.
- **Nama dan tempat.** Tabel `ig_media` (bukan `social_posts`). Halaman di `/analitik` dengan gaya halaman lain.
- **Batas 150 post per sync** (`MAX_SYNC_POSTS`). Daftar yang terpotong tidak menghapus apa pun.

## Temuan Meta (dicek 2026-10-18, Graph API v25.0)

- Metrik media yang dipakai: `views`, `reach`, `likes`, `comments`, `shares`, `saved`, `total_interactions`. Ketujuhnya tersedia untuk FEED dan REELS, jadi satu permintaan per post cukup.
- `impressions` deprecated untuk media setelah 2 Juli 2024 dan tidak dipakai.
- Story tidak muncul di `/me/media`, dan metriknya hanya ada 24 jam, jadi di luar cakupan.
- Data bisa terlambat sampai 48 jam. Insights yang tidak tersedia datang sebagai data kosong, bukan 0, dan halaman menampilkannya sebagai "—".
- Izin yang dibutuhkan (Instagram Login): `instagram_business_basic` + `instagram_business_manage_insights`.

## Alur

1. Halaman `/analitik` (`requireAccount`) membaca koneksi, `analytics_syncs`, dan `ig_media` sesuai rentang (`?rentang=7|30|90`, bawaan 30).
2. Kalau izin ada, status `active`, dan sync terakhir dimulai lebih dari 6 jam lalu, `SyncPanel` memanggil `refreshAnalytics()` sekali saat halaman terbuka. Tombol Refresh memanggil action yang sama.
3. `syncAnalytics()` (`src/lib/analytics-sync.ts`):
   - Izin insights tidak ada di `scopes`: `MissingInsightsPermissionError`, sebelum klaim.
   - `claim_analytics_sync()` menolak kalau sync terakhir dimulai kurang dari 10 menit lalu. Ini jadi jeda Refresh sekaligus mencegah dua sync jalan bersamaan.
   - `listMediaSince()` membaca halaman `/me/media` lewat cursor `after` sampai halaman yang post terakhirnya lebih tua dari 90 hari. Post yang di-pin boleh lebih tua tanpa menghentikan pembacaan.
   - Insights dibaca per post, paling banyak 3 sekaligus:
     - Error sementara dicoba lagi setelah 2 dan 8 detik.
     - Rate limit (4/17/32/613/80002) menghentikan permintaan berikutnya, dan post sisanya dihitung gagal.
     - Token ditolak (190) menghentikan seluruh sync, lalu action menandai `needs_reconnect`.
     - Error lain hanya menggagalkan post itu.
   - Post yang gagal disimpan tanpa kolom insights, jadi angka lamanya tetap dan `insights_error` berisi pesan Instagram. Semua angka post itu tetap angka lama, termasuk suka dan komentar: `saveSynced` tidak menulis kolom metrik sama sekali, juga `like_count`/`comments_count` dari daftar media.
   - Kalau daftar lengkap, baris akun yang tidak ada lagi dihapus: post dihapus, diarsipkan, atau sudah lewat 90 hari.
   - Sync yang gagal mengosongkan `started_at`, jadi kunjungan berikutnya mencoba lagi.
4. Hasil tampil di baris status, misalnya "Refresh selesai: 12 post diperbarui, 0 gagal." Tanpa hasil baru, baris itu menampilkan sync terakhir.

## Halaman

- Header **Analitik** dengan tombol Refresh, lalu baris status sync.
- Pemberitahuan:
  - Token perlu disambung ulang, atau izin insights belum ada: tautan **Hubungkan ulang Instagram** (`/api/auth/instagram/start`) dengan pengingat untuk masuk dengan akun yang sama.
- Rentang 7/30/90 hari.
- Kartu:
  - **Total post**
  - **Views**
  - **Interaksi** (`total_interactions`)
  - **Engagement rate**: interaksi dibagi views, hanya dari post yang punya keduanya. "—" kalau views 0 atau tidak ada.
- Tabel post:
  - Gambar mini, baris pertama caption, jenis (Foto/Video/Carousel/Reels), tanggal, dan tanda **Lewat app**.
  - Views, reach, suka, komentar, share, simpan, dan ER, plus tautan ke Instagram.
  - Kalau insights post gagal, pesan errornya tampil di bawah caption.
- Empty state: "Belum ada data analitik" sebelum sync pertama, atau "Belum ada post dalam N hari terakhir".
- Pengguna tanpa Instagram dikirim ke Pengaturan, seperti halaman lain.

## Data

Migrasi `20261019040000_analitik.sql`, diterapkan dengan `npm run db:push -- --db-url "<postgres-url>"`:
- `ig_media` (PK `user_id, media_id`), indeks `(user_id, account_id, posted_at desc)`.
- `analytics_syncs` (PK `user_id, account_id`).
- Fungsi `claim_analytics_sync()`.

Tidak ada env baru, karena `INSTAGRAM_*` dipakai ulang.

## Setup Meta for Developers

1. **Aplikasi.** Pakai aplikasi Meta yang sudah ada (tipe Business) dengan use case **Instagram API → API setup with Instagram login**.
2. **Izin.** Di use case Instagram, buka *Permissions and features* dan pastikan `instagram_business_manage_insights` ada di samping `instagram_business_basic`, `instagram_business_content_publish`, dan `instagram_business_manage_messages`.
3. **Redirect URI.** Di *Business login settings → OAuth redirect URIs*, isinya tetap `INSTAGRAM_REDIRECT_URI` (domain dengan garis miring di akhir, misalnya `https://<domain>/`).
4. **Akun tester** (selama aplikasi belum punya Advanced Access):
   - Buka *App roles → Roles → Add People → Instagram Tester* dan masukkan username Instagram-nya.
   - Pemilik akun menerima undangan di Instagram: *Settings → Apps and websites → Tester invites*.
   - Akun yang punya peran di aplikasi (admin, developer, tester) bisa memakai Standard Access tanpa App Review.
5. **App Review sebelum go-live** untuk pelanggan yang bukan tester:
   - `instagram_business_manage_insights` butuh **Advanced Access**, yang mensyaratkan Business Verification.
   - Lampirkan screencast: login Instagram dari Pengaturan, dialog izin, lalu halaman Analitik yang menampilkan views, reach, dan interaksi post.
   - Jelaskan bahwa data hanya ditampilkan ke pemilik akun itu sendiri.
   - URL kebijakan privasi `/privasi` sudah menyebut statistik post.
6. **Setelah izin aktif.** Akun yang terhubung sebelum ada scope baru melihat pemberitahuan di Analitik dan perlu **Hubungkan ulang Instagram** sekali dengan akun yang sama.

## Ditunda

- **Grafik pertumbuhan.** Butuh snapshot per sync atau insights akun harian (`/me/insights`).
- **Insights Story.** Butuh pembacaan dalam 24 jam, dan webhook insights tidak tersedia untuk Instagram Login.
- **Refresh token harian untuk pengguna yang tidak aktif.** Token tetap di-refresh lazily setiap kali dipakai.
- **Header `X-Business-Use-Case-Usage`.** Untuk saat ini, backoff mengandalkan kode error.
