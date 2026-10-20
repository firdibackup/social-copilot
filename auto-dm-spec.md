# Spesifikasi Fitur Auto DM (Comment-to-DM)

> Hasil analisis langsung dari fitur **Auto DM** di dashboard Bleam (`/dashboard/replies` → tab **DM**).
> Dokumen ini bisa dipakai sebagai acuan untuk membangun ulang fitur yang sama persis: struktur halaman, semua section, field, copy (teks UI), logika kondisional, preview HP, dan alur kerja di backend.
>
> Keterangan tanda:
> - **[Teramati]** = dicek langsung di UI.
> - **[Asumsi]** = perilaku yang wajar disimpulkan tapi tidak dites (misalnya karena perlu menyimpan atau menjeda rule yang sedang aktif).

---

## Daftar Isi

1. [Ringkasan Fitur](#1-ringkasan-fitur)
2. [Lokasi & Entry Point](#2-lokasi--entry-point)
3. [Halaman Daftar (Inbox DM + Aturan Auto DM)](#3-halaman-daftar-inbox-dm--aturan-auto-dm)
4. [Form Buat/Ubah Auto DM: layout](#4-form-buatubah-auto-dm-layout)
5. [Form: rincian per section](#5-form-rincian-per-section)
6. [Panel Preview HP](#6-panel-preview-hp)
7. [Logika Kondisional (State Matrix)](#7-logika-kondisional-state-matrix)
8. [Validasi, Simpan & Batal](#8-validasi-simpan--batal)
9. [Alur Runtime (Backend)](#9-alur-runtime-backend)
10. [Model Data](#10-model-data)
11. [Panduan Penggunaan (User Guide)](#11-panduan-penggunaan-user-guide)
12. [Daftar Lengkap Copy UI](#12-daftar-lengkap-copy-ui)
13. [Design Tokens & Komponen](#13-design-tokens--komponen)
14. [Checklist Implementasi](#14-checklist-implementasi)

---

## 1. Ringkasan Fitur

**Auto DM** mengirim DM Instagram secara otomatis ke orang yang **berkomentar** di post (atau yang mengirim DM berisi kata kunci). Fungsinya mirip "comment-to-DM" di ManyChat.

Kemampuan utama:

| Kemampuan | Penjelasan |
|---|---|
| Target post | Semua post, atau satu post tertentu |
| Trigger | Komentar yang mengandung kata kunci tertentu, atau komentar apa pun |
| Trigger DM | Opsional: DM masuk yang berisi kata kunci juga dibalas |
| Balasan publik | Opsional: membalas di kolom komentar, dengan beberapa variasi yang dipilih acak |
| DM pembuka (chat dulu) | Pesan + tombol. Pesan utama baru dikirim setelah tombol ditekan |
| Gate follow | Opsional: pesan utama hanya untuk follower. Yang belum follow diminta follow dulu |
| Pesan utama | Teks (boleh berisi link) + tombol link opsional (URL button) |
| Preview live | Mockup HP dengan 3 tab: Post, Komentar, DM |
| Manajemen rule | Daftar rule beserta status, aktivitas terakhir, dan menu Jeda / Ubah / Hapus |

---

## 2. Lokasi & Entry Point

```
Sidebar ▸ Balasan  ──►  Halaman "Balasan" (INBOX)
                         ├─ Tab: DM        ◄── Auto DM ada di sini
                         └─ Tab: Komentar
```

- Breadcrumb: `🏠 › {workspace} › Balasan`
- Tombol masuk ke form: **`+ Auto DM`** (tombol hitam, kanan atas area konten tab DM).
- Untuk mengubah rule yang sudah ada: menu `⋯` pada kartu rule → **Ubah**.

---

## 3. Halaman Daftar (Inbox DM + Aturan Auto DM)

### 3.1 Wireframe

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 🏠 › sume › Balasan                                      🌐 ID   [🎧 Bantu setup]│
├──────────────────────────────────────────────────────────────────────────────┤
│ INBOX                                                                        │
│ Balasan  (serif, besar)                                       [⟳ Muat ulang] │
│                                                                              │
│  DM   Komentar                         [Semua akun (3)   ▾] [Belum dibales ▾] │
│  ──                                                                          │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                              [ + Auto DM ]   │
│                                                                              │
│  (●) @brovolution_  •                                              19 Okt    │
│      Hess                                                                    │
│                                                                              │
│  ˅ Aturan Auto DM (1)                                                        │
│  Komentar berisi kata kunci di post @sume.group otomatis dibalas lewat DM.   │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ MAU  [Aktif]                                                     (⋯)   │  │
│  │ MAU   Semua post   [Chat dulu]                                         │  │
│  ├────────────────────────────────────────────────────────────────────────┤  │
│  │ AKTIVITAS TERAKHIR                                                     │  │
│  │ Belum ada komentar yang cocok.                                         │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Komponen

| Elemen | Detail |
|---|---|
| Header halaman | Eyebrow `INBOX`, judul `Balasan` (font serif), tombol `Muat ulang` (ikon refresh) |
| Tab | `DM` (aktif, garis bawah ungu) dan `Komentar` |
| Filter akun | `Semua akun (3)` · `Instagram @sume.group (3)` · `Threads (0)` |
| Filter status | `Belum dibales` (default) · `Semua` · `Otomatis` |
| Tombol `+ Auto DM` | Membuka form **Buat Auto DM** |
| Item percakapan | Avatar, `@username`, titik biru (belum dibaca), preview pesan terakhir, tanggal. Kalau diklik, thread membuka inline lengkap dengan quick reply chips (`Kirim katalog`, `Cek stok`, `Info ongkir`, ✏️) dan composer `Tulis DM...` (0/1000, emoji, AI ✨, kirim) |
| Section **Aturan Auto DM (n)** | Bisa dilipat (chevron ˅/›). n = jumlah rule |
| Deskripsi section | `Komentar berisi kata kunci di post @{akun} otomatis dibalas lewat DM.` |

### 3.3 Anatomi Kartu Rule

```
┌──────────────────────────────────────────────────────────┐
│ {Nama otomatisasi}  [Aktif]                        (⋯)   │  ← judul + badge status
│ {KEYWORD1, KEYWORD2}  {Semua post|Satu post}  [Chat dulu]│  ← meta row
├──────────────────────────────────────────────────────────┤
│ AKTIVITAS TERAKHIR                                       │
│ {log terakhir | "Belum ada komentar yang cocok."}        │
└──────────────────────────────────────────────────────────┘
```

- **Badge status**: `Aktif` (pill hitam, teks putih). Kalau dijeda, **[Asumsi]** badge berubah jadi `Dijeda` dengan gaya abu-abu, dan menu berubah jadi `Lanjutkan`.
- **Meta row**: kata kunci (tebal; untuk mode "kata apa pun" **[Asumsi]** tampil "Semua komentar"), cakupan post (abu-abu), chip `Chat dulu` jika DM pembuka aktif.
- **Aktivitas terakhir**: empty state `Belum ada komentar yang cocok.`

### 3.4 Menu `⋯` (dropdown)

```
┌──────────────────┐
│ ⏸  Jedakan       │
├──────────────────┤
│ ✏️  Ubah          │
├──────────────────┤
│ 🗑  Hapus  (merah)│
└──────────────────┘
```

### 3.5 Empty State Filter

Ketika filter `Otomatis` tidak menemukan percakapan:

```
┌────────────────────────────────────────────────┐
│                 Belum ada DM                   │
│   Nggak ada percakapan yang cocok sama filter ini. │
└────────────────────────────────────────────────┘
```

Section **Aturan Auto DM** tetap tampil di bawahnya.

---

## 4. Form Buat/Ubah Auto DM: layout

Layout 2 kolom: **form di kiri (±60%)**, **preview HP sticky di kanan (±40%)**. Kedua kolom bisa di-scroll di dalam panel.

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ AUTO DM                                                    [Batal] [Simpan]   │
│ Buat Auto DM            (mode edit: judul = nama rule)                        │
├────────────────────────────────────────────┬──────────────────────────────────┤
│ Nama otomatisasi                           │   ┌──────────────────────────┐   │
│ [ cth. Link ebook gratis              ]    │   │ 11:45            ▂▄ ᯤ 🔋 │   │
│                                            │   │                          │   │
│ Kalau ada yang komentar di…                │   │   (konten preview:       │   │
│ (● Semua post) ( Satu post )               │   │    Post / Komentar / DM) │   │
│                                            │   │                          │   │
│ …dan komentarnya mengandung                │   │                          │   │
│ ┌────────────────────────────────────┐     │   │                          │   │
│ │ ◉ kata tertentu                    │     │   │                          │   │
│ │   [ Ketik lalu Enter, cth. MAU  ]  │     │   │                          │   │
│ │   ...                              │     │   └──────────────────────────┘   │
│ └────────────────────────────────────┘     │                                  │
│ ┌────────────────────────────────────┐     │   ( Post | Komentar | DM )       │
│ │ ○ kata apa pun                     │     │                                  │
│ └────────────────────────────────────┘     │                                  │
│ ☐ Juga balas kalau ada yang DM kata kunci… │                                  │
│ ☐ Balas juga di kolom komentar             │                                  │
│                                            │                                  │
│ Mereka akan dapat…                         │                                  │
│ ☑ DM pembuka dengan tombol (chat dulu)     │                                  │
│ ☐ Minta follow dulu                        │                                  │
│                                            │                                  │
│ Lalu setelah tombol ditekan, mereka dapat… │                                  │
│ [ Pesan yang dikirim ke yang komentar… ]   │                                  │
│ ☐ Tambah tombol link di bawah pesan        │                                  │
└────────────────────────────────────────────┴──────────────────────────────────┘
```

Urutan section (atas ke bawah):

1. Header form (eyebrow, judul, Batal/Simpan)
2. Nama otomatisasi
3. Kalau ada yang komentar di… (cakupan post)
4. …dan komentarnya mengandung (trigger)
5. Juga balas kalau ada yang DM kata kuncinya
6. Balas juga di kolom komentar
7. Mereka akan dapat… (DM pembuka + Minta follow)
8. Pesan utama ("Lalu setelah tombol ditekan, mereka dapat…" / "Isi DM-nya…")
9. Tambah tombol link di bawah pesan

---

## 5. Form: rincian per section

### 5.1 Header Form

| Elemen | Nilai |
|---|---|
| Eyebrow | `AUTO DM` (uppercase, kecil, abu-abu) |
| Judul | Mode buat: `Buat Auto DM`. Mode ubah: nama rule (mis. `MAU`) |
| Tombol `Batal` | Outline, pill. Memunculkan modal konfirmasi jika ada perubahan |
| Tombol `Simpan` | Pill hitam. **Disabled (abu-abu)** sampai field wajib terisi |

### 5.2 Nama otomatisasi

```
Nama otomatisasi
┌──────────────────────────────────────────┐
│ cth. Link ebook gratis                   │
└──────────────────────────────────────────┘
```

- Input teks satu baris, hanya label internal (tidak dikirim ke user).
- Dipakai sebagai judul kartu dan judul form saat mode ubah.

### 5.3 Kalau ada yang komentar di…

```
Kalau ada yang komentar di…
 ( Semua post )  ( Satu post )      ← segmented pill; aktif = hitam, nonaktif = outline
```

**Semua post** (default): rule berlaku untuk komentar di semua post akun.

**Satu post**:

1. Muncul teks loading `Memuat post…`.
2. Setelah itu tampil **grid thumbnail post** (kotak ±85px, 3 kolom/baris, urut terbaru).
3. Klik thumbnail untuk memilih (single select). Thumbnail terpilih diberi border dan **badge centang ✓** di pojok kanan atas.
4. Preview HP (tab Post/Komentar) memakai gambar post yang dipilih. Sebelum ada yang dipilih, area post di preview gelap/kosong.

```
 ( Semua post )  ( ■ Satu post )
 ┌───────┐ ┌───────┐ ┌───────┐
 │ img ✓ │ │  img  │ │  img  │
 └───────┘ └───────┘ └───────┘
```

### 5.4 …dan komentarnya mengandung

Dua **radio card** (kartu dengan border; kartu terpilih diberi background abu muda dan border lebih tegas).

#### Opsi A: `kata tertentu` (default)

```
┌──────────────────────────────────────────────────────────┐
│ ◉ kata tertentu                                          │
│   ┌────────────────────────────────────────────────────┐ │
│   │ [MAU ×] [LINK ×] |                                 │ │  ← tag input
│   └────────────────────────────────────────────────────┘ │
│   Satu saja yang cocok sudah cukup. Huruf besar-kecil    │
│   nggak ngaruh.                                          │
│   Contoh: (MAU) (LINK) (HARGA)   ← hanya saat kosong     │
│   ☑ Harus kata utuh ("link" nggak kena di "linknya")     │
└──────────────────────────────────────────────────────────┘
```

- **Tag input**: placeholder `Ketik lalu Enter, cth. MAU`. Tekan Enter untuk menambah chip. Klik `×` untuk menghapus.
- **Chip contoh** `MAU`, `LINK`, `HARGA`: klik untuk menambah cepat. **Baris "Contoh:" hilang setelah ada minimal 1 keyword.**
- Logika pencocokan: **OR** (cukup salah satu cocok) dan **case-insensitive**.
- Checkbox **Harus kata utuh**: default **ON**. ON = pencocokan berbasis batas kata (`\bkeyword\b`). OFF = substring.
- Kalau radio ini tidak dipilih, kartu menyusut hanya menampilkan label `kata tertentu` (input disembunyikan, nilai tetap disimpan).

#### Opsi B: `kata apa pun`

```
┌──────────────────────────────────────────────────────────┐
│ ○ kata apa pun                                           │
│   Semua komentar di post itu langsung dibalas.           │
└──────────────────────────────────────────────────────────┘
```

### 5.5 Juga balas kalau ada yang DM kata kuncinya

```
☐ Juga balas kalau ada yang DM kata kuncinya
  Buat CTA "DM aku LINK" - DM masuk yang cocok langsung dibalas.
```

- Default OFF.
- Kalau ON, DM masuk yang mengandung keyword juga memicu alur yang sama.
- **Helper berubah jadi peringatan** saat trigger = `kata apa pun`:
  > `Hati-hati: "kata apa pun" + trigger DM berarti SEMUA DM masuk dibalas otomatis.`

### 5.6 Balas juga di kolom komentar

```
☑ Balas juga di kolom komentar
│ ┌──────────────────────────────────────────┐
│ │ Cek DM ya!                               │  ×
│ └──────────────────────────────────────────┘
│ ┌──────────────────────────────────────────┐
│ │ cth. Cek DM ya! 📩                       │  ×
│ └──────────────────────────────────────────┘
│ + Tambah variasi
│ Kalau ada beberapa variasi, tiap balasan dipilih acak biar nggak keliatan bot.
```

- Default OFF. Saat ON muncul blok ber-indent (garis kiri) berisi daftar input variasi.
- Awalnya 1 input (placeholder `cth. Cek DM ya! 📩`). Tombol `×` muncul ketika ada lebih dari 1 variasi.
- `+ Tambah variasi` menambah input baru.
- Runtime: pilih satu variasi **secara acak** untuk setiap balasan publik.

### 5.7 Mereka akan dapat…

#### 5.7.1 DM pembuka dengan tombol (chat dulu)

```
☑ DM pembuka dengan tombol (chat dulu)
  Pesan utamanya dikirim setelah tombolnya ditekan - lebih aman dari batas
  satu-DM-per-komentar.
│ Pesan pembuka
│ ┌──────────────────────────────────────────────┐
│ │ cth. Mau linknya? Tekan tombol di bawah 👇   │  (textarea 2 baris)
│ └──────────────────────────────────────────────┘
│ Teks tombol
│ ┌────────────────────────────────────────┐ 0/20
│ │ cth. Kirim linknya                     │
│ └────────────────────────────────────────┘
```

- Default **ON**.
- `Teks tombol` maksimal **20 karakter**, dengan counter live `n/20`.
- Kartu rule menampilkan chip `Chat dulu` jika opsi ini ON.

#### 5.7.2 Minta follow dulu

```
☑ Minta follow dulu
  Pesan utamanya cuma dikirim ke yang sudah follow. Yang belum, diminta follow
  dulu lewat pesan berikut.
│ Pesan ajakan follow
│ ┌──────────────────────────────────────────────────────┐
│ │ cth. Follow dulu yuk, habis itu linknya aku kirim 🙌 │
│ └──────────────────────────────────────────────────────┘
│ Teks tombol
│ ┌────────────────────────────────────────┐ 0/20
│ │ cth. Sudah follow ✅                   │
│ └────────────────────────────────────────┘
```

- Default OFF. Bisa dipakai dengan atau tanpa DM pembuka.
- Tombol `Sudah follow` mengecek ulang status follow ketika ditekan.

### 5.8 Pesan Utama

Judul section **dinamis**:

| DM pembuka | Judul |
|---|---|
| ON | `Lalu setelah tombol ditekan, mereka dapat…` |
| OFF | `Isi DM-nya…` |

```
Lalu setelah tombol ditekan, mereka dapat…
┌──────────────────────────────────────────────┐
│ Pesan yang dikirim ke yang komentar…         │  (textarea ±4 baris)
│                                              │
└──────────────────────────────────────────────┘
Tulis link langsung di pesannya kalau ada.
```

### 5.9 Tambah tombol link di bawah pesan

```
☑ Tambah tombol link di bawah pesan
  Tombol yang langsung buka link kamu - halaman booking, WhatsApp, atau katalog.
│ Teks tombol
│ ┌────────────────────────────────────────┐ 0/20
│ │ cth. Booking sekarang                  │
│ └────────────────────────────────────────┘
│ Link tujuan
│ ┌────────────────────────────────────────┐
│ │ https://                               │
│ └────────────────────────────────────────┘
```

- Default OFF. Tombol berupa **URL button** di bawah bubble pesan utama.

---

## 6. Panel Preview HP

Mockup iPhone gelap (dark mode IG) di kanan, **sticky**, dan berubah live mengikuti isi form.

Switcher di bawah HP: segmented pill **`Post | Komentar | DM`** (aktif = hitam). Default tab: **Komentar**.

Status bar: `11:45` + ikon sinyal/wifi/baterai.

### 6.1 Tab **Post**

```
┌────────────────────────────┐
│ 11:45              ▂▄ ᯤ 🔋 │
│ ‹      SUME.GROUP          │
│         Postingan          │
│ (◎) sume.group             │
│ ┌────────────────────────┐ │
│ │   gambar post terpilih │ │
│ │   (atau post terbaru)  │ │
│ └────────────────────────┘ │
│ ♡ 543   💬 153   ➤      🔖 │
│ sume.group Investasi besar │
│ di awal sering jadi …      │
└────────────────────────────┘
```

### 6.2 Tab **Komentar** (bottom sheet)

```
┌────────────────────────────┐
│ 11:45              ▂▄ ᯤ 🔋 │
│ ░░ (post diredupkan) ░░░░░ │
│ ┌────────────────────────┐ │
│ │        ───             │ │
│ │      Komentar        ➤ │ │
│ ├────────────────────────┤ │
│ │ (U) username Baru saja ♡│ │
│ │     MAU                │ │  ← keyword pertama, atau "Keren banget! 🤩"
│ │     Balas              │ │     kalau mode "kata apa pun"
│ │                        │ │
│ │   (◎) sume.group Baru saja ♡│ ← hanya muncul jika "Balas juga di
│ │       Cek DM ya!       │ │     kolom komentar" ON (variasi pertama)
│ │       Balas            │ │
│ │                        │ │
│ │ ❤️ 🙌 🔥 👏 😍 😮 😂     │ │
│ │ (◎) [Tambahkan komentar…]│ │
│ └────────────────────────┘ │
└────────────────────────────┘
```

### 6.3 Tab **DM** (simulasi percakapan lengkap)

```
┌────────────────────────────┐
│ 11:45              ▂▄ ᯤ 🔋 │
│ ‹ (◎) sume.group        📷 │
│       Instagram            │
├────────────────────────────┤
│  Membalas komentar: "MAU"  │  ← label sistem (abu kecil)
│      ┌──────────────────┐  │
│ (◎)  │ Mau linknya?     │  │  ① DM pembuka
│      │ Tekan tombol…    │  │
│      ├──────────────────┤  │
│      │  Kirim linknya   │  │     (teks tombol, biru)
│      └──────────────────┘  │
│   SETELAH TOMBOL DITEKAN   │  ← divider (uppercase, letter-spacing)
│      ┌──────────────────┐  │
│ (◎)  │ Follow dulu yuk  │  │  ② ajakan follow
│      ├──────────────────┤  │
│      │  Sudah follow    │  │
│      └──────────────────┘  │
│ SETELAH FOLLOW & TEKAN TOMBOL │
│      ┌──────────────────┐  │
│ (◎)  │ Ini linknya:     │  │  ③ pesan utama
│      │ https://…        │  │
│      ├──────────────────┤  │
│      │   Buka link      │  │     (tombol link, jika ON)
│      └──────────────────┘  │
│ [ Kirim pesan…           ] │
└────────────────────────────┘
```

**Aturan susunan bubble & divider:**

| DM pembuka | Minta follow | Urutan di preview |
|---|---|---|
| ON | ON | ① Pembuka → `SETELAH TOMBOL DITEKAN` → ② Follow → `SETELAH FOLLOW & TEKAN TOMBOL` → ③ Utama |
| ON | OFF | ① Pembuka → `SETELAH TOMBOL DITEKAN` → ③ Utama |
| OFF | ON | ② Follow → `SETELAH FOLLOW & TEKAN TOMBOL` → ③ Utama **[Teramati]** |
| OFF | OFF | ③ Utama langsung **[Asumsi]** |

- Label atas: `Membalas komentar: "{keyword pertama}"`. Untuk mode kata apa pun: `Membalas komentar: "Keren banget! 🤩"`.
- Bubble yang kosong menampilkan placeholder-nya. **[Asumsi]**
- Bubble: abu gelap (#262626-ish), radius ±16px, tombol dipisah garis tipis, teks tombol biru IG (#0095F6-ish), avatar akun di kiri bawah bubble.

---

## 7. Logika Kondisional (State Matrix)

| Kontrol | Default | Jika ON / dipilih, tampilkan | Efek lain |
|---|---|---|---|
| `Semua post` / `Satu post` | Semua post | Grid pemilih post (+ loading `Memuat post…`) | Gambar di preview mengikuti post terpilih |
| Radio `kata tertentu` | ✓ | Tag input, helper, Contoh chips, checkbox kata utuh | Preview komentar = keyword pertama |
| Radio `kata apa pun` | – | Deskripsi saja | Preview komentar = "Keren banget! 🤩"; helper trigger DM jadi peringatan |
| Chip contoh | tampil | – | Disembunyikan begitu keywords ≥ 1 |
| `Harus kata utuh` | ON | – | Word-boundary match |
| `Juga balas kalau ada yang DM…` | OFF | – | Mengaktifkan trigger DM |
| `Balas juga di kolom komentar` | OFF | Daftar variasi + `+ Tambah variasi` | Preview komentar menampilkan balasan akun |
| `DM pembuka dengan tombol` | ON | Pesan pembuka + Teks tombol | Judul pesan utama berganti; chip `Chat dulu` di kartu |
| `Minta follow dulu` | OFF | Pesan ajakan follow + Teks tombol | Menambah bubble ② di preview DM |
| `Tambah tombol link` | OFF | Teks tombol + Link tujuan | Menambah tombol di bubble ③ |

---

## 8. Validasi, Simpan & Batal

### 8.1 Validasi

**[Teramati]** `Simpan` disabled pada form kosong, lalu aktif setelah nama, keyword, pesan pembuka, teks tombol, pesan follow, dan pesan utama terisi.

**[Asumsi]** Aturan wajib yang disarankan untuk replikasi:

| Field | Wajib jika |
|---|---|
| Nama otomatisasi | selalu |
| Post terpilih | `Satu post` |
| Minimal 1 keyword | `kata tertentu` |
| ≥1 variasi balasan tidak kosong | `Balas juga di kolom komentar` ON |
| Pesan pembuka + Teks tombol (1–20) | `DM pembuka` ON |
| Pesan ajakan follow + Teks tombol (1–20) | `Minta follow` ON |
| Pesan utama | selalu |
| Teks tombol (1–20) + URL valid `https://` | `Tambah tombol link` ON |

Batas karakter teks tombol (20) ditegakkan di input (`maxLength=20`) dan ditampilkan sebagai counter `n/20`.

### 8.2 Batal → Modal konfirmasi

Muncul jika form *dirty* (ada perubahan). Kalau tidak ada perubahan, form langsung ditutup.

```
┌─────────────────────────────────────────────┐
│ Buang perubahan?                            │
│ Perubahan yang belum disimpan bakal hilang. │
│                    [Lanjut edit] [ Buang ]  │  ← Buang = merah
└─────────────────────────────────────────────┘
```

### 8.3 Setelah Simpan

Form tertutup, kembali ke daftar, dan kartu rule baru muncul dengan badge `Aktif`. Counter `Aturan Auto DM (n)` bertambah.

---

## 9. Alur Runtime (Backend)

### 9.1 Diagram Alur

```
 Webhook IG: comment baru ─┐          Webhook IG: DM baru ─┐
                           ▼                               ▼
              Cari rule aktif untuk akun        Cari rule aktif dengan
              & post (semua / post_id)          dm_trigger = true
                           │                               │
                           ▼                               ▼
              Cocokkan teks (keyword/any) ◄────────────────┘
                           │ tidak cocok → stop
                           ▼ cocok
         ┌─── Dedupe: sudah pernah diproses (comment_id / user+rule)? → stop
         │
         ▼
  [public_reply ON]  → reply komentar dengan variasi acak
         │
         ▼
  [opener ON] ──► kirim Private Reply: Pesan pembuka + tombol(postback: OPEN)
         │                 │
         │          user tekan tombol → webhook postback OPEN
         │                 ▼
         └──────────► [follow_gate ON]?
                           │ ya → cek is_user_follow_business
                           │        ├─ belum follow → kirim Pesan ajakan follow
                           │        │                 + tombol(postback: FOLLOW_CHECK)
                           │        │                 (tekan lagi → cek ulang)
                           │        └─ sudah follow ─┐
                           │ tidak ──────────────────┤
                           ▼                         ▼
                  Kirim Pesan utama (+ URL button jika ON)
                           │
                           ▼
                  Catat ke log → tampil di "AKTIVITAS TERAKHIR"
```

### 9.2 Catatan Teknis (Instagram Messaging API)

- **Private Reply**: IG hanya mengizinkan **1 DM per komentar** (dalam batas waktu tertentu setelah komentar dibuat) sampai user membalas. Karena itu ada fitur **"chat dulu"**: tombol postback membuat user berinteraksi, sehingga jendela percakapan 24 jam terbuka dan pesan lanjutan boleh dikirim. Ini maksud copy *"lebih aman dari batas satu-DM-per-komentar"*.
- **Cek follow**: gunakan field profil user `is_user_follow_business` dari Instagram User Profile API saat postback diterima.
- **Tombol**: pesan pembuka dan pesan follow memakai **postback button** (payload internal). Pesan utama memakai **web_url button**.
- **Dedupe**: simpan `comment_id` yang sudah diproses, dan opsional cegah user yang sama dipicu berkali-kali oleh rule yang sama dalam waktu singkat.
- **Kata utuh**: regex `(?<![\p{L}\p{N}])keyword(?![\p{L}\p{N}])` dengan flag `iu`, supaya emoji/unicode aman.
- **Prioritas** jika lebih dari satu rule cocok **[Asumsi]**: rule `Satu post` lebih diutamakan daripada `Semua post`, lalu `kata tertentu` lebih diutamakan daripada `kata apa pun`, dan hanya satu rule yang dieksekusi per komentar.
- **Jedakan**: set `status = paused`. Webhook tetap diterima tapi rule di-skip.
- Filter inbox **Otomatis** menampilkan percakapan yang dimulai/dibalas oleh Auto DM.

---

## 10. Model Data

```jsonc
// AutoDmRule
{
  "id": "uuid",
  "business_id": "uuid",
  "account_id": "uuid",                 // akun IG terhubung
  "name": "Link ebook gratis",
  "status": "active",                   // active | paused
  "scope": "all_posts",                 // all_posts | single_post
  "post_id": null,                      // wajib jika single_post
  "match": {
    "mode": "keywords",                 // keywords | any
    "keywords": ["MAU", "LINK"],
    "whole_word": true                  // default true
  },
  "dm_trigger": false,                  // juga balas DM berisi keyword
  "public_reply": {
    "enabled": false,
    "variations": ["Cek DM ya! 📩"]
  },
  "opener": {
    "enabled": true,                    // default true
    "message": "Mau linknya? Tekan tombol di bawah 👇",
    "button_text": "Kirim linknya"      // max 20
  },
  "follow_gate": {
    "enabled": false,
    "message": "Follow dulu yuk, habis itu linknya aku kirim 🙌",
    "button_text": "Sudah follow ✅"     // max 20
  },
  "main": {
    "message": "Ini linknya: https://…",
    "link_button": {
      "enabled": false,
      "text": "Booking sekarang",       // max 20
      "url": "https://…"
    }
  },
  "created_at": "…",
  "updated_at": "…"
}

// AutoDmEvent (untuk "AKTIVITAS TERAKHIR" & analitik)
{
  "id": "uuid",
  "rule_id": "uuid",
  "source": "comment",                  // comment | dm
  "comment_id": "…",
  "ig_user_id": "…",
  "username": "…",
  "text": "MAU",
  "step": "opener_sent",                // public_reply_sent | opener_sent | follow_requested | main_sent | failed
  "error": null,
  "created_at": "…"
}
```

---

## 11. Panduan Penggunaan (User Guide)

**Contoh kasus:** "Komentar MAU untuk dapat link ebook gratis."

1. Buka **Balasan** → tab **DM** → klik **+ Auto DM**.
2. **Nama otomatisasi**: `Link ebook gratis`.
3. **Kalau ada yang komentar di…**: pilih `Satu post`, lalu klik thumbnail post promosi ebook.
4. **…dan komentarnya mengandung**: biarkan `kata tertentu`, ketik `MAU` lalu Enter (atau klik chip contoh). Biarkan **Harus kata utuh** tetap ON.
5. (Opsional) Centang **Juga balas kalau ada yang DM kata kuncinya** jika di caption juga ada CTA "DM aku MAU".
6. (Disarankan) Centang **Balas juga di kolom komentar**, lalu isi 2–3 variasi, misalnya `Cek DM ya! 📩`, `Udah aku kirim ke DM 🙌`, `Meluncur ke inbox ✨`.
7. **DM pembuka** (biarkan ON): pesan `Mau linknya? Tekan tombol di bawah 👇`, tombol `Kirim linknya`.
8. (Opsional) **Minta follow dulu**: pesan `Follow dulu yuk, habis itu linknya aku kirim 🙌`, tombol `Sudah follow ✅`.
9. **Pesan utama**: `Ini link ebook-nya ya 👇`.
10. Centang **Tambah tombol link**: teks `Download ebook`, link `https://…`.
11. Cek preview: tab **Komentar** untuk balasan publik, tab **DM** untuk urutan pesan.
12. Klik **Simpan**. Rule muncul di **Aturan Auto DM** dengan status **Aktif**.
13. Pantau di kartu (**Aktivitas terakhir**). Untuk mematikan sementara: `⋯` → **Jedakan**. Untuk mengubah: `⋯` → **Ubah**.

**Tips:**

- Pakai keyword pendek dan unik (`MAU`, `LINK`, `HARGA`).
- Hindari kombinasi `kata apa pun` + trigger DM kecuali memang ingin semua DM dibalas otomatis.
- Pakai beberapa variasi balasan publik supaya tidak terlihat seperti bot.
- Biarkan **DM pembuka** ON supaya pesan lanjutan (follow gate, link) bisa terkirim tanpa terbentur limit.

---

## 12. Daftar Lengkap Copy UI

| Lokasi | Teks |
|---|---|
| Tombol entry | `+ Auto DM` |
| Section daftar | `Aturan Auto DM ({n})` |
| Deskripsi section | `Komentar berisi kata kunci di post @{akun} otomatis dibalas lewat DM.` |
| Badge | `Aktif` |
| Chip kartu | `Chat dulu` |
| Label kartu | `AKTIVITAS TERAKHIR` |
| Empty aktivitas | `Belum ada komentar yang cocok.` |
| Menu | `Jedakan` · `Ubah` · `Hapus` |
| Empty inbox | `Belum ada DM` / `Nggak ada percakapan yang cocok sama filter ini.` |
| Eyebrow form | `AUTO DM` |
| Judul form | `Buat Auto DM` |
| Tombol | `Batal` · `Simpan` |
| Label | `Nama otomatisasi` — ph: `cth. Link ebook gratis` |
| Judul | `Kalau ada yang komentar di…` |
| Pilihan | `Semua post` · `Satu post` · loading `Memuat post…` |
| Judul | `…dan komentarnya mengandung` |
| Radio | `kata tertentu` |
| Input | ph: `Ketik lalu Enter, cth. MAU` |
| Helper | `Satu saja yang cocok sudah cukup. Huruf besar-kecil nggak ngaruh.` |
| Contoh | `Contoh:` `MAU` `LINK` `HARGA` |
| Checkbox | `Harus kata utuh ("link" nggak kena di "linknya")` |
| Radio | `kata apa pun` — `Semua komentar di post itu langsung dibalas.` |
| Checkbox | `Juga balas kalau ada yang DM kata kuncinya` |
| Helper | `Buat CTA "DM aku LINK" - DM masuk yang cocok langsung dibalas.` |
| Peringatan | `Hati-hati: "kata apa pun" + trigger DM berarti SEMUA DM masuk dibalas otomatis.` |
| Checkbox | `Balas juga di kolom komentar` |
| Input variasi | ph: `cth. Cek DM ya! 📩` |
| Link | `+ Tambah variasi` |
| Helper | `Kalau ada beberapa variasi, tiap balasan dipilih acak biar nggak keliatan bot.` |
| Judul | `Mereka akan dapat…` |
| Checkbox | `DM pembuka dengan tombol (chat dulu)` |
| Helper | `Pesan utamanya dikirim setelah tombolnya ditekan - lebih aman dari batas satu-DM-per-komentar.` |
| Label | `Pesan pembuka` — ph: `cth. Mau linknya? Tekan tombol di bawah 👇` |
| Label | `Teks tombol` — ph: `cth. Kirim linknya` — counter `0/20` |
| Checkbox | `Minta follow dulu` |
| Helper | `Pesan utamanya cuma dikirim ke yang sudah follow. Yang belum, diminta follow dulu lewat pesan berikut.` |
| Label | `Pesan ajakan follow` — ph: `cth. Follow dulu yuk, habis itu linknya aku kirim 🙌` |
| Label | `Teks tombol` — ph: `cth. Sudah follow ✅` — `0/20` |
| Judul (opener ON) | `Lalu setelah tombol ditekan, mereka dapat…` |
| Judul (opener OFF) | `Isi DM-nya…` |
| Textarea | ph: `Pesan yang dikirim ke yang komentar…` |
| Helper | `Tulis link langsung di pesannya kalau ada.` |
| Checkbox | `Tambah tombol link di bawah pesan` |
| Helper | `Tombol yang langsung buka link kamu - halaman booking, WhatsApp, atau katalog.` |
| Label | `Teks tombol` — ph: `cth. Booking sekarang` — `0/20` |
| Label | `Link tujuan` — ph: `https://` |
| Preview tab | `Post` · `Komentar` · `DM` |
| Preview komentar | `username` `Baru saja` · `Balas` · `Tambahkan komentar…` |
| Preview DM | `Membalas komentar: "{kw}"` · `SETELAH TOMBOL DITEKAN` · `SETELAH FOLLOW & TEKAN TOMBOL` · `Kirim pesan…` |
| Default komentar (any) | `Keren banget! 🤩` |
| Modal | `Buang perubahan?` / `Perubahan yang belum disimpan bakal hilang.` / `Lanjut edit` · `Buang` |

---

## 13. Design Tokens & Komponen

| Token | Nilai (perkiraan) |
|---|---|
| Background app | `#F7F7F5` (off-white), panel konten putih, radius 16px, border `#E7E7E4` |
| Teks utama | `#111111` |
| Teks sekunder/helper | `#6B6B6B`, 12–13px |
| Aksen (tab aktif, dot) | Ungu/indigo `#4F46E5` |
| Primary button | Hitam `#000`, teks putih, pill (radius 999px), tinggi ±36px |
| Disabled button | `#A3A3A3` bg, teks putih |
| Secondary button | Putih, border `#E5E5E5`, pill |
| Destructive | Merah `#DC2626` |
| Input | Tinggi ±38px, radius 6px, border `#E5E5E5`, placeholder `#9CA3AF` |
| Radio card terpilih | bg `#F5F5F5`, border `#D4D4D4`, radius 8px |
| Sub-blok kondisional | indent 14px + garis kiri 1px `#E5E5E5` |
| Judul halaman | Serif (mis. "Instrument Serif"/"Fraunces"), ±32px |
| Section title | Sans 15px semibold |
| Eyebrow | 11px uppercase, letter-spacing 0.06em |
| Phone mockup | Frame hitam radius ±44px, layar IG dark `#000`/`#121212`, bubble `#262626`, link `#0095F6` |
| Segmented pill | Container putih border, item aktif hitam |

Komponen yang dibutuhkan: `SegmentedPill`, `RadioCard`, `TagInput` (+ example chips), `Checkbox` dengan sub-panel collapsible, `RepeatableInputList`, `CharCountInput`, `PostPickerGrid`, `PhonePreview` (3 view), `RuleCard`, `KebabMenu`, `ConfirmModal`, `CollapsibleSection`.

---

## 14. Checklist Implementasi

**Frontend**

- [ ] Tombol `+ Auto DM` di tab DM membuka form (route/state `mode=create`)
- [ ] Section `Aturan Auto DM (n)` collapsible + daftar `RuleCard`
- [ ] Menu kartu: Jedakan/Lanjutkan, Ubah (form `mode=edit`, terisi), Hapus (dengan konfirmasi)
- [ ] Form 2 kolom + preview sticky
- [ ] Semua toggle kondisional sesuai [State Matrix](#7-logika-kondisional-state-matrix)
- [ ] Chip contoh hilang saat keyword ≥1; Enter menambah chip; × menghapus
- [ ] Helper DM trigger berubah jadi peringatan saat `kata apa pun`
- [ ] Judul pesan utama dinamis
- [ ] Counter `n/20` + maxLength di semua teks tombol
- [ ] Preview live 3 tab dengan aturan bubble & divider
- [ ] `Simpan` disabled sampai valid; modal `Buang perubahan?` saat dirty

**Backend**

- [ ] Webhook comments + messages + messaging_postbacks
- [ ] Matching engine (keywords OR, case-insensitive, whole-word, any)
- [ ] Public reply dengan variasi acak
- [ ] Private reply opener dengan postback button
- [ ] Follow gate (`is_user_follow_business`) dan tombol cek ulang
- [ ] Pesan utama + URL button
- [ ] Dedupe per comment_id, status paused di-skip
- [ ] Event log → "Aktivitas terakhir" + filter inbox "Otomatis"
