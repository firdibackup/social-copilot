# Social Copilot jadi SaaS: multi-user (Fase 1) dan Langganan (Fase 2)

Tanggal: 16 Oktober 2026. Status: Fase 1 dibangun di branch `feat/multi-user`. Fase 2 dirancang dan belum dibangun.

## Latar belakang

Social Copilot awalnya aplikasi satu pemilik:
- data inti berupa singleton `id = 1`;
- keamanannya hanya "dashboard hanya bisa dibuka dari localhost" (tunnel guard).

Aplikasi Meta sudah Live, dan owner ingin aplikasi ini dipakai pengguna lain sebagai layanan berlangganan. Setiap pengguna login sendiri dan menghubungkan **satu** akun Instagram.

## Keputusan owner

| Topik | Keputusan |
|---|---|
| Login | Email + password, Supabase Auth self-hosted |
| Pendaftaran | Daftar sendiri. Fase 1: langsung aktif. Fase 2: tidak ada akses sebelum bayar |
| Email | SMTP belum ada: tanpa verifikasi email dan tanpa "lupa password" |
| Pembayaran (Fase 2) | Mayar, prabayar 30 hari, tanpa auto-debit |
| Paket (Fase 2) | 1 paket, Rp 99.000 / 30 hari |
| Kuota AI (Fase 2) | Kredit per periode, tampil 0–100%; tiap jenis generate punya bobot |
| Urutan | Fase 1 → Fase 2 → Fase 3 (Buat Konten terpadu) → Analitik |

## Fase 1: fondasi multi-user (dibangun)

### Prinsip isolasi
Server tetap satu-satunya klien database: service role, RLS menyala tanpa policy. Tabel tidak dibuka ke publishable key. Kalau dibuka, pengguna bisa menulis langsung ke barisnya sendiri dan melewati kunci duplikasi post (`ig_container_id`) serta batas AI.

Isolasi dijaga di `src/lib`: setiap fungsi data menerima `userId` sebagai parameter pertama dan memfilter `user_id`.

### Auth
- `@supabase/ssr` (versi di-pin) hanya untuk auth; data tetap lewat `db()`.
- `src/lib/auth.ts` menyediakan `currentUser()` dan `requireUser()`. Keduanya memakai `getClaims()`, bukan `getSession()`, dan dibungkus `cache()` per request.
- Halaman `/masuk` dan `/daftar` (action di `src/app/masuk/actions.ts`). Tujuan `next` disaring `safeNext()`, jadi hanya path di situs ini yang diterima.
- Sidebar menampilkan email dan tombol Keluar.
- `src/proxy.ts`:
  - me-refresh session di setiap request;
  - pengunjung tanpa session diarahkan ke `/masuk?next=…`;
  - path publik: `/masuk`, `/daftar`, `/privasi`, `/api/webhooks/instagram`.
- Tunnel guard (`tunnel-guard.ts`, `local-only.ts`) dihapus. Setiap loader halaman, route dan server action memanggil `requireUser()` sendiri, di luar `try`.

### Data
Migrasi `20261016040000_multi_user.sql`:
- Semua tabel mendapat `user_id → auth.users on delete cascade`. Baris lama menjadi milik user auth pertama (owner).
- Singleton (`instagram_connections`, `facebook_connections`, `brand_kit`, `dm_settings`) berkunci `user_id`.
- `instagram_connections.instagram_user_id` unik: satu akun IG untuk satu user.
- Kunci DM menjadi `(user_id, igsid)` dan `(user_id, mid)`.
- `save_post(p_user_id, …)` menolak foto milik user lain. `record_dm_message(p_user_id, …)` bekerja per user.
- Trigger `before delete` di `auth.users` menghapus post user lebih dulu, karena `post_media` menahan penghapusan foto yang masih dipakai. Ditemukan saat menguji migrasi di PGlite.
- File Storage baru disimpan di `<userId>/…`.

