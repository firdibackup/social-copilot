# Revisi Buat Konten Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stacked slide layouts, complete slide text, an image attachment in the Buat composer, an "Umum" reference
label, and default design examples per design style.

**Architecture:** Prompt rules live in `src/lib/image-ai.ts` and the style recipes in `src/lib/design-styles.ts`; the
examples are JPEGs in `assets/contoh-desain/` named by key, chosen once per post and stored per slide like reference
images. Attachments are re-encoded on the server, sent straight to 9Router for edits, and stored in the `brand` bucket
for new posts so retries keep them.

**Tech Stack:** Next.js 16.4 (server actions), Supabase (Postgres functions, Storage), sharp, vitest.

**Spec:** `docs/superpowers/specs/2026-10-18-buat-konten-revisi-design.md`

## Global Constraints

- UI copy in Bahasa Indonesia; image prompts in English.
- `HEADLINE_MAX_LENGTH = 300`; attachment notes ≤ 300 code points; attachment data URLs ≤ 4,000,000 characters.
- Example keys match `^[a-z0-9-]{1,60}$`; files at `assets/contoh-desain/<key>.jpg`.
- Attachment paths `<userId>/lampiran/<uuid>.jpg` in bucket `brand`; never log data URLs or signed URLs.
- Input image order: current, attachment, product, reference or example, sibling, logo.
- No commits: the working tree carries earlier uncommitted work; the owner commits.

## Review Focus

- Planner sends a non-string, overlong or all-empty `attachment`: treated as empty, clipped, or replaced on every
  slide by the default note (Task 6 test).
- A stored example key the registry no longer knows: the slide is drawn without it and the skip is reported (Task 5
  test).
- A headline over 300 characters that is one unbroken word, or whose limit falls right after a full stop: cut at
  the limit only when there is no space; a full stop at the limit is kept (Task 6 test).
- Paste with both text and an image: the text lands in the box and the image is attached (Task 10 manual check).
- An attachment path of another user: `loadAttachment` returns null without downloading (Task 4 test).

---

### Task 1: Migration

**Files:** Create `supabase/migrations/20261019010000_konten_lampiran.sql`

**Interfaces:**
- Produces: `post_slides.example text`, `attachment_path text`, `attachment_note text not null default ''`;
  `create_content` reads `example`, `attachment_path`, `attachment_note` per slide and raises `invalid_attachment`;
  `replace_slide(..., p_include_logo boolean, p_example text)`.

- [ ] Drop and re-add `post_slides_headline_check` as `char_length(headline) <= 300`.
- [ ] Add the three columns with checks: `example ~ '^[a-z0-9-]{1,60}$'`,
  `attachment_path ~ '^[0-9a-f-]{36}/lampiran/[0-9a-f-]{36}\.jpg$'`, `char_length(attachment_note) <= 300`.
- [ ] `create or replace function public.create_content` from `20261018010000_aset_website.sql`, plus: raise
  `invalid_attachment` when a slide's `attachment_path` doesn't start with `p_user_id::text || '/'`; insert
  `nullif(example,'')`, `nullif(attachment_path,'')`, `coalesce(attachment_note,'')`.
- [ ] Drop `replace_slide(uuid, uuid, uuid, uuid, text, text, text, text, uuid, uuid, boolean)`, create it with
  `p_example text` last, inserting `example`; revoke from public/anon/authenticated, grant to service_role.

### Task 2: Style examples and stacked recipes

**Files:** Create `assets/contoh-desain/*.jpg` (21 keys from the spec table), `src/lib/design-styles.test.ts`;
modify `src/lib/design-styles.ts`.

**Interfaces:**
- Produces: `type ExampleSet = Partial<Record<SlideRole, string>>`; `DesignStyle.examples: readonly ExampleSet[]`;
  `isStyleExample(value: unknown): value is string`;
  `styleForBrand(brand: { designStyle: string; visualStyle: string } | null): DesignStyle | null` (moved from
  `styleFor` in image-ai); `planStyleExamples(style: DesignStyle | null, roles: (SlideRole | null)[], pick: Picker):
  (string | null)[]`.

