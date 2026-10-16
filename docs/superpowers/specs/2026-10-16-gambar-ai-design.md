# Gambar AI — Desain

- **Tanggal:** 2026-10-16
- **Status:** disetujui lewat brainstorming ("gas laksanakan"). Review spec dan rencana tertulis dilewati atas permintaan owner.
- **Melanjutkan:** brand kit (`2026-10-16-brand-kit-design.md`), seperti "draf visual" di Bleam.

## Tujuan dan kriteria sukses

Owner membuat gambar post yang sesuai brand lewat 9Router. Jumlah gambar mengikuti isi konten: satu gambar, dua, atau carousel sampai 10 slide. Gambar hanya menjadi draf sampai owner memilih **Pakai di post** (di `/buat`) atau **Simpan ke Aset** (di `/studio`).

Sukses kalau:

1. Dari isi konten, **Rencanakan slide** menghasilkan daftar slide (headline + deskripsi gambar) yang bisa diedit.
2. **Buat gambar** menghasilkan JPEG berasio Instagram yang memakai gaya visual, palet, dan font brand, dengan headline persis seperti yang ditulis owner (atau tanpa teks sama sekali).
3. Slide 2 dan seterusnya bisa disamakan dengan slide 1 (tokoh, warna, layout).
4. Gambar terpilih masuk Aset lewat pipeline unggah yang sudah ada, berurutan, lalu menjadi foto carousel post.

## Temuan 9Router (dicek 2026-10-16, setelah owner memperbarui 9Router)

- Model gambar: `cx/gpt-image-2.5` (juga `-flare`, `-sunburst`, `gpt-image-2`, `gpt-image-1.5`, `gpt-5.6-*-image`). Sebelum update, semua ditolak Codex ("not supported when using Codex with a ChatGPT account" / "requires a newer version of Codex").
- `POST /v1/images/generations` dengan `Accept: text/event-stream` membalas event `progress` (dan `partial_image`), lalu `done` berisi `{"created":…,"data":[{"b64_json":"…"}]}`, atau `error` berisi `{"message":"…"}`. SSE menjaga koneksi tetap hidup selama 30–40 detik pembuatan.
- `size: "1088x1360"` + `output_format: "jpeg"` menghasilkan JPEG 1122×1402 (4:5), 142 KB, dalam 28,5 detik. Teks Indonesia di dalam tanda kutip ditulis persis. Tanpa larangan, model menambah tulisan sendiri.
- Referensi: source 9Router (`9router@0.5.104`) membaca `images: string[]` dan `image: string`. Masing-masing boleh data URL, URL http(s), atau base64 mentah, lalu diteruskan ke Responses API sebagai `input_image`. Untuk model `gpt-image-*`, ada gambar berarti `action: "edit"`. URL diteruskan ke OpenAI yang hanya menerima HTTPS, jadi app mengirim data URL. Body request tetap dibatasi 1 MB oleh nginx.

## Keputusan

| Topik | Keputusan | Alasan |
|---|---|---|
| Model | `ROUTER_IMAGE_MODEL`, default `cx/gpt-image-2.5` | Terbukti jalan; diganti lewat env. |
| Letak | Panel **Gambar AI** di `/buat` + halaman `/studio`, satu komponen `ImageGenerator` | Owner memilih dua-duanya. |
| Jumlah gambar | AI (Haiku) menyusun rencana 1–10 slide dari isi konten; owner bisa mengedit, menambah, menghapus | "Tergantung isi kontennya." |
| Prompt gambar | Template bahasa Inggris dari deskripsi, headline, format, dan brand kit (gaya visual, palet + peran, font) | Model gambar paling patuh pada bahasa Inggris; tanpa langkah AI tambahan per gambar. |
| Teks | Headline opsional ditulis persis dalam tanda kutip; kosong berarti larangan teks, logo, dan watermark | Pilihan owner; tes kucing menunjukkan model menambah teks sendiri. |
| Referensi | Satu referensi brand pilihan, logo (opsional), dan slide 1 untuk konsistensi, dikirim sebagai data URL | Pilihan owner "teks + gambar referensi". |
| Batas 1 MB | Gambar input dimasukkan berurutan (slide 1, referensi, logo) selama total ≤ 900.000 karakter; sisanya dilewati dan disebut di hasil | Sama dengan analisis visual. |
| Format | 4:5 → `1088x1360`, 1:1 → `1024x1024`, 1.91:1 → `1536x800`; JPEG | Ukuran 4:5 terbukti; `toInstagramJpeg` merapikan sisanya. |
| Penyimpanan | Hasil hanya di browser sampai dipilih; lalu `toInstagramJpeg` → `uploadAsset` | Pipeline yang sama dengan unggahan biasa. |
| Kuota | Tugas `image` dan `image_plan` di `ai_generations`, ikut `DAILY_LIMIT`; log tanpa data gambar | Satu kuota 9Router. |
| Urutan | Slide dibuat satu per satu dari browser (satu server action per slide) | Progres per slide dan bisa dibuat ulang; server action memang antre per tab. |

## Hasil tes langsung (2026-10-16)

- Dari UI `/studio`: rencana 2 slide 4,9 detik, slide 1 26 detik, slide 2 (dengan slide 1 sebagai referensi) 38 detik, lalu Simpan ke Aset. Slide 2 mengikuti warna dan gaya ilustrasi slide 1.
- Rencana pertama menaruh contoh kalimat di deskripsi, jadi slide isi keluar tanpa teks. Aturan perencana diperbaiki: semua teks yang tampil di gambar masuk ke kolom teks (1–4 baris, maks 150 karakter), deskripsi hanya visual. Hasil berikutnya: 6 slide seperti "Make a cake\nMake a plan\nMake a mistake", dan teks dua baris ditulis persis.

## Model data

Migrasi `20261016030000_image_generation.sql`: CHECK `ai_generations.task` ditambah `image` dan `image_plan`. Tidak ada tabel baru.

## Error

- HTTP error 9Router (mis. model ditolak) → pesan provider + "Periksa ROUTER_IMAGE_MODEL".
- Event `error` atau stream tanpa `done` → "Gambar gagal dibuat: <pesan provider>".
- Batas harian, konfigurasi, timeout → `aiErrorMessage` yang sudah ada.

## Tes

Vitest: validasi permintaan, prompt (headline/tanpa teks, brand, referensi), parser SSE, parser rencana slide, klien `generateImage` (fetch mock). Pemeriksaan langsung: satu carousel dari UI.

## Ditunda

- Membatalkan pembuatan yang sedang berjalan.
- Riwayat gambar yang tidak disimpan.
- Membuat beberapa slide paralel.
