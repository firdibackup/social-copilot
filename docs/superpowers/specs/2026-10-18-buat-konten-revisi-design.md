# Revisi Buat Konten: layout bertumpuk, teks lengkap, lampiran gambar, label Umum, contoh desain

Status: disetujui owner di chat 2026-10-18 ("iya benar, coba kamu jalankan"). Review spec dan rencana tertulis dilewati
atas permintaan owner; keputusan yang tersisa ditanyakan sekali (lampiran: edit slide dan konten baru).

## Masalah (kata owner)

1. Cover dengan teks di kolom kiri dan foto di kolom kanan terpotong di Instagram. Pakai susunan baris (atas-bawah).
2. Teks carousel sering disingkat, jadi kurang insightful. Yang penting audiens paham; di slide isi footage produk
   malah paling besar.
3. Hasil AI di Aset jangan jadi patokan desain; fokus ke referensi desain brand dari Instagram. Tombol Aktif/Dijeda
   di Hasil AI dimatikan.
4. Kolom AI di `/buat`: tombol di kolom teks harus jadi lampiran gambar untuk permintaan AI (desain slide atau
   referensi, tergantung yang ditulis). Shift+Enter terasa mengirim; kolomnya harus seperti editor teks. Menambah
   foto ke post langsung di mockup Instagram (kartu "Tambah foto").
5. Referensi desain diberi label pilihan: cover, isi, CTA, umum.
6. Desain default perlu arahan: owner memberi contoh desain untuk dipelajari.

## Penyebab yang ditemukan di kode

- Resep gaya menyuruh tata letak berdampingan (Profesional cover "headline on the left half … photo on the right",
  Bold isi, Elegan isi, Editorial isi "two-column grid").
- `parseSlides` memotong headline di 150 karakter tanpa peduli kata (`truncate`), dan panduan carousel membatasi isi
  ke "1–3 kalimat pendek". Prompt gambar tidak melarang model menyingkat dan tidak memberi teks porsi ruang.
- Hasil AI dipakai sebagai patokan hanya lewat `siblingImage`: slide isi pertama yang jadi dikirim ke slide isi
  berikutnya, juga saat slide itu sudah punya referensi brand. Tombol Aktif/Dijeda di Hasil AI tidak berpengaruh
  apa pun, jadi menyesatkan. Foto Hasil AI yang dipindah ke grup produk ikut terkirim sebagai foto produk.
- Composer: Enter mengirim, Shift+Enter baris baru, `+` membuka pemilih foto post.
- Referensi satu gambar berlabel `single` ("Tunggal") dan tidak bisa diganti labelnya; pilihan label hanya muncul untuk
  carousel.

## Keputusan

### 1. Layout bertumpuk (prompt gambar)

- Aturan layout di setiap prompt, apa pun referensi atau gayanya: teks dan gambar disusun dalam pita horizontal
  selebar frame, atas-bawah; teks tidak pernah di kolom di samping foto atau kartu, walaupun referensi atau contoh
  melakukannya. Semua foto, kartu, panel, dan teks utuh di dalam frame dengan margin; tidak ada yang terpotong di
  tepi, kecuali foto latar yang memenuhi frame.
- Batas foto dan teks mengikuti referensi atau contoh. Aturan gradasi halus dihapus (2026-10-18) karena menimpa
  batas tegas di referensi. Teks tetap di area polos atau panel solid, tanpa bayangan tebal di huruf
  (`TYPOGRAPHY_RULES`).
- Resep gaya yang berdampingan ditulis ulang menjadi bertumpuk.

### 2. Teks lengkap

- `HEADLINE_MAX_LENGTH` 150 → 300 (cek di `post_slides.headline` ikut).
- Aturan slide: tulis kata dan kalimat lengkap, tanpa singkatan ("yg", "dgn", "utk", "krn", "tdk", "&"), tanpa
  kalimat terpotong. Slide isi: subjudul lalu 2–3 kalimat lengkap atau 3–5 poin, sampai pembaca paham. Hook cover
  tetap 3–7 kata.
- Teks yang melebihi batas dipotong di akhir baris atau kalimat terakhir yang muat, kalau tidak ada di spasi
  terakhir; tidak pernah di tengah kata.
- Prompt gambar: setiap kata tampil utuh dan persis; jangan menyingkat, meringkas, atau menghilangkan kata. Kalau
  ruang sempit, foto atau grafik yang mengecil, bukan teks. Di slide isi, teks elemen utama dan mengambil porsi
  terbesar; foto atau produk lebih kecil dan mendukung.

### 3. Hasil AI bukan patokan desain

- Slide isi hanya meniru slide isi pertama (`siblingImage`) kalau slide itu tidak punya referensi brand maupun contoh
  gaya.
- Tombol Aktif/Dijeda dan pindah grup disembunyikan untuk foto Hasil AI (`origin = 'ai'`), dan foto Hasil AI tidak
  pernah dikirim sebagai foto produk (`listProductGroups`, `loadProductImages`). Tombol di Milik saya tetap: foto
  website yang dihapus masuk lagi saat website dibaca ulang, jadi jeda satu-satunya cara menyingkirkannya dari AI.

