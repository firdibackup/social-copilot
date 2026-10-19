# Website → Aset — Implementation Plan

**Goal:** Mengubah website brand menjadi katalog Aset berkelompok, memakai katalog itu untuk Brand, dan mempertahankan produk asli saat Buat Konten membuat atau mengedit slide.

**Architecture:** `assets` tetap menjadi sumber semua foto publishable. Metadata organisasi ditambahkan lewat `asset_groups` dan kolom asal/status pada `assets`. Crawl website menghasilkan kumpulan halaman dan kandidat gambar yang dibatasi; gambar yang lolos dinormalisasi menjadi JPEG, disimpan ke Aset, lalu dikatalogkan AI per batch. `post_slides.product_group_id` menyimpan produk yang dipilih planner sehingga retry dan edit konsisten.

**Tech Stack:** Next.js 16.4, React 19, Supabase Postgres + Storage, sharp, 9Router, vitest.

**Spec:** `docs/superpowers/specs/2026-10-18-aset-website-design.md`

## Constraints

- Setiap read daftar difilter `user_id` dan `account_id`; per-ID write minimal difilter `user_id`.
- RLS tetap aktif tanpa policy; `anon` dan `authenticated` tidak mendapat akses tabel/RPC.
- Aset yang dijeda masih boleh dipakai post lama dan tetap muncul di pemilih foto manual.
- Tidak ada URL, signed URL, token, atau base64 gambar di log.
- AI output hanya draf yang dapat diedit.
- Perubahan skema hanya di migrasi baru.
- Jangan mengubah atau me-revert perubahan working tree lain.

## Task 1: Fondasi data Aset

**Files:**
- Create `supabase/migrations/20261018010000_aset_website.sql`
- Modify `src/lib/assets.ts`
- Modify `src/lib/assets.test.ts`
- Modify `src/lib/account-filters.test.ts`

- [x] Buat `asset_groups` dengan kategori, judul, deskripsi, origin, source URL, account ownership, timestamps, RLS, trigger `stamp_account`, dan indeks.
- [x] Tambahkan `origin`, `group_id`, `group_position`, `is_active`, `source_url`, `content_hash` ke `assets`.
- [x] Backfill `origin='ai'` untuk aset yang pernah dipakai `post_slides`; sisanya `upload`.
- [x] Tambahkan unique index scoped untuk source URL dan content hash website.
- [x] Tambahkan task `website_catalog` ke CHECK `ai_generations.task`.
- [x] Perluas `Asset` dan tambahkan `AssetGroup`, `listAssetLibrary`, CRUD kelompok, pindah foto, serta aktif/jeda.
- [x] Pertahankan `listAssets` sebagai daftar datar semua foto agar pemilih post tidak berubah.
- [x] Tambahkan opsi origin/account/group pada `createAsset`; caller lama tetap valid.
- [x] Tambahkan unit test query, mapping, metadata create, dan active toggle.

## Task 2: UI Aset

**Files:**
- Modify `src/app/(app)/(halaman)/aset/page.tsx`
- Modify `src/app/(app)/(halaman)/aset/actions.ts`
- Modify `src/app/(app)/(halaman)/aset/delete-asset-button.tsx`
- Create komponen client seperlunya di folder Aset
- Modify `src/app/(app)/buat/content-actions.ts`

- [x] Tampilkan tab `Milik saya` dan `Hasil AI`.
- [x] Render kelompok dengan kategori, judul, deskripsi, dan urutan `Image N`.
- [x] Render foto tanpa kelompok dalam kelompok bawaan tampilan.
- [x] Tambahkan aksi Aktif/Jeda per foto.
- [x] Tambahkan form membuat dan mengubah kelompok serta memindahkan foto.
- [x] Tandai upload browser sebagai `upload` dan hasil slide sebagai `ai`.
- [x] Pastikan pemilih foto tetap menerima semua origin dan semua status.

## Task 3: Crawl dan impor website

**Files:**
- Modify `src/lib/web-fetch.ts`
- Modify `src/lib/web-fetch.test.ts`
- Modify `src/lib/website.ts`
- Modify `src/lib/website.test.ts`
- Modify `src/lib/slide-image.ts`
- Modify `src/lib/slide-image.test.ts`
- Create `src/lib/website-import.ts`
- Create `src/lib/website-import.test.ts`

