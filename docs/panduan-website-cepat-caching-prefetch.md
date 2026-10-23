# Panduan Website Cepat: Caching, Prefetch, dan Loading Bertahap

Panduan ini bisa dipakai ulang untuk membangun website yang terasa cepat saat berpindah menu dan membuka kembali data yang sebelumnya sudah dilihat.

Contoh implementasi mengacu pada Social Copilot, yang menggunakan Next.js 16.4 dan TanStack Query 5. Konfigurasi perlu disesuaikan dengan versi framework pada proyek berikutnya.

## 1. Gambaran sederhana

Website yang cepat tidak harus mengambil ulang semua tampilan dan data setiap kali pengguna mengeklik sesuatu.

Ada tiga prinsip utama:

1. **Siapkan sebelum dibutuhkan.** Halaman tujuan mulai disiapkan sebelum pengguna mengeklik menu.
2. **Gunakan kembali yang masih relevan.** Tampilan dan data yang sudah dimuat dapat digunakan kembali.
3. **Tampilkan secara bertahap.** Jangan membuat seluruh layar menunggu satu bagian yang masih mengambil data.

Hasil yang diharapkan:

- Perpindahan menu terasa cepat.
- Sidebar dan header tidak berkedip atau dimuat ulang.
- Membuka kembali data yang sama tidak selalu membutuhkan loading baru.
- Pengguna tetap melihat respons ketika proses belum selesai.
- Perubahan data tetap muncul dengan benar.

> Optimasi ini terutama membantu tampilan dan navigasi. Proses berat seperti membuat gambar AI atau menjalankan riset tetap membutuhkan waktu tersendiri.

## 2. Fitur yang digunakan

### A. Prefetch: menyiapkan halaman sebelum diklik

**Cara kerja sederhana:** saat menu terlihat di layar, website mulai menyiapkan sebagian kebutuhan halaman tujuan. Ketika menu diklik, sebagian pekerjaan sudah selesai.

**Cocok untuk:**

- Menu sidebar dan navigasi utama di HP.
- Halaman yang sering dikunjungi.
- Detail item yang kemungkinan akan dibuka.

**Contoh:** pengguna sedang membuka Kalender. Website sudah menyiapkan bagian awal halaman Buat dan SIGAP.

**Catatan penerapan:**

- Tidak semua data perlu diambil sebelum diklik.
- Untuk daftar panjang, persiapan data dapat dilakukan saat kursor diarahkan ke item atau item mendapat fokus keyboard.
- Hindari mengambil detail ratusan item sekaligus.
- Prefetch otomatis Next.js perlu diuji pada versi production; perilakunya berbeda dari mode development.

### B. Cache Components: menyiapkan bagian dasar tampilan

**Cara kerja sederhana:** bagian tampilan yang bisa disiapkan lebih awal dipisahkan dari bagian yang membutuhkan data terbaru. Kerangka halaman dapat muncul lebih cepat, sementara bagian dinamis menyusul.

**Contoh:** tampilan dasar aplikasi dan bentuk loading sudah tersedia. Daftar percakapan dimuat setelah identitas pengguna diperiksa.

Teknologi pada proyek referensi:

- **Cache Components:** kemampuan Next.js untuk mengatur bagian yang dapat disiapkan atau disimpan ulang.
- **Partial Prerendering:** menyiapkan bagian statis halaman lebih dahulu, lalu mengirim bagian dinamis ketika siap.
- **Partial Prefetching:** menyiapkan bagian awal halaman tujuan sebelum navigasi.

Konfigurasi yang digunakan pada Next.js 16.4 di proyek referensi:

```ts
const nextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
}

export default nextConfig
```

> Mengaktifkan Cache Components tidak otomatis menyimpan semua hasil database. Penyimpanan data tetap harus dirancang sesuai kebutuhan.

Jangan langsung menyalin konfigurasi ini ke semua versi Next.js. Periksa dokumentasi versi yang benar-benar terpasang.