### 4. Composer dan mockup

- Composer seperti editor teks: Enter membuat baris baru, Ctrl/⌘+Enter atau tombol kirim mengirim. Tinggi kolom
  mengikuti isi lewat JavaScript (bukan hanya `field-sizing`, yang belum didukung semua browser).
- `+` melampirkan satu gambar ke permintaan AI; menempel (paste) screenshot juga bisa. Gambar tampil sebagai
  thumbnail dengan tombol hapus. Lampiran dipakai untuk edit slide dan untuk konten baru, tidak untuk edit caption
  (tombol dan thumbnail disembunyikan selama target Caption, lampirannya tetap tersimpan di composer).
- Browser mengecilkan gambar ke JPEG (`toReferenceJpeg`), server mengodekan ulang ke JPEG 640 px
  (`toReferenceDataUrl`), yang sekaligus membuktikan isinya gambar.
- **Edit slide:** gambar dikirim ke AI gambar dengan instruksi owner sebagai catatannya, dan ke AI penulis
  (`reviseSlide`, vision) supaya scene-nya merujuk ke gambar itu. Tidak disimpan.
- **Konten baru:** AI perencana (vision) melihat gambar dan topiknya, lalu menulis untuk setiap slide instruksi
  singkat berbahasa Inggris cara memakai gambar itu di slide tersebut, atau kosong kalau tidak dipakai. Kalau semua
  kosong, semua slide memakainya sebagai referensi desain. Gambar disimpan di bucket `brand` di
  `<userId>/lampiran/<uuid>.jpg`, dan slide yang memakainya menyimpan path dan instruksinya
  (`post_slides.attachment_path`, `attachment_note`), sehingga Coba lagi tetap memakainya.
- Lampiran di prompt gambar: "gambar yang dilampirkan owner, dengan instruksi ini untuk slide ini: …; kalau
  bertentangan dengan gambar lain atau layout di bawah, instruksi menang." Urutan gambar input: slide ini (saat
  edit), lampiran, produk, referensi atau contoh, slide isi lain, logo.
- Menambah foto ke post pindah ke mockup: kartu "Tambah foto · n/10 slide" setelah slide terakhir dan tile `+` di
  strip slide, keduanya membuka pemilih foto. Post baru tanpa foto: petunjuk topik ditambah tombol "Pakai foto
  sendiri".

### 5. Label referensi: Cover, Isi, CTA, Umum

- Nilai `single` tetap di database, namanya menjadi **Umum**: referensi gaya untuk slide mana pun. Label custom tidak
  dibuat; AI memilih referensi per peran slide, jadi label bebas tidak akan terpilih. Instruksi bebas tetap lewat
  catatan referensi.
- Pilihan label muncul juga untuk referensi satu gambar. Unggahan dan post satu gambar defaultnya Umum.
- `planReferenceImages`: setiap peran memakai gambar labelnya sendiri, kalau tidak ada memakai satu gambar Umum yang
  sama untuk semua peran yang kosong. Cover tetap tidak pernah dipinjamkan.
- Prompt: gambar Umum di cover atau post satu gambar diikuti gaya, komposisi, dan suasananya; di slide isi dan CTA
  hanya warna, rasa huruf, dan suasananya, dengan layout peran slide itu sendiri (resep gaya tetap dipakai).

### 6. Contoh desain default

- Contoh dari owner dipotong per desain dan disimpan sebagai JPEG kecil di `assets/contoh-desain/<kunci>.jpg`
  (bukan `public/`: desain brand lain tidak ikut tersaji). Di `DESIGN_STYLES`, setiap gaya punya daftar **set**
  contoh `{cover?, isi?, cta?}`; satu set dipakai untuk satu post supaya slide-slidenya satu keluarga.
- Dipakai hanya kalau akun **tidak punya referensi desain sama sekali** dan pilihan Referensi Otomatis. Editor kini
  selalu mengirim Otomatis sebagai default, juga saat dropdown Referensi tidak tampil. Tanpa = tanpa referensi dan
  tanpa contoh. Referensi grup tertentu = hanya grup itu.
- Set dipilih acak saat post dibuat; kunci contoh disimpan per slide (`post_slides.example`), sehingga Coba lagi dan
  edit memakai contoh yang sama. Post satu gambar memakai contoh cover set itu.
- Gaya ditentukan seperti sebelumnya (`styleForBrand`): gaya pilihan owner; tanpa pilihan dan tanpa gaya visual dari
  post, Minimalis Modern; tanpa pilihan tapi ada gaya visual dari post, tidak ada gaya dan tidak ada contoh.
