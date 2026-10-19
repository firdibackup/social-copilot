# Website → Aset

## Masalah

Website brand sudah bisa dibaca untuk mengisi sebagian Brand, tetapi hanya halaman depan dan beberapa metadata gambar. Gambar website belum menjadi katalog yang bisa dipakai saat membuat konten, Aset masih berupa satu daftar datar, dan AI gambar belum bisa mempertahankan produk asli.

## Tujuan

- Membaca halaman depan dan maksimal 10 halaman lain pada domain yang sama.
- Memprioritaskan tautan produk, shop, menu, katalog, dan koleksi.
- Mengimpor maksimal 40 gambar berguna sebagai JPEG ke Aset tanpa mengimpor ulang gambar yang sama.
- Mengelompokkan foto satu produk, memberi kategori, judul, dan deskripsi yang dapat diedit, serta memberi kontrol Aktif/Jeda per foto.
- Memisahkan Aset menjadi **Milik saya** dan **Hasil AI**.
- Memakai seluruh teks website untuk draf Brand dan memakai logo serta foto website aktif ketika referensi visual Instagram tidak tersedia.
- Memberi pilihan Produk **Otomatis**, **Tanpa**, atau satu kelompok pada Buat Konten.
- Mempertahankan bentuk, warna, kemasan, dan label produk asli pada slide sambil tetap memakai referensi desain untuk tata letak.

## Keputusan produk

### Struktur Aset

- `Milik saya` berisi foto unggahan dan hasil impor website.
- `Hasil AI` berisi gambar yang dibuat oleh AI untuk slide.
- Aset lama yang terhubung ke `post_slides` ditandai sebagai hasil AI saat migrasi.
- Kelompok mempunyai kategori, judul, dan deskripsi. Kategori yang tersedia:
  - Produk
  - Orang/Tim
  - Tempat
  - Logo/Grafis
  - Lainnya
- Satu kelompok Produk mewakili satu produk dan dapat memiliki beberapa foto.
- Setiap foto memiliki posisi dan label tampilan `Image N`.
- Aktif/Jeda berlaku per foto. Foto yang dijeda tetap tersimpan dan tetap terlihat di pemilih foto post; status hanya menentukan apakah AI boleh memakainya.
- Kelompok dan metadata dapat dibuat atau diubah user.

### Crawl website

- Satu proses membaca maksimal 11 halaman: halaman depan ditambah 10 halaman internal.
- Hanya HTTP/HTTPS, domain yang sama, tanpa kredensial URL, dan setiap redirect tetap melewati pemeriksaan host publik.
- Tautan dengan kata `produk`, `product`, `shop`, `menu`, `katalog`, `catalog`, `koleksi`, atau `collection` diprioritaskan.
- Maksimal 40 gambar raster berguna. Ikon, SVG, gambar kecil, dan duplikat dilewati.
- Gambar yang diterima dikonversi di server menjadi JPEG yang aman untuk Aset.
- URL sumber dinormalisasi dan disimpan untuk dedupe. Hash hasil gambar juga disimpan agar URL berbeda dengan isi sama tidak diimpor dua kali.
- Kegagalan satu halaman atau gambar tidak membatalkan hasil yang sudah berhasil; user menerima peringatan ringkas.

### Katalog AI

- Gambar kecil beserta alt text dan teks di sekitarnya dikirim dalam batch yang tetap di bawah batas request visual 1 MB.
- AI mengembalikan kategori, judul kelompok, deskripsi kelompok, dan nomor kelompok untuk setiap gambar.
- Hasil divalidasi terhadap ID gambar yang benar sebelum disimpan.
- Tugas dicatat sebagai `website_catalog` dan dikenakan 10 kredit per batch.
- Data gambar, base64, signed URL, dan query token URL sumber tidak disimpan di log AI.
- Hasil AI selalu dapat diedit user.

### Brand

