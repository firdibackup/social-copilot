# Balasan: DM baru, Komentar, dan lonceng notifikasi

- **Status:** disetujui pemilik di chat (2026-10-18, "gass"). Dikerjakan berurutan dalam tiga bagian: DM → Komentar → Notifikasi.
- **Contoh tampilan:** aplikasi pesaing (Bleam).
  - Header bertuliskan "INBOX / Balasan" dengan tombol Muat ulang.
  - Tab **DM | Komentar** dengan garis bawah aksen pada tab aktif. Di kanan ada filter dropdown "Belum dibales", dan di bawahnya tombol hitam **+ Auto DM**.
  - Daftar percakapan: avatar bulat, @username, titik biru kalau belum dibaca, potongan pesan, dan tanggal di kanan.
  - Klik percakapan untuk membuka thread **di tempat**, di bawah item itu, dengan latar abu muda. Pesan pelanggan ada di kiri (avatar dan bubble putih berisi jam "18 Okt, 23.15"); pesan pemilik ada di kanan (bubble warna aksen).
  - Di atas kotak balasan ada chip template ("Kirim katalog", "Cek stok", "Info ongkir") dan tombol ✎.
  - Kotak balasan: logo brand di kiri, placeholder "Tulis DM…", penghitung "0/1000" di kiri bawah, lalu tombol emoji, ✨ AI, dan kirim (bulat) di kanan bawah.

## Konteks yang sudah ada (baca dulu)

- `CLAUDE.md`, terutama bagian DMs, AI, Akun Instagram dan Analitik.
- Balasan sekarang:
  - `src/app/(app)/(halaman)/balasan/`: `page.tsx`, `inbox.tsx` (daftar dua kolom dengan filter `?filter=semua`, `?c=<igsid>`), `reply-box.tsx` (select template dan textarea), `templates-panel.tsx` (Aturan Auto DM: kata kunci, template, variabel), `controls.tsx` (Muat ulang), `actions.ts`.
  - Data DM: `src/lib/dm.ts`. Template: `src/lib/dm-templates.ts` (`REPLY_MAX_LENGTH = 1000`).
  - Webhook: `src/app/api/webhooks/instagram/route.ts` dan `src/lib/dm-webhook.ts`, yang sekarang hanya membaca `entry[].messaging`.
- `dm_conversations` sudah punya `last_from_customer`, sehingga filter "Belum dibales" = `last_from_customer = true`. Belum ada catatan kapan percakapan dibaca.
- Analitik (`src/lib/analytics*.ts`, tabel `ig_media`) menyimpan post 90 hari terakhir beserta gambar mini dan caption. Polanya bisa dicontoh:
  - klaim jeda lewat fungsi SQL;
  - sync saat halaman dibuka;
  - scope dicek dari `instagram_connections.scopes` dengan pemberitahuan **Hubungkan ulang Instagram**.
- AI:
  - `runLogged()` di `src/lib/ai.ts`.
  - Biaya per task di `TASK_CREDITS` (`src/lib/billing-options.ts`), yang juga ada sebagai CHECK pada `ai_generations.task` (lihat migrasi `20261019020000_aset_tag.sql` untuk cara menambah task).
  - Panduan kredit: `docs/kredit-ai.md`.
  - Konteks brand: `loadBrandContext()` / `describeBrand()`.
- Header app ada di `src/app/(app)/layout.tsx` (`<header className="flex h-14 …">` dengan `Breadcrumb`).

## Keputusan pemilik

| Pertanyaan | Jawaban |
|---|---|
| Tombol ✨ AI | **Tulis + rapikan.** Kotak kosong: AI menulis draf dari isi percakapan (atau komentar) dan fakta brand. Sudah ada tulisan: AI merapikan atau mengubah nadanya. Hasilnya tetap draf yang dikirim pemilik sendiri. **1 kredit per klik.** |
| Tindakan per komentar | **Balas publik, Sembunyikan/Tampilkan, Balas lewat DM** (private reply, sekali per komentar, dalam 7 hari), dan **Hapus**. |
| Notifikasi | **Lonceng di dalam app saja.** Tidak ada notifikasi browser atau service worker. |

## Bagian 1: DM

- Halaman `/balasan`:
  - Judul "Balasan" dan tombol Muat ulang.
  - Tab **DM | Komentar** sebagai link `?tab=komentar`, dengan DM sebagai bawaan.
  - Filter **Belum dibales / Semua** dan tombol **+ Auto DM**, yang membuka form aturan baru dari `templates-panel.tsx`.
  - Bagian "Aturan Auto DM (n)" tetap ada di bawah daftar.