- [ ] Crop the tiles (scratchpad script, sharp, JPEG q85, native size) to the 21 keys.
- [ ] Tests: `planStyleExamples` gives every slide its role's key from one picked set; a role missing from the set
  gets null; a one-image post (`[null]`) gets the set's cover; `null` style or no sets gives all null. Every key in
  every style exists as a file and `isStyleExample` accepts exactly those keys. `styleForBrand` keeps the old
  `styleFor` rules.
- [ ] Rewrite side-by-side recipes stacked: minimalis cover, bold isi, elegan isi, ceria cover, editorial isi,
  profesional cover, natural cover, tech cover, plain cover.
- [ ] `npx vitest run src/lib/design-styles.test.ts` passes.

### Task 3: Umum label

**Files:** Modify `src/lib/brand-options.ts`, `src/lib/brand-options.test.ts`,
`src/app/(app)/(halaman)/brand/references-panel.tsx`.

- [ ] Tests: each role takes its own label, else one shared Umum (`single`) image; the cover is never lent;
  a pool of Umum alone fills every slide; one-image post takes cover, else Umum. `REFERENCE_LABELS.single === 'Umum'`.
- [ ] `planReferenceImages`: `chosen[role] = pick(own label) ?? general` with `general = pick(withLabel('single'))`.
- [ ] Label select under one-image references too; panel text explains the labels.

### Task 4: Attachment storage

**Files:** Create `src/lib/attachments.ts`, `src/lib/attachments.test.ts`.

**Interfaces:**
- Produces: `interface Attachment { dataUrl: string; bytes: Uint8Array }`;
  `readAttachment(value: unknown): Promise<Attachment | { error: string } | null>`;
  `saveAttachment(userId: string, attachment: Attachment): Promise<string>`;
  `loadAttachment(userId: string, path: string): Promise<string | null>`; `removeAttachment(path: string): Promise<void>`.

- [ ] Tests: null/''/undefined → null; a number, a non-image data URL, an over-long one → `{ error }`; base64 that
  isn't an image → `{ error: 'Gambar lampiran tidak bisa dibaca.' }`; a real PNG → 640 px JPEG data URL and its
  bytes; save uploads `user/lampiran/<uuid>.jpg` as image/jpeg; load refuses `other-user/lampiran/x.jpg` without
  downloading.
- [ ] Implement with `toReferenceDataUrl` (sharp) and the `brand` bucket.

### Task 5: Image prompt and packing

**Files:** Modify `src/lib/image-options.ts`, `src/lib/image-ai.ts`, `src/lib/image-ai.test.ts`.

**Interfaces:**
- Consumes: `styleForBrand`, `isStyleExample` (Task 2); `loadAttachment` (Task 4).
- Produces: `ImageInput.example: string | null`; `ImageInput.attachment: ImageAttachment | null` with
  `type ImageAttachment = { note: string } & ({ dataUrl: string } | { path: string })`;
  `InputImageKind` gains `'attachment' | 'example'`; exported `LAYOUT_RULES`.

- [ ] Tests (prompt): every prompt has the stacked layout and inside-the-frame rules; with a headline, the
  never-abbreviate line; an isi slide has the text-leads line, a cover doesn't; an example is described with its role,
  "do not copy its words, logo, brand name" and, only with brand colours, "use the brand colours"; an example skips the
  style's layout recipe; an attachment line quotes its note and says the instruction wins; an Umum reference on an isi
  slide takes only style and keeps the recipe, on a cover follows composition.
- [ ] Tests (drawImage): order current → attachment → product → example; an example key is read from
  `assets/contoh-desain`; an unknown key is skipped as `contoh gaya (tidak ditemukan)`; a stored attachment loads by
  path through `loadAttachment`.
- [ ] Implement; `npx vitest run src/lib/image-ai.test.ts` passes.

### Task 6: Complete text and the planner's attachment

**Files:** Modify `src/lib/image-options.ts` (`HEADLINE_MAX_LENGTH = 300`), `src/lib/content-ai.ts`,
`src/lib/carousel-guide.ts`, `src/lib/content-ai.test.ts`, `src/lib/carousel-guide.test.ts`.