- [x] Tambahkan pemeriksaan alamat DNS publik untuk request dan redirect tanpa mencatat URL.
- [x] Ekstrak link internal, gambar biasa/lazy/srcset, alt text, konteks teks, dan kandidat logo.
- [x] Crawl homepage + maksimal 10 halaman internal dengan prioritas halaman produk.
- [x] Terapkan batas request, waktu, byte, kandidat gambar, dan maksimal 40 hasil.
- [x] Normalisasi URL dan dedupe kandidat.
- [x] Fetch kandidat dengan batas, tolak gambar kecil/ikon/ekstrem, dan hitung content hash.
- [x] Konversi raster valid menjadi JPEG server-side dengan batas piksel dan ukuran.
- [x] Simpan idempotent ke Aset sebagai `website` dengan provenance.

## Task 4: Katalog AI website

**Files:**
- Create `src/lib/website-ai.ts`
- Create `src/lib/website-ai.test.ts`
- Modify `src/lib/ai.ts`
- Modify `src/lib/billing-options.ts`
- Modify `src/lib/billing-options.test.ts`
- Modify `src/app/(app)/(halaman)/admin/ui.ts`
- Modify `src/app/(app)/(halaman)/aset/actions.ts`
- Modify UI Aset

- [x] Tambahkan task `website_catalog` seharga 10 kredit.
- [x] Buat thumbnail kecil dan pack batch di bawah `VISUAL_BODY_BUDGET`.
- [x] Prompt AI mengembalikan assignment ordinal, kategori, judul, dan deskripsi.
- [x] Validasi semua ID, kategori, panjang teks, dan duplikat.
- [x] Simpan kelompok/assignment di dalam callback `runLogged`.
- [x] Jangan simpan data gambar atau URL bertoken dalam log.
- [x] Tambahkan tombol Aset untuk membaca website, ringkasan halaman/gambar, warning, dan hasil impor.

## Task 5: Brand multi-halaman dan fallback visual

**Files:**
- Modify `src/lib/brand-ai.ts`
- Modify `src/lib/brand-ai.test.ts`
- Modify `src/lib/brand.ts`
- Modify `src/app/(app)/(halaman)/brand/actions.ts`
- Modify `src/app/(app)/(halaman)/brand/actions.test.ts`
- Modify `src/app/(app)/(halaman)/brand/brand-form.tsx`

- [x] Ubah sumber website profil menjadi daftar halaman bounded.
- [x] Tegaskan bahwa isi halaman adalah data, bukan instruksi.
- [x] Return saran logo lintas halaman; sarankan hanya jika belum ada logo.
- [x] Muat logo dan foto website aktif sebagai sumber visual fallback.
- [x] Ambil warna fallback dari logo.
- [x] Aktifkan analisis visual ketika referensi desain kosong tetapi fallback tersedia.
- [x] Tetap hanya mengisi draf form; tidak menyimpan otomatis.

## Task 6: Produk di Buat Konten

**Files:**
- Modify `src/lib/content-options.ts` dan test
- Modify `src/lib/content-ai.ts` dan test
- Modify `src/lib/posts.ts` dan test
- Modify `src/lib/slides.ts` dan tambahkan test
- Modify `src/lib/image-options.ts`
- Modify `src/lib/image-ai.ts` dan test
- Modify `src/app/(app)/buat/page.tsx`
- Modify `src/app/(app)/buat/content-editor.tsx`
- Modify `src/app/(app)/buat/content-actions.ts`
- Create migrasi lanjutan jika signature SQL perlu dipisah

- [x] Tambahkan pilihan Produk `auto`, tanpa, atau group UUID.
- [x] Muat hanya kelompok kategori Produk dengan minimal satu foto aktif.
- [x] Berikan kandidat kelompok/fakta ke planner dan parse `productGroupId` per slide.
- [x] Tolak ID hasil AI yang tidak ada pada kandidat.
- [x] Simpan group produk pada `post_slides` lewat `create_content`.
- [x] Muat beberapa foto aktif kelompok produk sebagai input gambar.
- [x] Prioritaskan current → product → reference → sibling → logo.
- [x] Prompt harus mempertahankan bentuk, warna, kemasan, dan label produk.
- [x] Retry memakai row yang sama; edit membawa product group yang sama ke `replace_slide`.

## Task 7: Dokumentasi dan verifikasi

**Files:**
- Modify `CLAUDE.md`
- Modify `docs/kredit-ai.md`
- Modify privacy copy bila crawl/import sudah aktif

- [x] Jalankan test terfokus setelah tiap task.
- [x] Jalankan `npm test`.
- [x] Jalankan `npm run typecheck`.
- [x] Jalankan `npm run lint`.
- [x] Baca diff akhir dan pastikan tidak ada secret, URL bertoken, atau perubahan tidak terkait.
- [x] Minta user menjalankan `npm run db:push` karena database lokal tidak tersedia.