- **Daftar percakapan** satu kolom, persis seperti contoh: avatar, @username (atau nama), titik **biru** belum dibaca, potongan pesan terakhir, dan tanggal.
  - Klik untuk membuka thread di tempat (`?c=<igsid>`, klik lagi untuk menutup). Di HP tetap satu kolom.
- **Belum dibaca** = pesan terakhir dari pelanggan, dan `seen_at` kosong atau lebih tua dari `last_incoming_at`.
  - Membuka thread mengisi `seen_at = now()` lewat server action yang dipanggil dari client saat thread terbuka. Jangan menulis saat render.
- **Profil pengirim:**
  - `fetchCustomerProfile` meminta nama, username, dan `profile_pic`; URL-nya disimpan di `dm_conversations.profile_pic_url`.
  - Profil percakapan lama yang belum ada diisi otomatis setelah daftar DM tampil (server action dari client, bukan saat render), maksimal 12 per kunjungan; profil dibaca ulang kalau sudah lebih dari 3 hari karena link CDN-nya kedaluwarsa.
  - Avatar, nama, dan username tampil di daftar dan bagian atas thread. Kalau foto gagal dimuat, tampilkan inisial. Ini best effort, dan URL bertanda tangan tidak boleh di-log.
- **Thread:** bubble seperti contoh, jam memakai format WIB pendek ("18 Okt, 23.15"), dan menggulir ke pesan terbaru.
- **Chip template** di atas kotak balasan:
  - Berisi semua template (label = kata kunci atau potongan isi); klik mengisi draf dengan template yang sudah diisi variabelnya.
  - ✎ membuka/menggulir ke Aturan Auto DM.
  - Saran template otomatis dari kata kunci tetap jalan seperti sekarang.
- **Kotak balasan:**
  - Logo brand (`brand_kit` logo, kalau ada), textarea "Tulis DM…" dan penghitung `n/1000`.
  - **Pemilih emoji:** popover kecil berisi sekitar 40 emoji umum, disisipkan di posisi kursor, tanpa library baru.
  - **✨ AI** dan **kirim**: Enter = baris baru, Ctrl/⌘+Enter = kirim.
  - Pesan jendela 24 jam tetap seperti sekarang.
- **AI** memakai task baru `reply_draft` (1 kredit):
  - Input: 10 pesan terakhir, draf pemilik (boleh kosong), dan konteks brand. Teks pemilik dan pelanggan dikutip di antara `"""`.
  - Output: JSON `{"reply": "..."}` yang dibaca lewat parser task (`readJson`, `AiOutputError` kalau salah), dipotong ke batas panjang kanal.
  - Bahasa mengikuti percakapan (umumnya Indonesia santai, sesuai suara brand).
  - Fungsinya dipakai bersama oleh DM dan komentar. Taruh di `src/lib/content-ai.ts` atau file baru `src/lib/reply-ai.ts`.

## Bagian 2: Komentar

- **Izin dan langganan:**
  - Scope `instagram_business_manage_comments` ditambahkan ke `INSTAGRAM_SCOPES`.
  - Tanpa scope itu, tab Komentar menampilkan pemberitahuan Hubungkan ulang, seperti Analitik.
  - `subscribeToWebhooks` berlangganan `messages,comments` otomatis setelah OAuth. Akun lama dicoba dari polling lonceng; kegagalan dicoba lagi paling cepat satu jam kemudian.
- **API (Instagram Login, graph.instagram.com).** Cek ulang di dokumentasi resmi Meta sebelum menulis kode, jangan dari ingatan:
  - **Daftar:** `GET /{media-id}/comments` dengan field `id,text,timestamp,username,from,hidden,parent_id` dan `replies{…}`.
  - **Balas:** `POST /{comment-id}/replies` (`message`).
  - **Sembunyikan:** `POST /{comment-id}` (`hide=true|false`).
  - **Hapus:** `DELETE /{comment-id}`.
  - **Private reply:** `POST /{ig-user-id}/messages` dengan `recipient: { comment_id }`, sekali per komentar dalam 7 hari.
  - **Webhook:** field `comments` datang di `entry[].changes[]`, dengan `value` berisi `id`, `text`, `from{id,username}`, `media{id}` dan `parent_id`.
  - Spec Balasan lama mencatat bahwa webhook `comments` mungkin butuh Advanced Access. Karena itu ada jalur tarik.
