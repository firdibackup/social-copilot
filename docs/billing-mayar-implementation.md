# Implementasi paket dan pembayaran Mayar

## Status

Kode fondasi sudah diimplementasikan. Migrasi belum diterapkan ke Supabase dan transaksi sandbox/end-to-end belum dijalankan. Jangan mengaktifkan pembayaran produksi sebelum langkah tersebut selesai.

## Konfigurasi awal

| Paket | Harga/bulan | Kredit/bulan | Chat/hari | Riset/hari |
| --- | ---: | ---: | ---: | ---: |
| Pro | Rp139.000 | 2.500 | 100 | 5 |
| Max | Rp349.000 | 12.500 | 200 | 10 |

Durasi 1/3/6/12 bulan dengan diskon 0/5/11/17%. Kuota memakai bulan kalender, ditambatkan pada tanggal awal pembelian. Pembelian beberapa bulan tidak memberikan semua kredit di muka.

Admin → Pengaturan menyediakan:
- Tambah, edit, dan arsip paket; nama, deskripsi, harga, kuota dan batas harian.
- Diskon pilihan durasi.
- Tarif kredit setiap tugas AI dan harga gambar per slide.
- Benefit support prioritas 1-on-1 dan early access.
- URL dan jam layanan support.
- Penyimpanan berversi dengan penolakan perubahan dari tab kedaluwarsa serta audit before/after.

## Alur yang sudah terhubung

1. Pengguna memilih paket dari `/#harga` atau **Pengaturan → Paket & Kredit**. Pemilihan paket, durasi, ringkasan upgrade, dan status pembayaran memakai pop-up. Harga berasal dari katalog admin. Parameter `paket` dan `bulan` dipertahankan melalui login. `/langganan` hanya menjadi redirect kompatibilitas ke Pengaturan.
2. Server memeriksa versi katalog dan menghitung harga, tanpa mempercayai harga dari browser.
3. Salinan paket/kuota/durasi disimpan di pembayaran sebelum membuat link Mayar.
4. Reservasi checkout terkunci per pengguna melalui `prepare_billing_checkout`. Satu pembayaran tertunda dipertahankan sampai selesai/kedaluwarsa. Klaim pembuatan link memastikan hanya satu request yang memanggil Mayar; tab kedua dapat mencoba ulang setelah link pertama selesai dibuat.
5. Webhook atau worker memeriksa status dan nominal melalui API Mayar.
6. Aktivasi SQL terkunci per pengguna dan idempoten. Tagihan yang lokalnya expired tetap bisa diaktifkan setelah diverifikasi paid.
7. Worker memeriksa maksimal 20 tagihan per menit, dengan rotasi pemeriksaan dan jendela pemulihan tujuh hari. Webhook tetap dapat memulihkan tagihan yang lebih lama.
8. Kuota mengikuti snapshot pembelian atau `entitlement_plan` hasil upgrade. Snapshot tagihan tetap utuh; perubahan katalog tidak mengubah hak akses yang sudah dibeli.
9. AI mencadangkan kredit atomik sebelum meminta provider; sukses menetapkan tagihan, kegagalan mengembalikan cadangan. Audit AI tidak menghitung biaya dua kali.

Pelanggan lama yang masih mempunyai akses aktif dipindahkan ke Pro melalui `20261023080756_legacy_access_pro.sql`, termasuk periode legacy yang dibayar di muka. Masa akses dan nominal transaksi asli dipertahankan; kuota diperbarui setiap bulan berdasarkan tanggal awal akses (termasuk akun dengan akses sampai 2099). Pemakaian dalam siklus berjalan tetap dihitung. Akun kedaluwarsa tidak diaktifkan ulang, dan pembelian Pro/Max baru tidak ditimpa. Migrasi mengambil konfigurasi Pro dari katalog pada saat dijalankan. Pendaftaran baru tidak lagi mendapat trial otomatis ketika Mayar nonaktif. Akses manual admin tetap tersedia.

## Migrasi dan konfigurasi

- Migrasi: `supabase/migrations/20261023072311_billing_catalog.sql`.
- Migrasi upgrade dan checkout Pengaturan: `supabase/migrations/20261023083220_settings_billing_upgrade.sql`, setelah migrasi katalog dan legacy Pro.
- Waktu migrasi ini berasal dari CLI. Repository memiliki migrasi bertanggal masa depan hingga 25 Oktober. Jika migrasi tersebut sudah diterapkan di target, periksa daftar migrasi dan gunakan mekanisme migrasi out-of-order yang sesuai; jangan menganggap push biasa selalu menerapkan file ini.
- Terapkan migrasi sebelum merilis kode server/worker yang mengakses tabel baru.
- Konfigurasikan API key dan base URL Mayar sandbox; setelah pengujian gunakan konfigurasi produksi dan `MAYAR_ENABLED=true`.
- Webhook: `/api/webhooks/mayar`.
- Jalankan worker untuk rekonsiliasi pembayaran.
- Isi URL serta jam support dari admin sebelum menawarkan layanan kepada pelanggan.

