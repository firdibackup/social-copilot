# Buat AI (teks) — Desain

- **Tanggal:** 2026-10-16
- **Status:** disetujui lewat brainstorming. Review spec dan rencana tertulis dilewati atas permintaan owner.
- **Cakupan PRD:** §5 P4 (AI Content Studio) bagian teks, §6 Flow D, §10 AI, dan §14 langkah 5.

## Tujuan dan kriteria sukses

Owner menulis caption lebih cepat di editor `/buat`. Ada empat bantuan AI: membuat caption dari brief singkat, meminta ide post, mengubah nada atau panjang caption, dan menambah hashtag. Hasil AI hanya mengisi editor. Post tetap disimpan atau dijadwalkan lewat tombol yang sudah ada.

Tahap ini sukses kalau:

1. Di post baru, owner bisa mengisi Topik, klik **Buat 3 caption**, memilih satu hasil, lalu menyimpannya sebagai draft.
2. Keempat aksi (caption, ide, ubah, hashtag) berhasil dengan `ROUTER_MODEL` sungguhan.
3. Error dari 9Router (key salah, model salah, timeout, atau balasan bukan JSON) tampil sebagai pesan bahasa Indonesia tanpa membocorkan key.

## Keputusan

| Topik | Keputusan | Alasan |
|---|---|---|
| Model | `ROUTER_MODEL=cc/claude-haiku-4-5-20251001` | Combo `Hermes-daily` (default di PRD) membalas 200 dengan isi "Gemini 3.5 Flash is no longer available…", sehingga fallback combo tidak jalan. Haiku 4.5 menjawab keempat tugas dengan JSON valid dalam 2–10 detik. Model dibaca dari env, jadi bisa diganti tanpa mengubah kode. |
| Letak | Panel lipat **Asisten AI** di bawah caption di `/buat` | Pratinjau di kanan tetap terlihat dan langsung berubah saat hasil dipakai. Dialog ditolak karena menutupi pratinjau. |
| Cara panggil | Server action yang dipanggil dari event handler | Polanya sama dengan kode yang ada, dan Next sudah memeriksa `Origin` (CSRF). Route Handler ditolak karena harus memeriksa `Origin` sendiri. Akibatnya, server action dikirim satu per satu per tab, jadi **Simpan** menunggu AI selesai. |
| Streaming | Tidak | Jawabannya JSON, dan streaming JSON parsial menambah kerumitan. Waktu tunggu terlama sekitar 10 detik ditandai teks "AI sedang menulis…". |
| Bentuk jawaban | JSON lewat instruksi prompt, tanpa `response_format` | Haiku membalas JSON murni tanpa `response_format`, dan tidak semua provider di 9Router menerimanya. Parser tetap menerima JSON di dalam pagar ```` ```json ````. |
| Gambar AI | Ditunda | `GET /v1/models` (dicek 2026-10-16) belum berisi model gambar. |
| Batas pemakaian | 100 permintaan per 24 jam bergulir | Provider di 9Router memakai langganan owner yang juga dipakai alat lain. Batas ini mencegah loop atau klik berulang menghabiskan kuota. |
| Riwayat | Tabel `ai_generations`, tanpa UI | Dipakai untuk batas harian dan debugging. PRD meminta tabel ini. |

## Temuan 9Router (dicek 2026-10-16)

- **Endpoint:** base URL `ROUTER_API_BASE_URL` sudah berakhiran `/v1`. Autentikasi memakai `Authorization: Bearer <ROUTER_API_KEY>`.
- **SSE bawaan:** `POST /chat/completions` tanpa field `stream` membalas `text/event-stream`. Request wajib mengirim `stream: false`.
- **Error terselubung:** combo bisa membalas 200 dengan pesan error provider sebagai isi jawaban. Contohnya `Hermes-daily` dengan pesan "Gemini 3.5 Flash is no longer available…". Status 200 tidak menjamin jawaban valid, jadi hanya JSON yang lolos validasi yang dianggap berhasil.
- **Bentuk error:** `{ "error": { "message": "[provider/model] [status]: …" } }`, dengan status HTTP asli (400, 404, 429, dan seterusnya).
- **Model lain:** `ag/gemini-3.7-flash-*` membalas 404, dan `cx/gpt-5.4-mini` membalas 400 karena tidak didukung akun ChatGPT. `Hermes-heavy` jalan (Claude Sonnet 5, sekitar 6,5 detik untuk 3 caption).
- **Overhead:** provider `cc/` menambah sekitar 2.100 token prompt per permintaan.
- **Latensi Haiku 4.5:** 3 caption sekitar 9,5 detik, 5 ide sekitar 3,5 detik, tulis ulang dan hashtag sekitar 1,7 detik.

## Model data

Satu migrasi baru, `20261016000000_ai_generations.sql`, dengan pola yang sama seperti migrasi sebelumnya: RLS aktif tanpa policy, dan hak akses tabel serta sequence dicabut dari `anon` dan `authenticated`.

- **`ai_generations`**:
  - `id` (bigint identity).
  - `task` (CHECK: `captions`, `ideas`, `rewrite`, `hashtags`).
  - `input` (jsonb): request yang sudah divalidasi.
  - `output` (jsonb): daftar opsi yang ditampilkan, null kalau gagal.
  - `model`: nilai `ROUTER_MODEL` saat itu.
  - `status` (CHECK: `ok`, `failed`), `error`, `duration_ms`.
  - `created_at`, dengan index untuk hitungan 24 jam.
- Nama kolom PRD dipetakan menjadi `task_type` → `task`, `input_summary` → `input`, `output_text` → `output`, dan `model_identifier` → `model`.

## Tugas AI

### Input

- **Brief** (untuk caption dan ide):
  - Topik: wajib, 1–300 karakter.
  - Tujuan: Promosi atau jualan, Edukasi atau tips, Interaksi dengan pengikut, Cerita di balik layar, Pengumuman.
  - Nada: Santai, Profesional, Lucu, Hangat dan inspiratif.
  - Audiens: opsional, maksimal 150 karakter.
  - Jumlah foto: 0–10, diambil otomatis dari editor. Ditulis di prompt sebagai "belum ada foto", "foto tunggal", atau "carousel N foto".
- **Ubah caption:** Lebih santai, Lebih profesional, Lebih singkat, Lebih panjang, + CTA. Caption wajib terisi, maksimal 2.200 karakter.
- **Hashtag:** caption wajib terisi. Kalau caption sudah memakai 30 hashtag, permintaan ditolak sebelum memanggil AI.

### Jawaban dan hasil

| Tugas | Jawaban JSON | Hasil | Tombol |
|---|---|---|---|
| `captions` | `{"captions": [3 string]}` | Maksimal 3 opsi | **Pakai caption ini**: mengganti caption |
| `ideas` | `{"ideas": [5 string]}` | Maksimal 5 opsi | **Jadikan topik**: mengisi kolom Topik |
| `rewrite` | `{"caption": string}` | 1 opsi | **Pakai caption ini**: mengganti caption |
| `hashtags` | `{"hashtags": [string]}` | 1 opsi berisi hashtag yang dipisah spasi | **Tambahkan ke caption**: ditaruh di akhir, setelah satu baris kosong |

Normalisasi:

- Semua string di-trim. String kosong dan duplikat dibuang.
- Hashtag dibentuk ulang menjadi `#` diikuti huruf, angka, atau garis bawah, dengan pola yang sama seperti penghitung caption. Hashtag yang sudah ada di caption dibuang (tanpa membedakan huruf besar kecil). Jumlahnya dipotong ke `min(10, 30 − hashtag yang ada)`.
- Ide dipotong ke 300 karakter, supaya **Jadikan topik** selalu lolos validasi Topik.
- Jawaban yang bukan JSON, bentuknya salah, atau kosong setelah normalisasi dianggap gagal. Pesan error menampilkan 120 karakter pertama jawaban itu.