- **Cara komentar masuk:**
  1. Webhook menyimpan komentar baru (idempoten per `comment_id`).
  2. Membuka tab Komentar atau menekan Muat ulang menarik komentar dari post 30 hari terakhir. Daftar post diambil dari `ig_media` kalau ada, atau langsung dari `/me/media`.
  3. Penarikan memakai klaim jeda 10 menit dan konkurensi terbatas, dengan pola dari `analytics-sync.ts`.
- **Tampilan:**
  - Dikelompokkan per konten: daftar post (gambar mini, baris pertama caption, jumlah komentar belum dibalas/belum dibaca), lalu klik untuk melihat komentar post itu (`?tab=komentar&post=<media-id>`).
  - Tiap komentar menampilkan @username, teks, waktu, balasan di bawahnya (termasuk balasan pemilik), dan status tersembunyi.
  - Tindakan:
    - **Balas** membuka kotak balasan yang sama: emoji, ✨ AI dengan konteks komentar dan caption post, dan batas komentar Instagram (cek di dokumentasi; sekitar 2.200 karakter).
    - **Sembunyikan / Tampilkan.**
    - **Balas lewat DM:** dinonaktifkan kalau sudah pernah atau lewat 7 hari.
    - **Hapus:** dengan `window.confirm`.
  - Membuka komentar sebuah post menandai komentarnya sudah dibaca.
- Komentar dari akun sendiri, yaitu balasan pemilik, disimpan sebagai balasan tapi **tidak** dihitung sebagai notifikasi atau "belum dibalas".
- **Kebijakan privasi** (`src/app/privasi/page.tsx`) ditambah komentar post: apa yang disimpan dan untuk apa.

## Bagian 3: Lonceng notifikasi

- Ikon lonceng di header kanan atas `src/app/(app)/layout.tsx`, di desktop dan HP, dengan badge angka.
  - Angkanya = percakapan DM belum dibaca + komentar baru belum dibaca dari akun yang terhubung.
- Klik membuka dropdown 10 item terbaru, gabungan DM dan komentar (avatar/@username, potongan teks, waktu, jenis).
  - Tiap item menuju `/balasan?c=…` atau `/balasan?tab=komentar&post=…`.
  - Ada tombol **Tandai semua dibaca**.
- Diperbarui tiap 60 detik selama app terbuka lewat server action atau route handler, dan saat berpindah halaman. Tidak ada tabel notifikasi: angka dihitung dari `seen_at`.
- Pengguna tanpa akun Instagram atau tanpa langganan aktif tidak melihat angka.

## Data

Satu migrasi baru setelah `20261019040000_analitik.sql`, misalnya `20261019050000_balasan_komentar.sql`:
- `dm_conversations.seen_at timestamptz`, `profile_pic_url text`, `profile_fetched_at timestamptz`.
- `ig_comments`:
  - Kolom: `user_id`, `account_id`, `comment_id`, `media_id`, `parent_id`, `from_id`, `username`, `text`, `created_at`, `is_hidden`, `is_from_owner`, `replied_at` (pemilik membalas publik), `dm_sent_at`, `seen_at`.
  - PK `(user_id, comment_id)`, dengan indeks per akun/post/waktu.
  - RLS aktif tanpa policy, dan `revoke` dari anon/authenticated seperti migrasi lain.
  - Fungsi klaim jeda tarik komentar.
- Task `reply_draft` ditambahkan ke CHECK `ai_generations.task`, `TASK_CREDITS` (1), dan `docs/kredit-ai.md`.

## Aturan yang tetap berlaku

- Tidak ada yang terkirim tanpa klik pemilik. AI dan template hanya mengisi draf, dan tidak ada DM massal.
- Semua data lewat `src/lib` dengan `userId` pertama dan filter `.eq('user_id', …)`. Tampilan disaring dengan `accountId` dari `requireAccount()`.
- Token dan URL bertanda tangan tidak pernah di-log; selalu pakai `describeError()`.
- Next 16 dengan Cache Components:
  - Baca data hanya di dalam `<Suspense>`, setelah `await connection()`.
  - Baca panduan di `node_modules/next/dist/docs/` sebelum menulis kode Next.
  - Route halaman dengan data harus ◐ di output build.
- UI berbahasa Indonesia dan mengikuti gaya halaman lain (zinc, `rounded-xl border`, token `accent`).

