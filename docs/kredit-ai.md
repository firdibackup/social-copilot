# Panduan Kredit AI

Kredit adalah satuan internal Carousely untuk membatasi pemakaian AI per periode langganan. Kredit **bukan token** dari 9Router atau provider: angkanya kita tentukan sendiri, dan tidak dihitung dari token yang dipakai model. Semua angka ada di satu file, `src/lib/billing-options.ts`.

## Jatah

| Nama | Nilai | Arti |
|---|---|---|
| `credits` paket | 10.000 | Jatah AI satu periode (30 hari). 10.000 kredit = 100%. |

Nilai bawaannya ada di `DEFAULT_PLAN` (`src/lib/billing-options.ts`). Admin bisa menggantinya di `/admin/pengaturan`; nilai itu disimpan di tabel `app_settings` dan dibaca lewat `getPlan()` di `src/lib/app-settings.ts`.

Sisa kuota tidak terbawa ke periode berikutnya. Periode dimulai dan berakhir bersama pembayaran di tabel `payments` (lihat bagian Langganan di `CLAUDE.md`).

## Biaya per permintaan

| Tugas (`LoggedTask`) | Kredit | Porsi jatah | Kapan dipakai |
|---|---|---|---|
| `content` | 3 | 0,03% | Caption dan rencana slide untuk konten baru |
| `content_slide` | 0 | 0% | Membuat gambar tiap slide. Sudah dibayar di muka lewat `contentCost` |
| `slide_edit` | 20 | 0,2% | Merevisi atau menggambar ulang satu slide |
| `caption_edit` | 2 | 0,02% | Menulis ulang caption |
| `content_ideas` | 2 | 0,02% | Tombol "Cari ide" (tidak ditampilkan di UI) |
| `content_script` | 3 | 0,03% | Tombol "Buat skrip" di ide: skrip per slide sebelum konten dibuat |
| `brand_profile` | 5 | 0,05% | Mengisi brand kit dari website atau akun |
| `brand_visual` | 10 | 0,1% | Analisis gaya visual dari referensi |
| `website_catalog` | 10 | 0,1% | Mengelompokkan satu batch gambar website (hingga 12) ke produk Aset, termasuk tag fotonya |
| `asset_tags` | 1 per foto | 0,01% per foto | Tag AI untuk foto milik sendiri di Aset (`tagCost(foto)`); hasil AI tidak diberi tag. Tercatat sebagai "Tag foto" di Admin |
| `reply_draft` | 1 | 0,01% | Tombol ✨ AI di kotak balasan Balasan (DM, balasan komentar, balas lewat DM): menulis draf atau merapikan draf owner |
| `chat` | 0 | 0% | Satu pesan ke Mimo, termasuk semua tool yang dipanggil dalam pesan itu |
| `deep_search` | 0 | 0% | Satu pemakaian Intel Kompetitor melalui Apify di dalam Mimo |
| `chat_summary` | 0 | 0% | Memperbarui ringkasan bergulir percakapan Mimo |

Mimo tidak memotong kredit untuk chat, Intel Kompetitor, atau ringkasan. Baris `ai_generations` untuk ketiganya tetap dibuat sebagai audit pemakaian; limit hariannya ditegakkan oleh counter atomik yang dijelaskan di bawah. Menulis atau merevisi skrip melalui Mimo tetap memakai tugas `content_script` dan memotong 3 kredit per skrip, sama seperti dari menu Buat.

Satu gambar bernilai `IMAGE_CREDITS = 20`, karena gambar paling mahal di 9Router.

## Biaya satu konten baru

Konten baru dibayar sekali di awal: `contentCost(slides) = content + slides × IMAGE_CREDITS = 3 + 20 × slides`.

| Slide | Kredit | Porsi jatah | Maksimal per periode |
|---|---|---|---|
| 1 | 23 | 0,2% | 434 |
| 3 | 63 | 0,6% | 158 |
| 5 | 103 | 1% | 97 |
| 10 | 203 | 2% | 49 |

Gambar tiap slide kemudian dibuat satu per satu dan tidak dikenakan biaya lagi. Mencoba ulang slide yang gagal juga gratis.

