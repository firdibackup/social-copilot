# Balasan (DM inbox) + Aturan Auto DM — Desain

- **Tanggal:** 2026-10-16
- **Status:** disetujui lewat brainstorming. Implementasi pertama (dikerjakan dengan Haiku) dibuang setelah dicek ulang dan disimpan di branch `backup/auto-dm-haiku`, karena migrasinya gagal (`owner_id bigint` merujuk `auth.users(id)` yang bertipe uuid, padahal aplikasi belum punya login), webhook-nya bukan `route.ts` (jadi tidak pernah dilayani) dan tidak memeriksa tanda tangan Meta, payload dibaca dari tempat yang salah, dan tidak ada alur balas sama sekali.
- **Cakupan PRD:** §5 Instagram Inbox, §6 Flow C, §14 langkah 6.

## Tujuan dan kriteria sukses

Owner membaca DM Instagram di `/balasan` dan membalasnya dari aplikasi. Seperti ManyChat, owner membuat aturan "kata kunci → template". Saat pesan pelanggan memuat kata kunci itu, draf balasan langsung terisi template dengan variabel yang sudah diganti. Owner tetap memeriksa lalu menekan **Kirim** (aturan PRD: tidak ada DM yang terkirim tanpa aksi owner).

Tahap ini sukses kalau:

1. DM dari pelanggan muncul di kotak masuk beberapa detik setelah dikirim (setelah **Muat ulang**), lengkap dengan nama dan username.
2. Pesan "ada promo?" mengisi draf dari aturan berkata kunci `promo`, dengan `{sender_name}` dan `{brand_name}` sudah terisi.
3. **Kirim** mengirim DM lewat API resmi, dan balasan tampil di percakapan. Balasan yang dikirim dari aplikasi Instagram di HP juga tampil (lewat echo).

## Keputusan

| Topik | Keputusan | Alasan |
|---|---|---|
| Pengiriman | Selalu lewat tombol Kirim | Aturan PRD, dan jawaban owner saat brainstorming (alur 1). Kirim otomatis ala ManyChat ditunda. |
| Pemicu | Kata kunci (opsional) per template, ditambah pilihan template manual | Jawaban C: dua-duanya. Template tanpa kata kunci hanya muncul di dropdown. |
| Pencocokan | Kata atau frasa utuh, huruf besar-kecil harus sama | Jawaban A ("exact"). "promo" cocok dengan "ada promo?", tapi tidak dengan "Promo" atau "promosi". Aturan ini tertulis di UI. Kalau dua kata kunci cocok, template yang lebih dulu dibuat yang menang. |
| Variabel | Otomatis `{sender_name}` (nama, lalu username, lalu "Kak") dan `{message_text}`, ditambah variabel buatan owner (`brand_name = Toko Sinar`) | Jawaban D. Variabel yang tidak dikenal dibiarkan apa adanya supaya owner melihatnya di draf. |
| Variabel owner | Tabel `dm_settings` satu baris | Tidak ditaruh di `instagram_connections` karena baris itu dihapus saat Instagram diputus. |
| Batas aturan | Tidak ada | Jawaban owner. |
| Pengiriman langsung | Server action, tanpa worker | Tidak ada jadwal, jadi antrean worker tidak diperlukan. |
| Jendela 24 jam | Diperiksa sebelum memanggil Instagram | Meta hanya menerima balasan dari aplikasi sampai 24 jam setelah pesan terakhir pelanggan. Tag `HUMAN_AGENT` (7 hari) butuh izin tambahan, jadi ditunda. |
| Realtime | Tombol **Muat ulang** | Cukup untuk satu owner. Supabase Realtime ditunda. |
| Tab Komentar, multi-akun | Ditunda | Belum diminta. Komentar → DM butuh Advanced Access untuk webhook `comments`. |

## Temuan Meta (dicek 2026-10-16)

