# Auto DM dari komentar (comment-to-DM)

Sumber: `auto-dm-spec.md` (analisis fitur Auto DM Bleam). Dokumen ini mencatat apa yang dibangun dan keputusan yang diambil. Review spec dan rencana tertulis dilewati atas permintaan owner.

## Keputusan owner (2026-10-19)

- **Auto DM mengirim sendiri.** Aturan PRD "tidak ada DM tanpa aksi owner" dilonggarkan khusus untuk Auto DM: menyimpan rule berstatus Aktif adalah persetujuan owner. Rule hanya membalas orang yang lebih dulu berkomentar atau DM, jadi tetap tidak ada DM massal atau tak diminta. Template dan ✨ AI tetap hanya mengisi draf.
- **Template kata kunci lama tetap ada** sebagai "Template balasan" (chip dan pengisi draf di kotak balas, variabel). Nama "Aturan Auto DM" dan tombol `+ Auto DM` sekarang untuk rule comment-to-DM.

## Yang dibangun

- Tabel `auto_dm_rules` (satu baris per rule, per user dan akun, `stamp_account()`) dan `auto_dm_runs` (satu baris per komentar atau DM yang memicu rule; dedupe dan "Aktivitas terakhir"). Migrasi `20261019130000_auto_dm.sql`.
- Form `/balasan/auto-dm` (buat) dan `/balasan/auto-dm?id=` (ubah): dua kolom, form kiri dan pratinjau HP sticky di kanan (tab Post, Komentar, DM). Semua section, kondisi, dan copy mengikuti spec §5–§8 dan §12. Batal saat ada perubahan membuka dialog "Buang perubahan?".
- Tab DM di Balasan: section "Aturan Auto DM (n)" yang bisa dilipat, berisi kartu rule dengan menu ⋯ (Jedakan/Lanjutkan, Ubah, Hapus) dan aktivitas terakhir. Filter baru "Otomatis" menampilkan percakapan yang pernah disentuh Auto DM.
- Runtime di webhook Instagram (`after()`, setelah semua tersimpan):
  - **Komentar baru** dari orang lain → rule aktif pertama yang cocok → balasan publik dengan variasi acak (opsional) → private reply berisi pesan pembuka + tombol postback, atau ajakan follow + tombol, atau langsung pesan utama.
  - **DM baru** berisi kata kunci → rule dengan "Juga balas kalau ada yang DM" → pesan pertama yang sama, dikirim ke IGSID.
  - **Postback** `autodm:<ruleId>` (tombol pembuka atau "Sudah follow") → kalau Minta follow aktif, cek `is_user_follow_business`; belum follow → ajakan follow lagi, sudah follow (atau gate mati) → pesan utama (+ tombol link `web_url`).
- Pencocokan: OR antar kata kunci, tanpa membedakan huruf besar-kecil, kata utuh `(?<![\p{L}\p{N}])kw(?![\p{L}\p{N}])` atau substring. Prioritas: rule Satu post sebelum Semua post, kata tertentu sebelum kata apa pun, lalu yang lebih lama dibuat. Satu rule per pemicu.
- Webhook berlangganan `messages,messaging_postbacks,comments`. Migrasi mengosongkan `webhooks_subscribed_at`, jadi koneksi lama berlangganan ulang lewat poll notifikasi.

## Keputusan builder

- Dedupe: satu run per komentar atau `mid` DM (`claim_auto_dm_run()`, dengan advisory lock), dan satu run per rule per orang dalam 24 jam, supaya orang yang berkomentar "MAU" lima kali tetap menerima satu DM.
- Hanya webhook yang memicu. Komentar yang ditarik lewat Muat ulang tidak memicu, karena bisa berisi komentar dari sebelum rule dibuat.
- Komentar milik akun sendiri tidak memicu. Balasan komentar (reply) memicu seperti komentar biasa. Balasan publik dipasang di bawah komentar teratas thread-nya.
- Kalau cek follow gagal, atau Instagram tidak memberi nilainya, run dicatat gagal dan tidak ada yang dikirim. Ini supaya tombol "Sudah follow" tidak berputar terus.
- Rule yang dijeda mengabaikan pemicu baru dan juga ketukan tombol dari percakapan lama.
- Pesan yang memakai tombol (template) maksimal 640 karakter (batas Meta). Pesan utama tanpa tombol link maksimal 1000.
- Teks tombol postback yang diketuk dicatat sebagai pesan pelanggan, sehingga thread di inbox lengkap. `mid` postback juga menjadi dedupe untuk retry webhook.
- Tampilan mengikuti gaya aplikasi (zinc, accent), bukan token warna Bleam. PRD melarang meniru antarmuka Bleam persis.
- Tanpa variabel `{sender_name}` di pesan Auto DM. Tambahkan kalau owner meminta.

## Setup Meta

Di App Dashboard → Instagram → Webhooks, aktifkan field `messaging_postbacks` di samping `messages` dan `comments`. Tanpa field ini, tombol pembuka dan "Sudah follow" tidak memicu apa pun.

## Risiko yang diketahui

- Dokumen private reply di Meta hanya mencontohkan teks. Pengiriman tombol (template) lewat `recipient.comment_id` dipakai ManyChat dan Bleam, tetapi belum diuji live di sini. Kalau Meta menolaknya, run tampil gagal beserta pesan Instagram.
- `is_user_follow_business` butuh consent pengguna. Ketukan tombol postback diasumsikan cukup sebagai consent.
