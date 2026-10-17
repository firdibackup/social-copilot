# Buat Konten — Desain

- **Tanggal:** 2026-10-16
- **Status:** dibangun di PR #3 (`feat/buat-konten`) tanpa spec tertulis. Spec ini disusun dari kodenya, lalu dirapikan bersama perbaikan lanjutan di branch `fix/buat-konten-lanjutan`.
- **Menggantikan:** panel Asisten AI dan Gambar AI di editor `/buat`, serta halaman `/studio` (`2026-10-16-buat-ai-design.md`, `2026-10-16-gambar-ai-design.md`). `/studio` dialihkan permanen ke `/buat`.

## Tujuan

Owner menulis satu topik, lalu AI menyusun caption dan gambar post-nya sekaligus. Hasilnya langsung tampil sebagai pratinjau feed Instagram yang bisa diedit. Setelah itu post diubah lewat kotak perintah yang sama, baik slide maupun caption. Semua yang diketik tersimpan otomatis.

Sukses kalau:

1. Satu topik menghasilkan draft berisi judul, caption, dan 1–10 slide bergambar, dengan kuota yang dipotong sekali di awal.
2. Slide dibuat satu per satu di browser, tetap konsisten dengan slide 1, dan bisa dicoba lagi gratis kalau gagal.
3. Satu perintah ("ganti jadi malam hari") membuat ulang satu slide dari gambarnya sekarang, sementara bagian lain tetap sama.
4. Caption bisa diubah AI dengan perintah bebas dan bisa di-Urungkan.
5. Ide konten dari brand kit bisa dijadikan topik dengan satu klik.

## Alur

- **`/buat`** punya dua kolom: daftar konten dan ide (`content-list.tsx`) serta editor (`content-editor.tsx`). Di HP hanya satu kolom tampil. `?id=` membuka post, `?ide=` memulai dari ide, `?baru=1` memulai post kosong, dan `?tanggal=YYYY-MM-DD` (dari Kalender) memulai post dengan jadwal yang disarankan pada hari itu pukul 19.00.
- **Post baru dari topik.** Composer mengirim topik, jumlah slide, format (4:5 atau 1:1), referensi brand, dan logo. `createContentAction` → `planContent` meminta Haiku menulis `{title, caption, slides[{headline, scene}]}` dengan jumlah slide yang tepat. Di dalam permintaan yang sama, `create_content()` menyimpan draft beserta slide-slide `pending`, lalu menghapus ide asalnya. Kalau penyimpanan gagal, permintaan tercatat gagal dan biayanya 0.
- **Antrean slide.** Editor menjalankan `generateSlideAction` untuk slide `pending` pertama, sesuai urutan carousel. `claim_slide()` mengubahnya menjadi `generating`, sehingga dua tab tidak membuat slide yang sama. Slide 2 dan seterusnya menerima slide 1 sebagai gambar input. Gambar dari provider dipotong ke ukuran pasti format itu oleh `toSlideJpeg` (sharp, di server), disimpan ke Aset, lalu `attach_slide()` memasukkannya ke `post_media`. Slide `generating` yang lebih tua dari 5 menit dianggap generatornya mati dan boleh diambil lagi. Selama ada slide di tab lain, editor me-refresh tiap 4 detik.
- **Edit slide.** `editSlideAction` membaca prompt asal slide (`findSlideByAsset`), lalu `reviseSlide` meminta Haiku mengubah headline dan scene sesuai perintah. Gambar sekarang dikirim sebagai `currentImage` (prioritas pertama di batas 1 MB) dan `drawImage` menggambar ulang. `replace_slide()` menukar foto di posisi yang sama dan menyimpan prompt baru sebagai baris `ready`. Foto unggahan owner tidak punya prompt, jadi formatnya ditebak dari ukuran (persegi kalau tidak portrait). Foto lama tetap ada di Aset.
- **Edit caption.** `editCaptionAction` → `editCaption`. Kalau caption kosong, AI menulis caption baru. Hasilnya hanya mengisi editor, disimpan seperti teks ketikan, dan bisa di-Urungkan selama caption belum diubah lagi.
- **Simpan otomatis.** `saveContentAction` berjalan 1 detik setelah ketikan terakhir dan menyimpan caption serta urutan foto lewat `save_post()`. Status dan jadwal tetap, kecuali post `failed` atau `cancelled`, yang menjadi draft (lihat Ditunda). Simpan ditolak selama ada slide `pending` atau `generating`, karena `save_post` mengganti daftar foto dan akan membuang slide yang sedang masuk. Jadwalkan (`savePostAction`) punya penjagaan yang sama.
- **Ide.** `generateIdeasAction` meminta 10 ide dari brand kit, tanpa mengulang ide yang masih terbuka atau 20 judul post terbaru. Tanpa brand kit, owner diminta melengkapi Brand dulu.

## Keputusan

| Topik | Keputusan | Alasan |
|---|---|---|
| Biaya post baru | `contentCost(n) = 3 + 20n` kredit, dipotong sekali; tiap slide lalu `content_slide` (0) | Owner tahu harga di depan; slide gagal bisa dicoba lagi tanpa biaya. |
| Biaya edit | `slide_edit` 20, `caption_edit` 2, `content_ideas` 2 | Gambar paling mahal di 9Router. |
| Antrean | Di browser, satu slide per server action, urut carousel | Server action Next diproses berurutan per klien; tiap slide butuh 30–40 detik, dan progresnya terlihat per slide. |
| Konsistensi | Slide 1 selalu dikirim sebagai `previousImage` (JPEG 640 px, `toReferenceDataUrl`) | Menggantikan opsi "Samakan dengan slide 1"; carousel AI hampir selalu ingin seragam. |
| Ukuran akhir | Server memotong ke 1080×1350 atau 1080×1080 dengan sharp | Provider mengembalikan ukuran sendiri (mis. 1122×1402). Hasil disimpan tanpa lewat browser. |
| Format | Hanya 4:5 dan 1:1 | 1.91:1 butuh 1536 px, lebih lebar dari batas 1440 px Instagram. |
| Prompt slide | Semua teks gambar ada di `headline`; `scene` hanya visual | Temuan Gambar AI: teks di deskripsi membuat model tidak menulisnya. |
| Data slide | Tabel `post_slides` terpisah dari `post_media` | `post_media` tetap yang diterbitkan worker; slide menyimpan prompt untuk edit berikutnya dan menjadi antrean. |
| Judul | `posts.title` (≤ 120) untuk daftar konten | Caption baris pertama kurang jelas sebagai nama. |