- **Kirim DM:** `POST https://graph.instagram.com/<IG_ID>/messages` dengan `Authorization: Bearer <token>` dan body `{"recipient":{"id":"<IGSID>"},"message":{"text":"…"}}`. Responsnya `{recipient_id, message_id}`. `message_id` sama dengan `mid` di echo webhook, sehingga balasan yang disimpan aplikasi tidak tercatat dua kali.
- **Profil pelanggan:** `GET /<IGSID>?fields=username,name`. Webhook hanya membawa IGSID.
- **Webhook:** verifikasi `GET` dengan `hub.mode=subscribe`, `hub.verify_token`, dan `hub.challenge`. `POST` ditandatangani `X-Hub-Signature-256: sha256=<HMAC-SHA256 raw body>` memakai **Instagram app secret** (`INSTAGRAM_APP_SECRET`). Payload: `entry[].messaging[]` dengan `sender.id`, `recipient.id`, `timestamp`, dan `message.{mid,text,attachments,is_echo,is_deleted}`. `entry.id` adalah `user_id` akun yang terhubung.
- **Langganan per akun:** `POST /me/subscribed_apps?subscribed_fields=messages` dengan token akun (tombol **Aktifkan DM**).
- **Mode aplikasi:** Meta baru mengirim webhook setelah aplikasi berstatus **Live**. Untuk akun milik sendiri, Standard Access cukup.

## Model data

Migrasi `20261016010000_balasan.sql`. RLS aktif tanpa policy, seperti migrasi lain.

- **`dm_conversations`**: satu baris per pelanggan (`igsid` PK), berisi `username`, `name`, ringkasan pesan terakhir (`last_text`, `last_from_customer`, `last_message_at`), dan `last_incoming_at` sebagai awal jendela 24 jam. Filter "Belum dibalas" = `last_from_customer`.
- **`dm_messages`**: `mid` sebagai PK (deduplikasi retry webhook dan echo), `igsid`, `from_customer`, `text` (null kalau hanya lampiran), `sent_at`.
- **`dm_templates`**: `id` uuid, `keyword` (null berarti hanya manual), `body`.
- **`dm_settings`**: satu baris (`id = 1`) dengan `variables jsonb`.
- **`record_dm_message()`**: menyimpan pesan dan memperbarui ringkasan percakapan dalam satu transaksi. `mid` yang sudah ada tidak mengubah apa pun, dan pesan yang datang terlambat tidak menggeser ringkasan maupun jendela 24 jam. Fungsi ini diuji di Postgres 17 (PGlite).

## Alur

1. Meta mengirim `POST /api/webhooks/instagram` lewat ngrok. Path ini ada di `PUBLIC_PATHS`, sedangkan `/balasan` tetap 404 dari tunnel.
2. Tanda tangan dicek, lalu event untuk akun yang terhubung disimpan lewat `record_dm_message()`. Untuk pesan pelanggan yang baru, profilnya diambil sekali (best effort). Error database dibalas 500 supaya Meta mengirim ulang.
3. `/balasan` menampilkan daftar percakapan dan isi percakapan yang dipilih. Draf diisi template berkata kunci yang cocok dengan pesan terakhir pelanggan, dan dropdown berisi semua template yang sudah diisi variabelnya.
4. **Kirim** memeriksa jendela 24 jam, mengirim lewat API, lalu menyimpan balasan. Kalau penyimpanan gagal, echo webhook akan menyimpannya.

## Setup (sekali)

1. Terapkan migrasi: `npm run db:push -- --db-url "<postgres-url>"`.
2. Isi `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` di `.env.local` dengan string acak.
3. Di Meta App Dashboard → Instagram → Webhooks: Callback URL `https://<domain-ngrok>/api/webhooks/instagram`, Verify Token sama dengan nilai di atas, lalu subscribe field `messages`.
4. Ubah aplikasi menjadi **Live**.
5. Di `/balasan`, klik **Aktifkan DM**.
6. Uji dengan DM dari akun lain ke akun yang terhubung.
