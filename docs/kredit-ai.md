# Panduan Kredit AI

Kredit adalah satuan internal Social Copilot untuk membatasi pemakaian AI per periode langganan. Kredit **bukan token** dari 9Router atau provider: angkanya kita tentukan sendiri, dan tidak dihitung dari token yang dipakai model. Semua angka ada di satu file, `src/lib/billing-options.ts`.

## Jatah

| Nama | Nilai | Arti |
|---|---|---|
| `PLAN.credits` | 10.000 | Jatah AI satu periode (30 hari). 10.000 kredit = 100%. |

Sisa kuota tidak terbawa ke periode berikutnya. Periode dimulai dan berakhir bersama pembayaran di tabel `payments` (lihat bagian Langganan di `CLAUDE.md`).

## Biaya per permintaan

| Tugas (`LoggedTask`) | Kredit | Porsi jatah | Kapan dipakai |
|---|---|---|---|
| `content` | 3 | 0,03% | Caption dan rencana slide untuk konten baru |
| `content_slide` | 0 | 0% | Membuat gambar tiap slide. Sudah dibayar di muka lewat `contentCost` |
| `slide_edit` | 20 | 0,2% | Merevisi atau menggambar ulang satu slide |
| `caption_edit` | 2 | 0,02% | Menulis ulang caption |
| `content_ideas` | 2 | 0,02% | Tombol "Cari ide" (tidak ditampilkan di UI) |
| `brand_profile` | 5 | 0,05% | Mengisi brand kit dari website atau akun |
| `brand_visual` | 10 | 0,1% | Analisis gaya visual dari referensi |

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

## Cara kredit dipotong

Semua panggilan 9Router lewat `runLogged()` di `src/lib/ai.ts`:

1. Mengecek sisa kredit periode ini. Kalau kurang dari biaya permintaan, ditolak dengan `AiLimitError` sebelum 9Router dipanggil.
2. Menjalankan permintaan.
3. Mencatat satu baris di tabel `ai_generations` dengan jumlah kredit. Permintaan yang gagal dicatat dengan kredit **0**.

Sisa kredit dihitung dari `credits_used()` pada tabel itu (jumlah kredit sejak awal periode), bukan dari sebuah saldo. Kalau jumlahnya tidak bisa dibaca, AI diblokir, bukan dianggap 0.

## Cara mengubah

- **Jatah per periode:** ubah `PLAN.credits`. Halaman `/langganan` dan `/privasi` ikut berubah otomatis.
- **Biaya satu fitur:** ubah nilainya di `TASK_CREDITS`.
- **Biaya gambar:** ubah `IMAGE_CREDITS`. Ini memengaruhi `slide_edit` dan `contentCost`.
- **Tugas AI baru:** tambahkan ke tipe `LoggedTask` di `src/lib/ai.ts` dan beri harga di `TASK_CREDITS`. TypeScript akan menolak kalau salah satunya terlewat.

Setelah mengubah angka, jalankan `npm test`. `billing-options.test.ts` dan `ai.test.ts` memuat angka jatah dan biaya.

Mengubah `PLAN.credits` tidak mengubah baris `ai_generations` yang sudah ada. Pemakaian periode yang sedang berjalan tetap dihitung dengan kredit lama, sedangkan persentasenya memakai jatah baru.

## Menampilkan ke pengguna

- `usedPercent(used)`: persentase terpakai, dibulatkan ke bawah, dipakai bilah di sidebar.
- `formatCreditShare(credits)`: biaya sebagai porsi jatah, misalnya "1%" atau "0,2%". Dipakai di tombol buat konten.

## Hubungan dengan biaya asli

Kredit hanya perkiraan. Biaya rupiah sebenarnya ke provider (per gambar atau per permintaan) ada di dashboard 9Router. Kalau harga model berubah, sesuaikan `TASK_CREDITS` dan `IMAGE_CREDITS`; tabel `ai_generations` menyimpan prompt dan hasil tiap permintaan sebagai bahan perbandingan.