## Selesai berarti

- Unit test untuk logika murni:
  - parser webhook komentar;
  - aturan belum dibaca/dibalas;
  - pemilihan item notifikasi;
  - parser output AI;
  - batas private reply 7 hari.
- `npm test`, `npm run lint`, `npm run typecheck` dan `npm run build` lulus.
  - `src/lib/slides.ts` sedang diubah proses lain (`claimSlide` → `claimNextSlide`). Kalau typecheck gagal hanya di `content-actions.ts`/`slides.ts`, laporkan dan jangan ubah file itu.
- `CLAUDE.md` diperbarui di bagian Status dan DMs, plus bagian baru Komentar dan Notifikasi.
- Bagian setup Meta ditulis di spec ini:
  - tambah izin `instagram_business_manage_comments`;
  - langganan field `comments` di Webhooks;
  - Hubungkan ulang;
  - langganan DM dan komentar otomatis;
  - App Review Advanced Access untuk pelanggan.
- Migrasi tidak dijalankan sendiri, karena tidak ada URL Postgres di `.env.local`. Pemilik menjalankan `npm run db:push -- --db-url "<postgres-url>"`.
- Ikut dikoreksi: `docs/superpowers/specs/2026-10-19-analitik-design.md` masih menulis bahwa suka dan komentar post yang insights-nya gagal tetap terbarui. Sekarang semua angka post itu tetap angka lama (`saveSynced` tidak menulis kolom metrik, termasuk likes/comments).

## Setup Meta for Developers

Aplikasi Meta yang sama (Business, use case **Instagram API → API setup with Instagram login**). Tidak ada env baru.

1. **Izin.** Di *Permissions and features* use case Instagram, tambahkan `instagram_business_manage_comments` di samping `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_messages`, dan `instagram_business_manage_insights`. Kode sudah memintanya (`COMMENTS_SCOPE` di `INSTAGRAM_SCOPES`).
2. **Webhooks.** Di *Webhooks* use case Instagram (callback URL `/api/webhooks/instagram`, verify token `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`, sama seperti DM), centang field **`comments`** di samping `messages`.
3. **Hubungkan ulang.** Akun yang terhubung sebelum izin ini melihat pemberitahuan di tab Komentar. Pemilik menekan **Hubungkan ulang Instagram** sekali dan masuk dengan akun yang sama.
4. **Langganan otomatis.** Setelah terhubung ulang, aplikasi memanggil `/me/subscribed_apps` dengan `subscribed_fields=messages,comments` otomatis. Akun lama juga dicoba otomatis dari polling lonceng; tidak ada tombol aktivasi manual.
5. **Tester.** Selama belum ada Advanced Access, hanya akun dengan peran di aplikasi (admin, developer, Instagram Tester) yang bisa memakai komentar. Webhook hanya terkirim kalau aplikasi Live. Kalau webhook `comments` belum datang, jalur tarik (tab Komentar dan Muat ulang) tetap mengisi komentar.
6. **App Review sebelum go-live** untuk pelanggan yang bukan tester:
   - `instagram_business_manage_comments` butuh **Advanced Access**, sama seperti `instagram_business_manage_messages` dan `instagram_business_manage_insights`. Syaratnya Business Verification.
   - Lampirkan screencast: login dari Pengaturan, dialog izin, tab Komentar (daftar post, membuka komentar), lalu balas publik, sembunyikan, balas lewat DM, dan hapus. Semuanya dilakukan oleh klik pemilik.
   - Jelaskan bahwa komentar hanya ditampilkan ke pemilik akun itu, dan tidak ada balasan otomatis atau massal. AI dan template hanya mengisi draf.
   - URL kebijakan privasi `/privasi` sudah menyebut komentar post dan apa yang dikirim ke AI.
7. **Migrasi.** `20261019100000_balasan_komentar.sql` dan `20261019110000_langganan_webhook.sql` sudah dijalankan (2026-10-19). Kolom webhook di `instagram_connections` dipisah ke file kedua karena versi awal file pertama sudah jalan tanpa kolom itu; tanpa kolom itu langganan webhook gagal di setiap polling lonceng dan Hubungkan ulang Instagram gagal menyimpan. DM yang diterima sebelum 17 Okt bisa berlabel akun yang terhubung saat migrasi `20261017000000_akun_instagram.sql` berjalan; DM `salahdulu.english` (dua percakapan) sudah dipindahkan ke akunnya.