## Verifikasi

- Unit/regression suite, TypeScript, ESLint, dan production build.
- Browser homepage: section harga desktop/seluler, perubahan harga saat memilih 3 bulan, serta redirect login yang mempertahankan pilihan Max dan durasi 3 bulan sudah diperiksa. Checkout setelah login dan transaksi Mayar masih memerlukan pengujian terautentikasi.
- `scripts/check-billing-sql.mjs` menjalankan migrasi terhadap PostgreSQL WASM/PGlite yang terisolasi: aktivasi idempoten, bulan kalender, late payment, pencadangan, pelepasan, tanpa double charge, audit versi dan hak eksekusi.
- PGlite tidak menggantikan pengujian integrasi Supabase, RLS pada deployment, konkurensi multi-koneksi, maupun pembayaran Mayar sandbox.
- Contoh menjalankan pemeriksaan SQL: `node scripts/check-billing-sql.mjs <lokasi-module-pglite>/dist/index.js`.
- `scripts/check-billing-upgrade-sql.mjs` memeriksa migrasi upgrade, reservasi checkout, aktivasi langsung, snapshot tagihan yang tetap utuh, siklus/pemakaian kredit, webhook ganda, perpanjangan, quote kedaluwarsa secara data, konflik pembayaran terlambat, dan hak eksekusi.
- `scripts/check-coupon-sql.mjs` memeriksa kupon: rebutan kuota terakhir, pakai ulang tautan yang sama, tautan kedaluwarsa mengembalikan kuota, sekali per akun, kupon 100% langsung aktif tanpa Mayar, total 0 palsu ditolak, kupon diubah/nonaktif/kedaluwarsa, batas paket/durasi, upgrade, larangan hapus kupon terpakai, dan hak eksekusi.

## Upgrade langsung

- Kuota naik ke paket tujuan tanpa menghapus pemakaian siklus berjalan. Tanggal akhir langganan tetap.
- Biaya: selisih harga bulanan snapshot paket efektif dengan paket tujuan, dikalikan sisa fraksi bulan kalender dan diskon pembelian semula. Semua periode prabayar mendatang yang tercantum pada quote ikut dinaikkan.
- Ringkasan server ditandatangani HMAC, terikat pengguna, dan berlaku 10 menit. Link upgrade berlaku maksimal satu jam atau sampai akhir masa aktif, mana yang lebih awal. Biaya minimum Rp1.000.
- SQL memeriksa ulang periode dan paket asal di bawah advisory lock. Upgrade yang sudah dibayar tetapi bertabrakan dengan perubahan paket dicatat sebagai `paid` dengan `fulfillment_error`, ditampilkan ke pengguna untuk penyelesaian tim; tidak diterapkan dua kali.
- Status sukses ditentukan oleh pesanan yang sudah diverifikasi, bukan sekadar parameter `bayar=selesai` atau adanya paket aktif.
- Pengaturan tetap dapat dibuka oleh akun tanpa langganan atau belum onboarding; fitur berbayar tetap memakai gate server. Pemutusan koneksi tersedia saat masa aktif habis.

## Pekerjaan rencana yang belum selesai

- Riset Threads. Kuota paket sudah tersedia, tetapi provider riset saat ini masih Instagram. Kartu harga sengaja menyebut Instagram sampai integrasi Threads diuji.
- Deduplikasi permintaan riset. Jatah riset gagal sudah dikembalikan.
- Pengingat H-7/H-3, refund pembayaran, penandaan pembayaran nominal tidak cocok dan dashboard rekonsiliasi admin.
- Bonus kredit dengan tanggal kedaluwarsa, pengecualian kuota per pelanggan, dan pemberian paket Pro/Max manual. Penyesuaian kredit periode berjalan yang sudah ada tetap tersedia.
- Akses baca/unduh setelah langganan habis; gate aplikasi lama masih membutuhkan langganan aktif.
- Early-access rollout per fitur. Flag benefit per paket tersimpan, tetapi belum ada registry fitur beta atau pemeriksaan fitur beta di server.
- Reservasi yang terhenti karena proses mati tetap menahan kredit. Perlu rekonsiliasi terhadap hasil pekerjaan sebelum melepasnya; jangan melepas hanya berdasarkan umur karena pekerjaan bisa sudah menghasilkan output.
- Biaya seluruh pekerjaan antrean belum dikunci saat enqueue; tarif dikunci pada awal setiap panggilan AI saat worker mengeksekusinya.
- Pengujian browser terautentikasi, Supabase target, dan Mayar sandbox.