### Prompt

- **System prompt** (bahasa Indonesia):
  - AI adalah penulis caption untuk satu akun bisnis atau kreator di Indonesia.
  - Ikuti batas Instagram.
  - Tanpa Markdown.
  - Jangan mengarang fakta atau klaim yang tidak ada di brief, misalnya harga, tanggal, stok terbatas, atau "kualitas premium".
  - Balas hanya dengan satu objek JSON.
- **Pesan user:**
  - Instruksi tugas dan format JSON, lalu data brief per baris.
  - Teks dari owner (topik dan caption) diapit `"""`.
  - Caption diminta 2–4 paragraf pendek, sekitar 300–700 karakter sebelum hashtag, dengan pembuka yang menarik, CTA sesuai tujuan, dan 3–8 hashtag di baris terakhir.

## Server

### `src/lib/nine-router.ts`

- `chatCompletion(messages)` mengirim `POST {ROUTER_API_BASE_URL}/chat/completions` dengan isi `{ model: ROUTER_MODEL, messages, stream: false, max_tokens: 4096 }`, lalu mengembalikan teks jawaban.
- Timeout 60 detik, karena combo bisa mencoba beberapa provider berurutan.
- **`RouterApiError(message, status)`:**
  - Status 0 berarti gangguan jaringan atau timeout. Pesannya hanya nama error, tanpa URL.
  - Selain itu, pesan diambil dari `error.message` di body, atau `HTTP <status>`.
  - Status 200 tanpa `choices[0].message.content` juga dianggap error.