### C. Shared layout: kerangka aplikasi tetap terpasang

**Cara kerja sederhana:** sidebar, header, dan bagian umum lainnya dipakai bersama oleh banyak halaman. Saat berpindah menu, hanya isi halaman yang perlu diganti.

**Cocok untuk:** dashboard, aplikasi admin, aplikasi dengan banyak menu, serta workspace dengan daftar di kiri dan detail di kanan.

**Contoh:** saat pindah dari Kalender ke SIGAP, sidebar tetap terlihat. Website tidak memuat ulang seluruh layar.

**Prinsip penerapan:**

- Letakkan kerangka bersama pada layout.
- Gunakan navigasi internal framework.
- Hindari reload penuh untuk perpindahan menu biasa.
- Untuk halaman daftar-detail, pertahankan daftar saat detail yang dipilih berubah.

Layout tetap terpasang bukan berarti setiap komponennya tidak pernah diperbarui. Misalnya, penanda menu aktif tetap berubah mengikuti halaman yang dibuka.

### D. Suspense dan skeleton: loading bertahap

**Cara kerja sederhana:** bagian yang sudah siap ditampilkan terlebih dahulu. Bagian yang belum siap menampilkan placeholder atau skeleton, yaitu bentuk sementara yang menyerupai isi halaman.

**Cocok untuk:** daftar konten, riwayat chat, statistik, informasi akun, dan detail editor.

**Contoh:** header dan sidebar tampil lebih dahulu. Area percakapan menampilkan skeleton sampai pesan selesai diambil.

**Prinsip penerapan:**

- Bentuk loading sebaiknya menyerupai isi sebenarnya.
- Pisahkan bagian yang bisa dimuat secara mandiri.
- Hindari membuat seluruh halaman menunggu satu data yang lambat.
- Sediakan pesan gagal dan cara mencoba lagi.

> Skeleton memperjelas respons aplikasi, tetapi tidak dengan sendirinya mempercepat database atau jaringan.

### E. TanStack Query: menyimpan data sementara di browser

**Cara kerja sederhana:** data yang sudah diambil disimpan sementara agar dapat digunakan kembali ketika pengguna membukanya lagi.

**Cocok untuk:** detail draft, riwayat percakapan, detail pelanggan, daftar produk, dan data pendukung editor.

**Contoh:** pengguna membuka draft A, pindah ke draft B, lalu kembali ke A. Data A dapat langsung ditampilkan dari cache jika masih tersedia.

#### Dua pengaturan penting

| Pengaturan | Arti sederhana |
|---|---|
| `staleTime` | Berapa lama data dianggap masih segar. |
| `gcTime` | Berapa lama data yang tidak sedang digunakan boleh bertahan di cache sebelum dibersihkan. |

Data yang melewati `staleTime` tidak langsung hilang dan tidak otomatis diambil ulang tepat saat waktunya habis. Data tersebut dianggap perlu diperbarui dan dapat diambil ulang ketika ada pemicu, misalnya dibuka kembali atau jendela browser kembali aktif, sesuai pengaturan.

#### Contoh pada proyek referensi

| Jenis data | Dianggap segar | Disimpan setelah tidak digunakan |
|---|---:|---:|
| Detail draft | 30 detik | 5 menit |
| Data pendukung editor | 5 menit | 10 menit |

Angka tersebut merupakan titik awal, bukan aturan untuk semua website.

**Prinsip penerapan:**

- Data yang sering berubah memakai masa segar lebih pendek.
- Data yang jarang berubah bisa memakai masa segar lebih panjang.
- Cache harus dibedakan berdasarkan pengguna dan workspace atau akun aktif.
- Identitas cache juga harus mencakup item, filter, atau parameter yang memengaruhi hasilnya.
- Pengelola cache harus tetap tersedia selama alur navigasi yang ingin dipercepat.
- Cache memori ini tidak otomatis bertahan setelah reload atau browser ditutup.

