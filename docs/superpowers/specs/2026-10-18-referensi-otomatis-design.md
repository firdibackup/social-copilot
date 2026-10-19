# Referensi otomatis per label

## Masalah

Slide isi dan CTA sering ikut terlihat seperti cover. Ada dua penyebab:

1. Gambar slide 1 (cover) dikirim ke AI gambar sebagai contoh untuk setiap slide berikutnya.
2. Kalau referensi tidak punya gambar Isi atau CTA, sistem memakai gambar cover sebagai gantinya.

Selain itu, kalau user tidak memilih referensi, tidak ada gambar referensi yang dipakai sama sekali.

## Keputusan

- Dropdown Referensi punya tiga pilihan: **Otomatis** (default), **Tanpa**, dan daftar referensi.
- Gambar referensi dipilih **sekali, saat post dibuat**, lalu disimpan per slide di `post_slides.reference_image_id`. Peran slide juga disimpan di `post_slides.role`, dengan nilai `cover`, `isi`, `cta`, atau null untuk post satu gambar.
- **Otomatis**: semua gambar referensi akun dikumpulkan per label. Untuk satu post dipilih acak satu gambar Cover, satu gambar Isi, dan satu gambar CTA:
  - slide cover memakai gambar Cover (cadangannya gambar Tunggal),
  - semua slide isi memakai gambar Isi yang sama,
  - slide CTA memakai gambar CTA,
  - post satu gambar memakai gambar Cover, atau Tunggal kalau tidak ada Cover.
- **Referensi tertentu**: aturannya sama, tetapi gambarnya hanya diambil dari grup itu, dan yang dipakai adalah gambar pertama per label, bukan acak.
- **Label tidak ada**: slide itu dibuat tanpa gambar referensi. Sistem tidak pernah memakai cover sebagai gantinya.
- **Grup yang isinya hanya foto Tunggal** (bukan carousel): foto itu dipakai sebagai referensi gaya untuk semua slide.
- **Gambar cover tidak lagi dikirim** ke slide lain. Slide isi mencontoh slide isi yang sudah jadi, yang paling awal di post. CTA hanya mengikuti referensi CTA dan brand.
- **Prompt gambar**: kalimat "all slides share one consistent design" diganti dengan keterangan bahwa cover, isi, dan CTA punya tata letak masing-masing, dan yang dipakai bersama hanya warna dan font brand.
- **Edit slide**: memakai `role` dan `reference_image_id` yang tersimpan, plus gambar slide itu sendiri.

## Data

Migrasi `20261018000000_referensi_otomatis.sql`:

- **Kolom baru di `post_slides`**:
  - `role`,
  - `reference_image_id` (FK ke `brand_reference_images`, `on delete set null`).
- **Isi ulang data lama**:
  - `role` diisi dari posisi slide,
  - `reference_image_id` diisi dari grup `reference_id` yang lama, sesuai label.
- **`create_content`**: membaca `role` dan `reference_image_id` per slide. `reference_id` diambil dari grup gambar itu.
- **`replace_slide`**: parameter `p_reference_id` diganti dengan `p_role` dan `p_reference_image_id`.

## Test

- `planReferenceImages`:
  - memilih satu gambar per peran,
  - tanpa cadangan ke cover,
  - grup yang isinya hanya foto Tunggal,
  - pilihan acak dan pilihan deterministik.
- `buildImagePrompt`:
  - peran slide dibaca dari input,
  - contoh `previous` = slide isi lain, bukan cover.
- `drawImage`: memuat gambar referensi berdasarkan id.
- `parseContentRequest`: menerima `auto`.