**Interfaces:**
- Produces: `PlannedSlide.attachment: string`; `buildContentMessages(..., products = [], attachment: string | null = null)`;
  `parseContentPlan(content, count, products = [], hasAttachment = false)`;
  `planContent(userId, request, save, products = [], attachment: string | null = null)`;
  `buildSlideRevisionMessages(slide, instruction, attachment: string | null = null)`;
  `reviseSlide(slide, instruction, attachment: string | null = null)`; `ATTACHMENT_NOTE_MAX_LENGTH = 300`;
  `DEFAULT_ATTACHMENT_NOTE = "Follow this image's layout and design style."`.

- [ ] Tests: rules forbid "yg", "dgn" style abbreviations and allow 300 characters; guide asks inner slides for
  2–3 complete sentences or 3–5 points; a 400-character headline is cut at its last sentence end; one unbroken
  word is cut at 300; a full stop at the limit is kept; with an attachment the user message carries an `image_url`
  part and asks for `attachment`; parse keeps notes only when an attachment was sent, clips them, and fills every
  slide with the default when all are empty; `planContent` logs `attachment: true|false`, never the data URL;
  revision with an attachment carries the image part.
- [ ] Implement; `npx vitest run src/lib/content-ai.test.ts src/lib/carousel-guide.test.ts` passes.

### Task 7: Slide records and content posts

**Files:** Modify `src/lib/slides.ts`, `src/lib/posts.ts`, `src/lib/slides.test.ts`, `src/lib/posts-content.test.ts`.

**Interfaces:**
- Produces: `SlideRecord.example`, `.attachmentPath`, `.attachmentNote`; `SlideReference.example: string | null`;
  `createContentPost(userId, request, plan, references, attachmentPath: string | null = null)`;
  `Replacement.example: string | null`.

- [ ] Tests: `create_content` slides carry `example`, and `attachment_path` + `attachment_note` only for slides with
  a note; `replace_slide` sends `p_example`.

### Task 8: Content actions

**Files:** Modify `src/app/(app)/buat/content-actions.ts`.

- [ ] `chooseSlideReferences`: Otomatis with an empty pool → `planStyleExamples(styleForBrand(brand), roles,
  pickRandom)`; Tanpa → nothing; a group → its images only.
- [ ] `createContentAction`: `readAttachment(input.attachment)`; planner gets its data URL; inside `save`, store it
  only when a slide uses it, remove it again when `createContentPost` throws.
- [ ] `generateSlideAction`: pass `example`, the stored attachment (`{ path, note }`), and a sibling only without a
  reference image or example.
- [ ] `editSlideAction`: `readAttachment`, pass it to `reviseSlide` and `drawImage` with the instruction as note;
  keep `example` in `replaceSlide`; log `attachment: boolean`.

### Task 9: Aset

**Files:** Modify `src/lib/assets.ts`, `src/lib/assets.test.ts`, `src/app/(app)/(halaman)/aset/asset-library.tsx`.

- [ ] Test: product groups count and send only active non-AI photos.
- [ ] Hide Aktif/Dijeda and the group select for `origin === 'ai'`; never dim AI photos.

### Task 10: Composer, mockup, editor

**Files:** Modify `src/app/(app)/buat/composer.tsx`, `post-mockup.tsx`, `content-editor.tsx`.

- [ ] Composer: Enter = new line, Ctrl/⌘+Enter sends; JS auto-height; `+` and paste attach one image
  (`toReferenceJpeg` → data URL), thumbnail with "Hapus lampiran"; `canAttach` hides both;
  `onSend(text, attachment)`.
- [ ] Mockup: `onAdd` adds an add card after the last slide ("Tambah foto", "n/10 slide") and a `+` tile in the strip.
- [ ] Editor: send `referenceId` as chosen (Otomatis default) even without references; pass attachments; open the
  picker from the mockup; empty new post shows "Pakai foto sendiri".
- [ ] Manual check list: Shift+Enter and Enter make new lines; Ctrl/⌘+Enter sends; paste screenshot attaches;
  paste text+image keeps the text; Caption target hides the attachment; add card opens the picker.

### Task 11: Docs and verification

**Files:** Modify `CLAUDE.md`.

- [ ] Status, Buat Konten, Gambar AI, Brand kit, Aset bullets describe the new behaviour.
- [ ] `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` pass.