### F. Invalidation: memperbarui cache setelah data berubah

Cache harus diperbarui agar website tidak terus menampilkan informasi lama.

**Contoh kejadian yang memerlukan pembaruan:**

- Draft disimpan atau dihapus.
- Pesan baru masuk.
- Judul percakapan diganti.
- Status konten berubah.
- Pengguna berpindah akun.

**Pilihan tindakan:**

1. Perbarui isi cache langsung dari hasil penyimpanan.
2. Tandai data terkait sebagai perlu diambil ulang.
3. Hapus cache ketika sesi pengguna berakhir atau ruang kerja berubah.

**Contoh:** setelah draft dihapus, draft tersebut langsung hilang dari daftar dan tidak muncul kembali saat pengguna berpindah menu.

> Memuat ulang data halaman di server belum tentu otomatis memperbarui cache TanStack Query. Keduanya perlu dihubungkan dengan sengaja.

### G. Cache aset: memakai ulang file pendukung

Selain data, browser dapat memakai ulang JavaScript, CSS, font, dan gambar.

**Prinsip penerapan:**

- Gunakan pengelolaan font dan optimasi gambar yang sesuai.
- Kirim ukuran gambar sesuai kebutuhan tampilan.
- Gunakan penamaan file berversi atau hash agar pembaruan tidak tertahan cache lama.
- Periksa pengaturan hosting dan CDN, yaitu layanan distribusi file agar lebih dekat dengan pengguna.

Cache aset berbeda dari cache data pengguna. Keduanya perlu diperiksa secara terpisah.

## 3. Lapisan cache yang perlu dibedakan

| Lapisan | Yang disimpan | Manfaat |
|---|---|---|
| Cache aset browser | Gambar, font, CSS, JavaScript | Mengurangi unduhan berulang. |
| Cache navigasi framework | Bagian halaman yang sudah disiapkan | Mempercepat perpindahan menu. |
| Cache data browser | Hasil pengambilan data, misalnya detail draft | Mempercepat pembukaan ulang data. |
| Cache server | Hasil pekerjaan server yang memang aman dipakai ulang | Mengurangi pekerjaan berulang di server. |

Tidak semua proyek harus memakai seluruh lapisan sekaligus. Data pribadi tidak boleh dimasukkan ke cache bersama yang bisa dipakai pengguna lain tanpa pemisahan akses yang benar.

### Pembukaan pertama dan pembukaan ulang

- **Pembukaan pertama:** cache browser mungkin masih kosong. Kecepatannya bergantung pada ukuran file, respons server, gambar, dan cara halaman ditampilkan bertahap.
- **Pindah menu:** terbantu oleh prefetch, cache navigasi, dan layout bersama.
- **Membuka kembali item:** terbantu oleh cache data yang masih tersedia.

Karena itu, keberhasilan cache tidak berarti semua kunjungan pertama langsung instan.

## 4. Urutan penerapan pada website baru

### Tahap 1 — Bangun navigasi yang ringan

- Gunakan layout bersama.
- Gunakan link navigasi bawaan framework.
- Pastikan perpindahan menu tidak melakukan reload penuh.
- Siapkan tampilan loading yang sesuai.

### Tahap 2 — Siapkan halaman lebih awal

- Aktifkan kemampuan prefetch yang sesuai.
- Untuk Next.js yang mendukungnya, evaluasi Cache Components dan Partial Prefetching.
- Pisahkan kerangka halaman dari data yang harus selalu terbaru.

### Tahap 3 — Tambahkan cache data

- Pilih alur yang paling sering digunakan.
- Tambahkan TanStack Query atau solusi sejenis yang sudah dipakai proyek.
- Tentukan masa segar per jenis data.
- Tambahkan persiapan detail saat hover atau fokus bila bermanfaat.

### Tahap 4 — Pastikan pembaruan tetap benar

- Perbarui cache setelah simpan, hapus, atau perubahan status.
- Pisahkan cache antar-pengguna dan antar-akun.
- Bersihkan cache terkait ketika logout.