## Limit harian Mimo

Limit Mimo terpisah dari kredit dan hanya tersedia ketika pengguna memiliki langganan aktif:

| Pemakaian | Limit per hari |
|---|---:|
| Pesan chat Mimo | 100 |
| Intel Kompetitor (`deep_search`) | 10 |

Hari berganti pada pukul 00.00 WIB. Slot dipreservasi secara atomik lewat `reserve_sigap_daily_usage` dan tabel `sigap_daily_usage`: tugas `chat` untuk pesan dan `deep_search` untuk Intel Kompetitor. Baris `ai_generations` tetap menjadi audit log, tetapi bukan sumber kebenaran limit agar kegagalan logging tidak membuat limit terbuka. Reservasi chat dilakukan setelah validasi form dasar dan sebelum pemrosesan lampiran, pembuatan sesi, atau penyimpanan pesan. Reservasi Intel Kompetitor dilakukan tepat sebelum Apify dijalankan. Nilai dan pesan limit berada di `src/lib/chat-options.ts`.

## Cara kredit dipotong

Semua panggilan 9Router lewat `runLogged()` di `src/lib/ai.ts`:

1. Mengecek sisa kredit periode ini. Kalau kurang dari biaya permintaan, ditolak dengan `AiLimitError` sebelum 9Router dipanggil.
2. Menjalankan permintaan.
3. Mencatat satu baris di tabel `ai_generations` dengan jumlah kredit. Permintaan yang gagal dicatat dengan kredit **0**.

Sisa kredit dihitung dari `credits_used()` pada tabel itu (jumlah kredit sejak awal periode), bukan dari sebuah saldo. Penyesuaian admin di tabel `credit_adjustments` dikurangkan dari jumlah itu: angka positif mengembalikan kredit, angka negatif mengambilnya. Penyesuaian hanya bisa dibuat selama pengguna punya periode aktif dan hanya berlaku di periode tersebut. Kalau jumlahnya tidak bisa dibaca, AI diblokir, bukan dianggap 0.

## Cara mengubah

- **Jatah per periode:** ubah di `/admin/pengaturan`, atau `DEFAULT_PLAN.credits` untuk nilai bawaan. Halaman `/langganan` dan `/privasi` ikut berubah otomatis.
- **Biaya satu fitur:** ubah nilainya di `TASK_CREDITS`.
- **Biaya gambar:** ubah `IMAGE_CREDITS`. Ini memengaruhi `slide_edit` dan `contentCost`.
- **Tugas AI baru:** tambahkan ke tipe `LoggedTask` di `src/lib/ai.ts`, beri harga di `TASK_CREDITS` dan label di `src/app/(app)/(halaman)/admin/ui.ts`, lalu tambahkan ke CHECK `ai_generations.task` lewat migrasi. TypeScript hanya menolak kalau `TASK_CREDITS` terlewat; label dan CHECK harus diingat sendiri.

Setelah mengubah angka, jalankan `npm test`. `billing-options.test.ts` dan `ai.test.ts` memuat angka jatah dan biaya.

Mengubah jatah tidak mengubah baris `ai_generations` yang sudah ada. Pemakaian periode yang sedang berjalan tetap dihitung dengan kredit lama, sedangkan persentasenya memakai jatah baru.

## Menampilkan ke pengguna

- `usedPercent(used, credits)`: persentase terpakai dari jatah `credits`, dibulatkan ke bawah, dipakai bilah di sidebar.
- `formatCreditShare(credits, total)`: biaya sebagai porsi jatah `total`, misalnya "1%" atau "0,2%". Dipakai di tombol buat konten.

## Hubungan dengan biaya asli

Kredit hanya perkiraan. Biaya rupiah sebenarnya ke provider (per gambar atau per permintaan) ada di dashboard 9Router. Kalau harga model berubah, sesuaikan `TASK_CREDITS` dan `IMAGE_CREDITS`; tabel `ai_generations` menyimpan prompt dan hasil tiap permintaan sebagai bahan perbandingan.