## Model data

Migrasi `20261016060000_buat_konten.sql`:

- `content_ideas (user_id, title ≤ 200)`.
- `posts.title text not null default ''`.
- `post_slides (post_id, position 0–9, headline ≤ 150, scene 1–1000, format, reference_id, include_logo, status pending|generating|ready|failed, claimed_at, error, asset_id)`. Slide dicari lewat `asset_id`, bukan posisi, karena setiap edit menambah baris.
- CHECK `ai_generations.task` ditambah `content`, `content_slide`, `slide_edit`, `caption_edit`, `content_ideas`. Tugas lama tetap ada untuk baris lama.
- Fungsi: `create_content`, `claim_slide`, `attach_slide`, `replace_slide`. Semuanya hanya untuk `service_role`. `attach_slide` dan `replace_slide` mengunci baris post dulu, jadi menunggu `save_post` yang sedang berjalan.

Perbaikan setelah PR #3 (migrasi belum pernah diterapkan, jadi diperbaiki di file yang sama):

- `create_content` menolak `p_slides` SQL NULL (`is distinct from 'array'`). Sebelumnya NULL membuat draft tanpa slide.
- `attach_slide` memakai posisi kosong pertama kalau posisinya sudah terisi, bukan posisi setelah foto terakhir. Contoh yang dulu gagal: 10 slide, 3 gagal, simpan otomatis merapatkan urutan foto, slide 10 lalu masuk di posisinya sendiri (9), dan slide 1 mendapat `post_full` padahal post baru berisi 8 foto.
- `attach_slide` memperbarui slide hanya kalau masih `generating`. Setelah klaim ulang 5 menit, dua generator bisa membaca slide yang sama. Generator kedua sekarang gagal dengan `slide_not_claimed` dan insert-nya dibatalkan, jadi gambarnya tidak masuk dua kali.
- `replace_slide` hanya menyimpan referensi milik user sendiri yang masih ada.

## Error

- Kuota, konfigurasi, dan 9Router: `aiErrorMessage` dan `imageErrorMessage` (lihat CLAUDE.md, AI).
- Byte gambar yang tidak terbaca, termasuk base64 yang terdekode menjadi 0 byte: `SlideImageError` → "Gambar dari layanan AI tidak bisa dibaca." Sharp melempar error untuk buffer kosong secara sinkron, jadi pemanggilannya ada di dalam `try`.
- Penolakan fungsi SQL (`post_locked`, `post_full`, `slide_not_claimed`, `slide_not_found`, `invalid_media`) → `SlideError` dengan pesan untuk owner (`src/lib/slides.ts`). Slide yang gagal menyimpan pesannya dan menampilkan **Coba lagi (gratis)** atau **Hapus slide**.

## Tes

Vitest: `content-options` (validasi), `content-ai` (prompt, parser rencana, ide, caption, slide, biaya dan log), `ai` (`runLogged`, kredit, log, pesan error), `image-ai` (prompt, urutan dan batas gambar input, log), `slide-image` (ukuran, potong tengah, transparansi, EXIF, byte rusak dan kosong), `billing-options`, `format` (`suggestedSlot`, `slotOn`), dan `buat/actions`.

SQL dijalankan di PGlite (Postgres 17 dalam WASM) dengan stub `auth.users`, `storage.buckets`, dan role Supabase: kesembilan migrasi, lalu `create_content`, `claim_slide`, `attach_slide`, dan `replace_slide`, termasuk akses user lain, `anon`, post terkunci, post penuh, dan skenario posisi di atas. Harness ini tidak masuk repo. Interleaving dua transaksi tidak bisa diuji di PGlite karena hanya punya satu backend.

## Ditunda

- **Simpan otomatis mengubah post `failed` dan `cancelled` menjadi draft.** Pesan gagalnya dan tombol **Coba terbitkan lagi** ikut hilang. Perbaikannya (`save_post` menerima status "tidak berubah") menyentuh fungsi SQL milik semua alur post, jadi menunggu keputusan owner.
- **Worker bisa menerbitkan carousel saat slide yang gagal sedang dicoba lagi.** Ini terjadi kalau post sudah terjadwal dan jam terbitnya tiba dalam 30–40 detik itu. Penjagaan yang menyeluruh ada di `claim_due_post`.
- **Fitur lama yang tidak ikut:** 3 variasi caption dengan tujuan, nada, dan audiens; ide dari topik (sekarang hanya dari brand kit); preset rewrite dan **+ Hashtag**; Gambar AI untuk post yang berisi foto sendiri; gambar stok dari `/studio` tanpa post; slide manual; memilih gambar mana yang disimpan (sekarang semua masuk Aset); format 1.91:1; peringatan "Dilewati: …" saat referensi atau logo tidak muat.
- Menghapus post saat slide sedang dibuat meninggalkan gambarnya di Aset tanpa post.
- Dua permintaan AI bersamaan bisa sama-sama lolos cek kredit (`runLogged`, ponytail).