- Analisis profil menerima teks dari semua halaman yang berhasil dibaca, dengan batas per halaman dan batas total.
- Isi halaman diperlakukan sebagai data yang tidak dipercaya; instruksi di dalam website harus diabaikan model.
- Kandidat logo dikumpulkan lintas halaman dan dirangking. Jika Brand belum mempunyai logo, UI menyarankan kandidat terbaik tetapi tidak menyimpannya otomatis.
- Jika referensi Instagram tidak ada atau tidak cukup, analisis visual memakai logo dan foto website aktif.
- Warna fallback diambil dari logo.
- Analisis hanya mengisi form Brand; user tetap menekan Simpan.
- Semua halaman Brand dan Aset tetap membutuhkan akun Instagram terhubung. Kondisi “IG tak ada” berarti akun terhubung tetapi datanya tidak memberi referensi yang cukup.

### Buat Konten

- Composer mempunyai pilihan Produk: **Otomatis**, **Tanpa**, atau satu kelompok aktif.
- Planner menerima daftar kelompok Produk aktif beserta fakta ringkasnya.
- Planner memilih `productId` per slide atau `null`; ID yang tidak ada dalam kandidat ditolak.
- `productId` disimpan pada `post_slides` agar retry dan edit memakai produk yang sama.
- Gambar produk dikirim sebagai input identitas, bukan referensi gaya. Prompt mewajibkan bentuk, warna, kemasan, dan label dipertahankan.
- Urutan prioritas dalam batas 1 MB:
  1. slide saat ini ketika diedit,
  2. gambar produk,
  3. referensi desain,
  4. slide isi lain,
  5. logo.
- Referensi desain tetap mengatur komposisi dan tata letak. Produk tidak boleh diganti dengan produk dari referensi desain.

## Data

Migrasi baru menambahkan:

- `asset_groups`: owner/account, kategori, judul, deskripsi, asal, URL website, dan waktu pembuatan/perubahan.
- `assets.origin`: `upload`, `website`, atau `ai`.
- `assets.group_id`, `group_position`, `is_active`, `source_url`, dan `content_hash`.
- indeks dedupe URL dan hash yang dibatasi oleh user serta account.
- `post_slides.product_group_id` sebagai FK ke kelompok Produk.
- task `website_catalog` pada CHECK `ai_generations.task`.

Semua tabel baru memakai RLS tanpa policy, tidak dapat diakses `anon` atau `authenticated`, dan hanya dibaca melalui server service role. Semua query daftar difilter dengan `user_id` dan `account_id`.

## Batas dan keamanan

- Tidak menjalankan JavaScript website.
- Tidak membuka domain lain dari tautan halaman.
- Batas request, redirect, ukuran HTML/CSS/gambar, jumlah halaman, jumlah kandidat, jumlah gambar, dan deadline keseluruhan diterapkan di server.
- URL lengkap bertoken tidak pernah masuk log.
- Gambar didekode dengan batas piksel sebelum diproses.
- Crawl hanya dimulai dari URL yang dimasukkan user untuk website brand mereka.

## Tahapan implementasi

1. Fondasi data Aset dan klasifikasi aset lama.
2. UI Aset: tab, kelompok, metadata, Image N, Aktif/Jeda.
3. Crawl multi-halaman, ekstraksi gambar, konversi JPEG, dan dedupe.
4. Katalog AI bertahap dan kredit.
5. Analisis Brand multi-halaman, saran logo, dan fallback visual.
6. Pemilihan produk per slide di Buat Konten dan prioritas input gambar.

## Verifikasi

- Unit test untuk migrasi kontrak, parser crawl, prioritas tautan, batas halaman/gambar, dedupe, dan konversi JPEG.
- Unit test katalog AI untuk batch, validasi output, billing, serta larangan data gambar di log.
- Unit test profil multi-halaman dan fallback visual.
- Unit test request Produk, planner, payload SQL, retry/edit, dan urutan gambar.
- Jalankan `npm test`, `npm run typecheck`, dan `npm run lint` pada setiap tahap.
- Migrasi diterapkan oleh user dengan `npm run db:push` karena Supabase lokal tidak tersedia di lingkungan ini.