- Key hanya ada di header dan tidak pernah masuk pesan error maupun log.

### `src/lib/ai.ts`

- `parseAiRequest(input: unknown)` memvalidasi bentuk, nilai pilihan, dan panjang teks, lalu mengembalikan `{ request }` atau `{ error }`.
- `buildMessages(request)` menyusun system prompt dan pesan user.
- `parseOptions(request, content)` membaca JSON dari jawaban (toleran terhadap pagar dan teks di sekitarnya), memvalidasi bentuknya, dan menormalisasi hasilnya. Kalau gagal, fungsi melempar `AiOutputError`.
- `runAiTask(request)`:
  - Menghitung baris `ai_generations` dalam 24 jam terakhir. Kalau sudah 100 atau lebih, fungsi melempar `AiLimitError` tanpa memanggil AI.
  - Setelah itu memanggil `chatCompletion` dan `parseOptions`.
  - Setiap permintaan yang lolos cek batas dicatat sebagai `ok` atau `failed`, termasuk yang gagal sebelum sampai ke 9Router karena konfigurasi belum lengkap. Kalau pencatatan gagal, hasil tetap dikembalikan dan kegagalannya hanya masuk log server.
- `aiErrorMessage(error)` memetakan error ke pesan untuk owner:

| Error | Pesan |
|---|---|
| `ConfigError` | Konfigurasi AI belum lengkap: … |
| `AiLimitError` | Batas 100 permintaan AI per 24 jam sudah tercapai. Coba lagi nanti. |
| Status 0 | Layanan AI tidak bisa dihubungi atau terlalu lama menjawab. Coba lagi. |
| 200 tanpa isi | Jawaban AI kosong. Coba lagi, atau ganti ROUTER_MODEL kalau terus terjadi. |
| 401, 403 | API key 9Router ditolak. Periksa ROUTER_API_KEY di .env.local. |
| 404 | Model AI tidak ditemukan. Periksa ROUTER_MODEL di .env.local. |
| 429 | Kuota AI sedang habis. Coba lagi beberapa menit lagi. |
| ≥ 500 | Layanan AI sedang bermasalah. Coba lagi nanti. |
| 4xx lainnya | Permintaan ditolak layanan AI (HTTP …). Periksa ROUTER_MODEL di .env.local. |
| `AiOutputError` | Jawaban AI tidak bisa dibaca ("…"). Coba lagi, atau ganti ROUTER_MODEL kalau terus terjadi. |
| Lainnya | AI gagal dijalankan: database tidak bisa diakses. Periksa Supabase dan migrasi terbaru. |

### `src/app/(app)/buat/ai-actions.ts`

`generateAction(input)` menjalankan `assertLocalRequest()`, lalu `parseAiRequest`, lalu `runAiTask`. Hasilnya `{ options }` atau `{ error }`. Error dicatat lewat `describeError` dengan prefiks `[ai]`. Action ini tidak memanggil `refresh()`, jadi state editor tidak terganggu.

### Env

`ROUTER_API_BASE_URL`, `ROUTER_API_KEY`, dan `ROUTER_MODEL` ditambahkan ke `env()`. Ketiganya hanya di server, tanpa prefiks `NEXT_PUBLIC_`.

## Panel Asisten AI

Komponen `src/app/(app)/buat/ai-assistant.tsx` dipasang di `post-editor.tsx` setelah penghitung caption, dan hanya kalau post bisa diedit. Komponen menerima `caption`, `photoCount`, dan `onCaptionChange`.

- `<details>` dengan judul **Asisten AI**, tertutup secara bawaan.
- **Tulis baru:** Topik (textarea 2 baris), Tujuan, Nada, Audiens, lalu tombol **Buat 3 caption** dan **Minta ide**. Keduanya nonaktif kalau Topik kosong.
- **Ubah caption:** tombol Lebih santai, Lebih profesional, Lebih singkat, Lebih panjang, + CTA, dan + Hashtag. Semuanya nonaktif kalau caption kosong.
- **Saat AI berjalan:** semua tombol AI nonaktif, dan teks "AI sedang menulis…" diumumkan lewat `aria-live`.
- **Hasil:** satu daftar kartu. Teks ditampilkan apa adanya (`whitespace-pre-wrap`), dengan tombol sesuai tabel di atas. Hasil baru menggantikan hasil lama.
- **Urungkan:** setelah caption diganti atau ditambah, muncul "Caption diganti. **Urungkan**" yang mengembalikan caption sebelumnya. Hanya satu langkah.
- **Enter:** Enter di `<input>` dalam panel dicegah. Panel berada di dalam form post, jadi Enter bisa men-submit form dengan tombol pertamanya, yaitu **Jadwalkan**.
- **Error:** server action yang melempar error (koneksi putus, build berganti) ditampilkan sebagai "Permintaan terputus. Coba lagi."