- Prompt contoh: "contoh slide <peran> dalam gaya desain ini: ikuti layout-nya (posisi teks, ukuran dan hierarki,
  panel, kartu, elemen grafis, komposisi). Milik brand lain: jangan salin kata, logo, nama brand, orang, atau
  produknya", ditambah "pakai warna brand di bawah, bukan warnanya" kalau brand punya warna. Contoh dihitung sebagai
  layout milik slide itu, jadi resep layout teks gaya tidak ditambahkan.
- Bukan training atau fine-tuning (model 9Router tidak bisa dilatih dari sini); ini pengambilan contoh per peran yang
  dikirim bersama prompt, sama dengan mekanisme referensi brand.

Pemetaan contoh (keputusan saya, owner bisa minta ubah):

| Gaya | Set contoh (cover / isi / CTA) |
|------|--------------------------------|
| Minimalis Modern | terang-laptop / daftar-layanan; terang-astronot / daftar-layanan |
| Bold Kreatif | bento-produk / langkah-bernomor / gelap-cta; gelap-orang / langkah-bernomor / gelap-cta |
| Elegan Premium | – / foto-kartu-teks / – |
| Ceria & Playful | tipografi-ilustrasi / – / – |
| Editorial Majalah | foto-penuh-judul-bawah / berita-foto-atas; foto-potret-kartu / berita-foto-atas |
| Profesional Korporat | grafik-pertanyaan / testimoni / cta-avatar; lingkaran-pertanyaan / tim-kartu / cta-avatar |
| Natural & Organik | (tidak ada; resep teks saja) |
| Tech Modern | gelap-objek-3d / kartu-aplikasi / gelap-cta; gelap-perangkat / langkah-bernomor / gelap-cta; gelap-megafon / langkah-bernomor / gelap-cta |

Sumber: PUTAR (bento-produk, langkah-bernomor, foto-penuh-judul-bawah), satuin (foto-potret-kartu, kartu-aplikasi),
Sisi Sore (tipografi-ilustrasi), grid NEXORA (gelap-*, terang-*), grid elevare (testimoni, grafik-pertanyaan,
lingkaran-pertanyaan, berita-foto-atas, cta-avatar), grid Nürnberg (tim-kartu, foto-kartu-teks, daftar-layanan).
Desain dengan teks di kolom samping foto tidak dipakai.

## Data

Migrasi `20261019010000_konten_lampiran.sql`:

- `post_slides.headline` maksimal 300 karakter.
- Kolom baru `post_slides`: `example` (kunci contoh, `^[a-z0-9-]{1,60}$`), `attachment_path` (format
  `<uuid>/lampiran/<uuid>.jpg`), `attachment_note` (≤ 300 karakter, default kosong).
- `create_content` membaca ketiganya per slide dan menolak path lampiran milik user lain (`invalid_attachment`).
- `replace_slide` mendapat `p_example`, supaya edit berikutnya tetap memakai contoh yang sama.

File lampiran tetap ada setelah slide-nya jadi atau post-nya dihapus (bersih saat user dihapus Admin, yang
menghapus `<userId>/` di semua bucket).

## Test

- `planStyleExamples`: satu set per post, peran tanpa contoh kosong, post satu gambar memakai cover; setiap kunci
  contoh punya file.
- `planReferenceImages`: Umum mengisi peran kosong, cover tidak dipinjamkan, pool Umum saja mengisi semua.
- `buildImagePrompt`: aturan layout bertumpuk, teks utuh, slide isi dipimpin teks, kalimat contoh dengan dan tanpa
  warna brand, kalimat lampiran, kalimat Umum per peran, resep tidak ditambahkan saat ada contoh.
- `drawImage`: urutan lampiran → produk → referensi atau contoh; contoh dibaca dari file; lampiran dari path.
- `content-ai`: aturan tanpa singkatan, potongan di batas kalimat, field `attachment` dan cadangannya, pesan vision.
- `attachments`: bukan gambar, terlalu besar, bukan data URL, gambar valid, path user lain ditolak.
- Pemetaan `create_content` dan `replace_slide`, filter Hasil AI di foto produk.

## Tambahan setelah review (2026-10-18)

- Dropdown Referensi di `/buat` dihapus atas permintaan owner: konten baru selalu Otomatis (semua referensi akun,
  atau contoh gaya kalau belum ada). Desain atau footage tertentu cukup dilampirkan sebagai gambar. Server masih
  menerima Tanpa dan grup tertentu, tanpa pemanggil.
- Lampiran tanpa penjelasan: AI menentukan dari isi gambar. Desain jadi atau screenshot post menjadi referensi layout
  dan gaya; foto produk, tempat, atau orang ditampilkan di slide.
- Perbaikan hasil review: kartu Tambah foto juga untuk post baru yang sudah berisi foto (pemilih ditutup tanpa
  Selesai), teks yang diketik selama permintaan berjalan tidak ikut terhapus, menghapus foto terakhir tetap di slide,
  paste dari dokumen tetap teks, pesan error lampiran hilang saat mengetik, slide isi lain tidak dimuat kalau slide
  punya referensi atau contoh, batas 40 juta piksel untuk gambar input, alamat web tidak terpotong di titiknya.