### Tahap 5 — Ukur hasilnya

- Uji versi production.
- Bandingkan pembukaan pertama dengan pembukaan ulang.
- Periksa permintaan data yang berulang.
- Pastikan pengurangan loading tidak membuat data menjadi kedaluwarsa.

## 5. Status pada proyek Social Copilot

Status berikut berdasarkan kode lokal yang diperiksa pada 23 Oktober 2026. Ini bukan verifikasi versi yang sedang tayang.

| Fitur | Status |
|---|---|
| Cache Components | Sudah aktif. |
| Partial Prefetching | Sudah aktif. |
| Prefetch menu utama desktop dan HP | Sudah diterapkan. |
| Layout aplikasi bersama | Sudah diterapkan. |
| Loading bertahap | Sudah digunakan, termasuk di SIGAP. |
| TanStack Query untuk editor Buat | Sudah diterapkan. |
| Persiapan detail draft saat hover/fokus | Sudah diterapkan. |
| Cache data khusus riwayat dan pesan SIGAP | Sudah diterapkan menggunakan TanStack Query. |
| Persiapan isi percakapan saat hover/fokus | Sudah diterapkan, dengan jeda singkat dan pembatasan pengambilan bersamaan. |
| Endpoint `/api/version` dari usulan awal | Belum ditemukan pada kode yang diperiksa. |

### Penjelasan khusus SIGAP

SIGAP menggunakan cache terpisah untuk daftar percakapan, isi setiap percakapan, dan data pendukung seperti pilihan produk serta kepadatan teks.

- Daftar dan isi percakapan dianggap segar selama **30 detik**, dengan masa simpan **5 menit setelah tidak digunakan**.
- Data pendukung dianggap segar selama **5 menit**, dengan masa simpan **10 menit setelah tidak digunakan**.
- Berpindah percakapan memperbarui pilihan pada URL tanpa perlu merender ulang seluruh halaman di server. Tombol kembali/maju browser tetap bisa digunakan.
- Isi percakapan mulai disiapkan saat hover atau fokus keyboard selama 100 milidetik. Cache mencegah pengambilan ulang jika data masih segar.
- Pesan yang selesai disimpan memperbarui cache percakapan asal, termasuk ketika pengguna sudah memilih percakapan lain.
- Penghapusan percakapan membersihkan pesan dari cache dan menghapus item dari daftar. Jawaban yang datang terlambat tidak boleh memunculkannya kembali.
- Pembaruan halaman dari tindakan kartu juga menandai cache untuk diperbarui.
- Cache dipisahkan berdasarkan pengguna dan akun aktif. Endpoint pembacaan tetap memeriksa akses pengguna dan tidak memakai cache HTTP publik.

Verifikasi: pemeriksaan tipe, lint bagian SIGAP, 39 tes terkait SIGAP, dan build production berhasil. Pengujian browser hanya sampai halaman login karena tidak tersedia sesi akun; waktu perpindahan chat pada akun yang sudah login belum diukur.

### Perbedaan dengan catatan analisis Bleam

Dokumen `analisis-arsitektur-bleam.md` menjadi referensi awal, bukan daftar konfigurasi yang semuanya sudah diterapkan.

- Proyek ini memakai Cache Components dan Partial Prefetching.
- Proyek ini tidak mengatur semua data agar segar selama 5 menit.
- Cache detail draft dan data pendukung editor memiliki durasi berbeda.
- Cache data khusus SIGAP ditambahkan setelah pemeriksaan awal.
- Pengamatan dari website lain tidak memastikan seluruh detail implementasi internalnya.

### File referensi implementasi