## Keamanan

- Key 9Router hanya ada di server dan di header request.
- Action memeriksa ulang `assertLocalRequest()`, dan Next memeriksa `Origin`. Semua input divalidasi tipe, nilai pilihan, dan panjangnya.
- Jawaban AI dirender sebagai teks, tidak pernah sebagai HTML.
- Teks owner masuk prompt di dalam `"""`. Prompt injection hanya bisa memengaruhi hasil untuk owner sendiri.
- Batas 100 permintaan per 24 jam.

## Tes

### Otomatis (vitest)

- **`chatCompletion`:**
  - Mengirim POST ke `/chat/completions` dengan bearer, model, dan `stream: false`. Garis miring di akhir base URL tidak membuat path ganda.
  - Error HTTP membawa `error.message` dan statusnya.
  - Gangguan jaringan dan timeout menjadi status 0, tanpa URL di pesan.
  - Status 200 tanpa isi dianggap error.
- **`parseAiRequest`:** menolak tugas, tujuan, nada, atau gaya yang tidak dikenal, topik kosong, teks terlalu panjang, jumlah foto di luar 0–10, dan caption yang sudah berisi 30 hashtag.
- **`buildMessages`:** memuat topik, tujuan, nada, audiens, format foto, dan caption di dalam `"""`.
- **`parseOptions`:**
  - Menerima JSON murni, JSON berpagar, dan JSON yang diapit teks.
  - Pesan "Gemini 3.5 Flash is no longer available" menghasilkan `AiOutputError` berisi potongan pesannya.
  - Bentuk yang salah ditolak. Jumlah opsi dipotong, dan duplikat serta string kosong dibuang.
  - Hashtag diberi `#`, karakter tidak valid dibuang, hashtag yang sudah ada dibuang, dan jumlahnya dipotong ke 30 − yang ada.
- **`runAiTask`:**
  - Batas tercapai berarti AI tidak dipanggil.
  - Keberhasilan dicatat `ok`, dan kegagalan dicatat `failed` lalu error dilempar ulang.
  - Pencatatan yang gagal tidak menghilangkan hasil.
- **`aiErrorMessage`:** setiap baris tabel pemetaan.
- **`generateAction`:** memanggil `assertLocalRequest`, input tidak valid tidak memanggil AI, dan error dipetakan jadi pesan.

### Manual

- Dev server dengan Haiku:
  - Keempat aksi berhasil, termasuk Pakai, Urungkan, dan Jadikan topik.
  - Caption hasil AI tersimpan sebagai draft.
  - Enter di Audiens tidak menjadwalkan post.
- `ROUTER_MODEL=Hermes-daily` menampilkan pesan "Jawaban AI tidak bisa dibaca ("Gemini 3.5 Flash…")".
- Hasil `npm run build`: `/buat` tetap ◐.

## Urutan pengerjaan

1. Migrasi `ai_generations` dan kunci env.
2. `nine-router.ts`.
3. `ai.ts`: validasi, prompt, parsing, `runAiTask`, dan pemetaan error.
4. `ai-actions.ts`.
5. `ai-assistant.tsx` dan pemasangannya di editor.
6. `ROUTER_MODEL` di `.env.local`, lalu `.env.example` dan CLAUDE.md.
7. Lint, typecheck, test, build, dan uji manual.

## Di luar cakupan

- Gambar AI, sampai 9Router punya model gambar
- Caption dari isi foto (vision)
- Profil brand atau gaya bahasa akun yang tersimpan
- Streaming jawaban
- Halaman riwayat AI
- Saran balasan DM (fase Balasan)
- Pengaturan model AI dari UI

## Batasan yang diketahui

- Selama AI menulis, server action lain dari tab yang sama (Simpan, Jadwalkan) menunggu giliran.
- Batas harian menghitung semua permintaan yang lolos cek batas, termasuk yang gagal.
- Kualitas dan panjang caption bergantung pada model. Haiku kadang menambah klaim yang tidak ada di brief, jadi owner tetap perlu membaca hasilnya sebelum memakai.
- Hasil AI yang belum dipakai hilang kalau editor ditutup. Hasil itu hanya tersimpan di `ai_generations`.