### OAuth, webhook, worker
- `oauth_states` mencatat user yang memulai login. Callback hanya menukar state untuk user yang sedang login. Ini menutup serangan "kirim link authorize ke korban".
- Akun IG yang sudah dipakai user lain menghasilkan `?ig_error=akun_dipakai`.
- Webhook DM: setiap `entry.id` diserahkan ke user pemilik akunnya (`findUserByInstagramId`); akun yang tidak dikenal diabaikan.
- Worker memakai token `post.userId`.
- Kuota AI sementara: 100 permintaan / 24 jam **per user**.

### Konsekuensi operasional
- Cookie session terikat host, jadi dashboard, `APP_URL` dan callback OAuth harus di domain yang sama. Di dev, buka domain ngrok, bukan localhost.
- Supabase self-hosted: `ENABLE_EMAIL_SIGNUP=true`, `ENABLE_EMAIL_AUTOCONFIRM=true`, `SITE_URL=<domain app>`.
- Buat akun owner di Studio **sebelum** `db:push` kalau database sudah berisi data.
- Meta:
  - user lain hanya bisa menyambung setelah **App Review (Advanced Access)** dan **Business Verification**;
  - sebelum itu, akun IG mereka harus ditambahkan sebagai Instagram Tester.

## Fase 2: Langganan Mayar + kuota bulanan (rancangan)

### Model
Langganan diturunkan dari tabel `payments`, tanpa tabel `subscriptions`:
- satu pembayaran lunas = satu periode 30 hari;
- user aktif kalau ada pembayaran `paid` dengan `period_start <= now() < period_end`;
- membayar saat masih aktif menumpuk periode baru mulai `period_end` terakhir (`activate_payment`, baris user dikunci);
- owner mendapat periode gratis sampai 2099, dan akun gratis lain diberi dengan baris yang sama lewat Studio.

### Kredit
`src/lib/billing-options.ts`:
- `PLAN = { priceIdr: 99_000, days: 30, credits: 1_000 }`, dengan 1.000 kredit = 100%;
- bobot: teks (caption, ide, rewrite, hashtag) 2, rencana slide 1, analisis profil brand 5, analisis visual 10, gambar 20 per gambar;
- kredit dicatat di `ai_generations.credits`, dan permintaan gagal = 0;
- `runLogged` menolak kalau `terpakai + bobot > 1.000`;
- Studio memeriksa sisa kredit untuk seluruh slide sebelum gambar pertama dibuat.

### Mayar
- `src/lib/mayar.ts`: `POST /hl/v2/payments/create` (Single Payment Request) dan `GET /hl/v2/payments/{id}`, dengan `Authorization: Bearer`. Base URL sandbox `api.mayar.io`, produksi `api.mayar.id`.
- Dokumentasi Mayar tidak menjelaskan tanda tangan webhook, jadi `/api/webhooks/mayar` hanya pemicu. Lunas atau tidaknya selalu ditanyakan ke API Mayar dengan key kita, dan nominal harus sama.
- Field penghubung di payload webhook dipastikan lewat webhook history di sandbox.
- Jaring pengaman: sinkron saat user kembali dari checkout (`?bayar=selesai`) dan tombol "Cek pembayaran".

### Gate dan UI
- `requireActiveUser()`: tanpa periode aktif, redirect ke `/langganan`. Semua halaman dan action `(app)` memakainya, termasuk callback OAuth.
- `/langganan`:
  - status, bar kuota %, Bayar/Perpanjang, riwayat;
  - setelah daftar, user diarahkan ke sini.
- Sidebar menampilkan kuota %. Banner muncul saat sisa ≤ 3 hari.
- Worker menggagalkan post milik user yang langganannya habis, dengan pesan "Perpanjang lalu Coba lagi". DM tetap disimpan.
- Ketentuan di `/privasi`: harga, prabayar, tanpa perpanjangan otomatis, kuota tidak terbawa, dan kebijakan refund (diputuskan owner).

## Ditunda
- Fase 3: Buat Konten terpadu.
- Lupa password dan email pengingat (butuh SMTP).
- Halaman landing/harga publik.
- Hapus akun mandiri.
- Pembatasan ganti-ganti akun IG.
- Pembersihan Storage saat user dihapus.
- Antrean worker per user.
