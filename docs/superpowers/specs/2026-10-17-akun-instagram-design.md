# Data per Akun Instagram dan Referensi Carousel — Desain

- **Tanggal:** 2026-10-17
- **Status:** dibangun 2026-10-17 (rencana historis: `docs/superpowers/plans/2026-10-17-akun-instagram.md`). Owner menegaskan data akun lama disembunyikan, bukan dihapus. Facebook Login/Business Discovery dihapus 2026-10-31. Belum diuji: migration di database VPS dan uji manual dua akun.
- **Menyentuh:** multi-user (`2026-10-16-multi-user-design.md`), Brand (`2026-10-16-brand-kit-design.md`), Buat Konten (`2026-10-16-buat-konten-design.md`), Balasan, Kalender, Aset, worker.

> **Pembaruan 2026-10-31:** cakupan aktif di bawah tidak lagi mencakup Business Discovery. Tabel `facebook_connections` tetap ada sebagai peninggalan migrasi, dan referensi lama bersumber `discovery` tetap didukung. Tidak ada perubahan database dalam penghapusan fitur ini. Detail penghapusan ada di [desain Brand Kit](2026-10-16-brand-kit-design.md#pembaruan-2026-10-31-penghapusan-business-discovery).

## Tujuan

Satu akun Instagram sama dengan satu brand. Kalau pengguna mengganti akun Instagram, isi app ikut berganti: brand kit, referensi desain, Aset, posting, ide, DM, dan template Auto DM yang tampil adalah milik akun yang sedang terhubung. Data akun lama tidak dihapus. Data itu hanya disembunyikan dan muncul lagi persis seperti terakhir kalau akun lama dihubungkan kembali.

Akun yang baru pertama kali dihubungkan tidak dimulai dari kosong. Brand kit-nya langsung terisi dari profil Instagram-nya, dan tiga posting terbarunya menjadi referensi desain.

Referensi dari carousel menyimpan seluruh slide, bukan hanya cover. Tiap slide diberi label Cover, Isi, atau CTA. Dengan begitu, saat Buat Konten memakai referensi itu, slide tengah dan slide penutup mencontoh slide yang sejenis, bukan cover.

Sukses kalau:

1. Putuskan @a lalu hubungkan @b: dashboard hanya menampilkan data @b. Putuskan @b lalu hubungkan @a lagi: semua data @a kembali, tanpa isi otomatis yang menimpanya.
2. Tidak ada posting @a yang tayang di @b, dalam keadaan apa pun.
3. Akun baru langsung punya brand kit tersimpan, logo, warna, gaya visual, dan sampai 3 referensi desain, tanpa memotong kredit.
4. Referensi carousel tampil sebagai slideshow dengan label per slide yang bisa diubah, dan Buat Konten memetakan slide ke label itu.

## Bukan tujuan

- Tombol pindah akun cepat atau beberapa akun terhubung sekaligus. Alurnya tetap Putuskan lalu Hubungkan.
- Menghapus permanen data akun yang tersembunyi. Belum ada UI untuk itu.
- Mengambil DM yang masuk ke akun lama selama akun itu terputus.
- Memilih slide referensi per slide di composer.
- Grup untuk foto upload atau gambar dari website. Menambah atau mengurutkan slide di dalam grup juga tidak termasuk.

## Anti-tujuan (gagal walau kodenya jalan)

- Konten brand A tayang di akun B.
- Ganti akun mereset kredit AI atau masa langganan.
- Putuskan menghilangkan data secara permanen.
- Isi otomatis memotong kredit, atau berjalan lagi saat akun lama dihubungkan ulang dan menimpa brand yang sudah diedit pemilik.

## Keputusan owner

| Topik | Keputusan |
|---|---|
| Data saat Putuskan | Tidak dihapus. Semua data diberi tanda akun dan dashboard hanya menampilkan data akun yang sedang terhubung. |
| Posting terjadwal saat Putuskan | Kembali jadi draft. |
| Aset | Per akun. |
| Sebelum ada akun terhubung | Wajib hubungkan Instagram dulu. Brand, Buat Konten, Kalender, Aset, dan Balasan terkunci. Pengaturan dan Langganan tetap terbuka. |
| Hasil isi otomatis brand kit | Langsung tersimpan, bisa diedit setelahnya. |
| Kredit isi otomatis | Gratis, sekali per akun baru. Tetap dicatat di `ai_generations` dengan biaya 0. |
| Video atau Reels | Dilewati. Yang diambil adalah 3 posting foto atau carousel terbaru. |
| Label slide | Berdasarkan urutan, bisa diubah pemilik. |
| Grup carousel berlaku untuk | Semua sumber Instagram yang aktif: isi otomatis dan posting akun sendiri. |
| Pemetaan di Buat Konten | Sesuai posisi: slide 1 ← Cover, slide tengah ← Isi (bergiliran), slide terakhir ← CTA. |

## Keputusan builder (dibuat saat desain, belum diperiksa owner)

- Kredit dan langganan tetap per pengguna (`ai_generations`, `payments` tidak diberi tanda akun).
- Data yang sudah ada saat migrasi menjadi milik akun yang sedang terhubung. Data pengguna yang saat ini tidak punya koneksi diambil oleh akun pertama yang mereka hubungkan berikutnya.
- Status "perlu hubungkan ulang" tetap dihitung terhubung, jadi datanya tetap terlihat.
- Kalau "Hubungkan ulang" ternyata masuk dengan akun berbeda, callback memperlakukannya sebagai Putuskan lalu Hubungkan (posting terjadwal akun lama jadi draft). Pop-up tidak bisa tampil di halaman login Instagram, jadi tombol Hubungkan ulang diberi teks "Pastikan masuk dengan @lama".
- Isi otomatis juga memakai foto profil Instagram sebagai logo, dan menghitung warna brand dari palet cover referensi.
- Kalau isi otomatis gagal di tengah jalan, apa yang sudah tersimpan tetap ada. Halaman Brand menampilkan pesan, dan tombol analisis manual tetap bisa dipakai. Tidak ada percobaan ulang otomatis.
- Referensi lama dan foto upload memakai label `single`.
- Menghapus referensi menghapus satu grup utuh.
- Grup menyimpan semua slide yang diberikan Instagram (maksimal 20). Slide video di dalam carousel memakai thumbnail kalau ada, dan dilewati kalau tidak ada.

## Model data

**Kunci akun.** Kunci akun adalah `instagram_user_id` dari Instagram Login, nilainya sama dengan `instagram_connections.instagram_user_id`. Kolom baru `account_id text` ditambahkan ke tabel yang tampil per akun:

- `brand_kit`, `brand_references`, `assets`, `posts`, `content_ideas`
- `dm_conversations`, `dm_messages`, `dm_settings`, `dm_templates`

Tabel anak seperti `post_media`, `post_slides`, `publish_attempts`, dan gambar referensi ikut induknya. Tabel anak tidak perlu kolom ini kecuali builder butuh untuk query.

**Tanda akun adalah filter tampilan, bukan batas keamanan.** Isolasi antar-pengguna tetap `user_id` seperti sekarang. Data dua akun milik pengguna yang sama adalah milik orang yang sama. Akibatnya:

- Query daftar dan pembacaan yang mengisi dashboard wajib memfilter akun sekarang.
- Insert wajib memberi tanda akun sekarang.
- Aksi per-id cukup memeriksa `user_id` seperti sekarang, **kecuali yang keluar ke Instagram**:
  - Menjadwalkan posting ditolak kalau akun posting bukan akun yang terhubung.
  - Worker memeriksa `posts.account_id` sama dengan akun koneksi sebelum membuat container. Kalau berbeda, posting gagal tanpa retry dengan pesan "Akun Instagram berbeda".
  - Mengirim DM ditolak kalau percakapannya bukan milik akun yang terhubung.

**Singleton** (`brand_kit`, `dm_settings`) dikunci per pengguna + akun. Data yatim dari migrasi (`account_id` null) harus bertahan sampai diambil akun berikutnya. Builder memilih cara aman di Postgres milik Supabase self-hosted, misalnya unique index `nulls not distinct` (PG15+) atau mengisi akun dulu sebelum mengganti kunci.

**Referensi berisi grup.** `brand_references` menjadi grup. Grup menyimpan sumber, label sumber, permalink, catatan, deskripsi, dan palet cover. Gambarnya pindah ke tabel anak, misalnya `brand_reference_images`, dengan kolom:

- `reference_id` (cascade)
- `position`
- `storage_path`
- `content_type`
- `label`, berisi `cover`, `isi`, `cta`, atau `single`

Migrasi menyalin tiap referensi lama menjadi satu gambar `position 0`, `single`. `MAX_REFERENCES` (30) menghitung grup.

**Status isi otomatis.** Kolom di `brand_kit`, misalnya `sync_status` dengan nilai null, `running`, atau `failed`, supaya halaman Brand bisa menampilkan "Menyiapkan brand dari @akun…" atau pesan gagal.

## Alur

**Gerbang.** `requireAccount()` mengembalikan `{ userId, accountId }`, dengan `accountId` diambil dari `instagram_connections`. Kalau belum ada koneksi, pengguna dialihkan ke `/pengaturan` dengan ajakan menghubungkan Instagram. Fungsi ini dipakai oleh loader halaman, server action, dan route handler milik Brand, Buat Konten, Kalender, Aset, dan Balasan, menggantikan `requireActiveUser()` di sana (fungsi itu tetap dipanggil di dalamnya). Pengaturan, Langganan, dan route OAuth tetap memakai `requireActiveUser()`. Seperti `requireUser()`, panggilannya harus di luar `try`.

**Putuskan.** Tombol Putuskan Instagram membuka modal `<dialog>` native, menggantikan `window.confirm`. Isi modal:

- Judul "Putuskan @username?"
- Daftar yang disembunyikan: brand kit, referensi desain, Aset, posting dan draft, ide, DM, dan template Auto DM.
- Jumlah posting terjadwal yang akan kembali jadi draft.
- Kalimat "Semuanya kembali kalau @username dihubungkan lagi."
- Tombol Batal dan Putuskan.

Server menjalankan satu fungsi SQL dalam satu transaksi:

1. Posting akun itu yang berstatus `scheduled` menjadi `draft`. Ini perubahan status saja, seperti batal.
2. Baris `instagram_connections` dihapus.

Posting yang sedang `publishing` dibiarkan: worker menyelesaikan atau menggagalkannya seperti biasa.

**Hubungkan.** Callback Instagram, setelah token dan profil didapat, berjalan dalam urutan ini:

1. Kalau pengguna masih terhubung ke akun lain (lewat Hubungkan ulang), jalankan langkah 1 Putuskan untuk akun lama itu.
2. Simpan koneksi.
3. Beri akun ini semua baris pengguna yang `account_id`-nya null.
4. Kalau belum ada `brand_kit` untuk pengguna + akun ini, berarti akunnya baru. Buat baris `brand_kit` dengan `sync_status = 'running'`, lalu jalankan isi otomatis di belakang dengan `after()` (cek dokumentasi Next 16.4 di `node_modules/next/dist/docs/`) supaya redirect tidak menunggu.

Menghubungkan ulang akun yang sudah punya `brand_kit` tidak memicu apa pun.

**Isi otomatis (akun baru).** Satu fungsi server, dengan langkah-langkah yang saling bebas sejauh mungkin:

1. Baca profil (username, nama, bio, foto profil) dan media terbaru beserta `children`.
2. Jalankan `analyzeProfile` dengan sumber Instagram saja dan biaya 0, lalu simpan field profil ke brand kit.
3. Simpan foto profil sebagai logo lewat jalur `logoFromUrl` yang sudah ada.
4. Impor sampai 3 posting non-video terbaru sebagai grup referensi.
5. Hitung palet cover di server: piksel mentah dari sharp, lalu `extractPalette`. Simpan palet itu ke grup, dan susun warna brand darinya (maksimal `MAX_COLORS`).
6. Jalankan `analyzeVisual` dengan biaya 0 pada gambar grup, lalu simpan `visualStyle` dan deskripsi tiap referensi.
7. Set `sync_status = null`. Kalau ada yang gagal, set `failed` dan catat lewat `describeError`.

"Gratis" berarti isi otomatis juga berjalan kalau kredit periode sudah habis. Builder memastikan pengecekan kredit di `runLogged` tidak memblokir pemanggilan berbiaya 0 ini, tanpa membuka jalan gratis lain.

**Ambil carousel.** `fetchRecentMedia` meminta `children{media_type,media_url,thumbnail_url}`. `toPosts` mengembalikan daftar gambar per posting, dan `VIDEO` di level atas dilewati untuk impor. Kalau Instagram tidak mengembalikan `children`, posting jatuh ke cover saja (`single`).

Di pemilih posting akun sendiri, kartu carousel menampilkan cover dengan lencana "Carousel · N". Memilihnya mengimpor seluruh grup, dan `MAX_IMPORT` menghitung posting.

**Label berdasarkan urutan.** Fungsi murni dari jumlah gambar:

- 1 gambar: `single`
- 2 gambar: `cover`, `isi`
- 3 gambar atau lebih: `cover`, `isi`…, `cta`

**Tampilan referensi.** Kartu grup menampilkan slideshow (scroll-snap horizontal atau panah) dengan chip label per slide. Label diubah lewat select. Catatan, deskripsi, dan tombol hapus berlaku per grup.

**Analisis visual manual.** `loadVisualReferences` mengirim cover, satu Isi, dan CTA dari tiap grup, selama muat di `VISUAL_BODY_BUDGET`. `VISUAL_REFERENCE_LIMIT` menghitung gambar.

**Pemetaan di Buat Konten.** `drawImage` sudah menerima `slide: { index, count }`. Pemuat gambar referensi memilih gambar grup berdasarkan posisi:

| Posisi slide | Gambar referensi |
|---|---|
| Slide 1, atau konten satu gambar | `cover` (atau `single`, atau gambar pertama) |
| Slide terakhir (kalau `count > 1`) | `cta` |
| Slide tengah ke-i | `isi[(i - 1) % jumlahIsi]` |

Label yang tidak ada jatuh ke cover, dan cover yang tidak ada jatuh ke gambar pertama. Edit slide (`slide_edit`) memakai pemetaan yang sama berdasarkan posisinya. Select referensi di composer menampilkan jumlah slide grup.

**DM.** Webhook memberi tanda `account_id = entry.id` pada percakapan dan pesan. Balasan, template Auto DM, dan `dm_settings` (termasuk status Aktifkan DM) dibaca per akun. DM untuk akun yang tidak terhubung tetap dibuang seperti sekarang.

## Pengujian

- Fungsi murni: label berdasarkan urutan, pemilihan gambar referensi per posisi slide, dan `toPosts` dengan `children` (carousel, video dilewati, thumbnail slide video).
- Callback: akun baru memicu isi otomatis sekali, akun lama tidak, dan akun berbeda lewat Hubungkan ulang menjadikan posting terjadwal draft.
- Putuskan: posting terjadwal menjadi draft dan koneksi terhapus dalam satu transaksi.
- Worker: posting dengan akun berbeda gagal tanpa retry.
- Filter akun pada query daftar Brand, Aset, Kalender, Buat, dan Balasan.
- Uji manual dengan dua akun Instagram nyata: Putuskan → Hubungkan akun lain → kembali, plus isi otomatis dan carousel dari posting akun sendiri.
