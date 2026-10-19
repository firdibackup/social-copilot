# Aset: produk, aksi massal, dan tag

Lanjutan dari `2026-10-18-aset-website-design.md`.

## Masalah

- Slide AI dan foto milik sendiri dimuat dalam satu daftar 100 terbaru, jadi slide AI mendesak foto milik sendiri keluar.
- Mengelompokkan foto ke produk harus satu per satu, dan foto baru tidak bisa langsung masuk produk.
- Impor website meminta alamat lagi, padahal alamatnya sudah ada di Brand.
- Foto belum punya kata kunci untuk dicari atau dipakai AI nanti.

## Keputusan

### Tampilan `/aset`

- Tab **Milik saya** dan **Hasil AI**, masing-masing 100 foto terbaru dan dimuat terpisah.
- Milik saya:
  - Kartu **Produk**: daftar produk dengan foto sampul dan jumlah foto. Klik untuk menyaring grid; Ubah dan Hapus per produk; **+ Tambah produk** membuka dialog (nama, jenis, deskripsi). Menghapus produk tidak menghapus fotonya.
  - Kartu **Dari website**: memakai alamat di Brand. Tanpa alamat, kartu mengarah ke Brand.
  - Zona unggah: klik atau tarik foto, pilihan **Masukkan ke produk** (ikut produk yang sedang disaring), dan **Tag otomatis dengan AI** (aktif secara bawaan).
  - Grid: centang per foto dan Pilih semua. Saat menyaring satu produk, foto diurutkan menurut posisi dan diberi label `Image N`.
  - Bar aksi massal: masukkan ke/keluarkan dari produk, Aktifkan, Jeda, Buat tag AI (biaya tampil), Hapus.
  - Panel **Ubah** per foto: produk, status Aktif/Jeda, tag (dipisah koma), buat tag AI, hapus.
- Hasil AI: hanya bisa dihapus. AI tidak pernah memakainya sebagai foto produk, jadi produk, status, dan tag tidak berlaku.

### Tag

- Kolom `assets.tags text[]`, maksimal 20 tag; tiap tag huruf kecil, unik, maksimal 40 karakter (`cleanTags`, `parseTagInput`).
- Tag AI (`asset_tags`): foto dikirim dalam batch visual (maksimal 12 gambar, di bawah `VISUAL_BODY_BUDGET`), 1 kredit per foto. Jawaban yang tidak memuat tag untuk setiap foto dalam batch dianggap gagal dan tidak ditagih; batch sebelumnya tetap tersimpan.
- Katalog website meminta tag dalam permintaan yang sama tanpa biaya tambahan; foto yang tidak mendapat tag bisa diberi tag dari Aset.
- Belum ada fitur yang membaca tag untuk konten.

### Aksi server

Semua aksi massal menerima `id` berulang (unik, maksimal 100) dan menyaring `user_id`. Hapus melewati foto yang masih dipakai post dan melaporkan jumlahnya.

## Data

Migrasi `20261019020000_aset_tag.sql`: kolom `tags` dan task `asset_tags` pada CHECK `ai_generations.task`. Diterapkan dengan `npm run db:push`.

## Batas

- Masih 100 foto terbaru per tab, tanpa paginasi. `photoCount` dihitung dari foto yang dimuat.
- Memindahkan banyak foto tetap satu panggilan `move_asset_to_group` per foto.