- `next.config.ts`
- `src/app/(app)/layout.tsx`
- `src/components/sidebar.tsx`
- `src/components/mobile-nav.tsx`
- `src/app/(app)/buat/layout.tsx`
- `src/app/(app)/buat/editor-provider.tsx`
- `src/app/(app)/buat/editor-query.ts`
- `src/app/(app)/buat/content-list.tsx`
- `src/app/(app)/sigap/page.tsx`
- `src/app/(app)/sigap/layout.tsx`
- `src/app/(app)/sigap/sigap-provider.tsx`
- `src/app/(app)/sigap/sigap-query.ts`
- `src/app/(app)/sigap/sigap-workspace.tsx`
- `src/app/(app)/sigap/conversation-link.tsx`
- `src/app/api/sigap/workspace/route.ts`
- `src/lib/sigap-data.ts`

## 6. Checklist keberhasilan

### Pengalaman pengguna

- [ ] Perpindahan menu tidak memuat ulang seluruh layar.
- [ ] Sidebar dan header tetap stabil.
- [ ] Loading langsung memberi respons visual.
- [ ] Membuka kembali data terasa lebih cepat.
- [ ] Setelah menyimpan atau menghapus, hasilnya langsung terlihat.
- [ ] Ada pesan gagal dan cara mencoba lagi.

### Ketepatan data

- [ ] Cache dipisahkan berdasarkan pengguna dan akun/workspace.
- [ ] Data yang berubah diperbarui pada cache terkait.
- [ ] Logout tidak menyisakan data pribadi untuk pengguna berikutnya.
- [ ] Data lama tidak menimpa hasil perubahan terbaru.

### Verifikasi performa

- [ ] Pengujian dilakukan pada versi production.
- [ ] Pembukaan pertama dan perpindahan berikutnya diukur terpisah.
- [ ] Prefetch tidak mengambil terlalu banyak data.
- [ ] Tidak ada permintaan ulang yang tidak diperlukan.
- [ ] Tampilan cepat tetap diikuti isi yang benar dan terbaru.

## 7. Prompt siap pakai untuk AI coding

Salin prompt berikut ketika membangun atau meningkatkan website lain:

```text
Saya ingin website ini terasa cepat ketika berpindah menu dan membuka kembali data.

Periksa framework, versi terpasang, struktur halaman, dan cara pengambilan data saat ini.
Gunakan dokumentasi yang sesuai dengan versi proyek.

Terapkan optimasi sesuai kebutuhan:

1. Layout bersama agar sidebar dan header tetap terpasang.
2. Navigasi internal tanpa reload penuh.
3. Prefetch untuk menu utama dan detail yang kemungkinan akan dibuka.
4. Cache Components dan Partial Prefetching jika didukung versi Next.js proyek.
5. Loading bertahap dengan batas Suspense dan skeleton yang sesuai.
6. Cache data browser menggunakan TanStack Query atau solusi yang sudah digunakan proyek.
7. Masa segar cache yang berbeda sesuai frekuensi perubahan data.
8. Pembaruan cache setelah simpan, hapus, pesan baru, dan perubahan status.
9. Pemisahan cache per pengguna dan akun/workspace, termasuk pembersihan saat logout.
10. Optimasi gambar, font, dan cache aset.

Jangan menganggap mengaktifkan cache framework otomatis menyimpan seluruh data database.

Jangan menyalin pengaturan staleTimes atau konfigurasi cache dari versi framework lain
tanpa memeriksa kompatibilitasnya.

Verifikasi pada versi production: pembukaan pertama, pindah menu, kembali ke data yang sama,
perubahan data, dan pergantian akun.

Jelaskan apa yang sudah diterapkan, hasil verifikasinya, serta bagian yang masih perlu
ditingkatkan dengan bahasa sederhana. Jangan menyatakan peningkatan kecepatan tertentu
tanpa hasil pengukuran.
```

## 8. Ringkasan

**Resep utamanya:** siapkan halaman sebelum diklik, pertahankan kerangka aplikasi, gunakan ulang data yang masih relevan, tampilkan loading secara bertahap, dan perbarui cache ketika data berubah.

Website yang baik harus terasa cepat sekaligus menampilkan data yang benar.
