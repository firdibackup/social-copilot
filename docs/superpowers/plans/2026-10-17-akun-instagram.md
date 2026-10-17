# Data per Akun Instagram dan Referensi Carousel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every dashboard row belongs to one Instagram account; switching accounts hides the old account's data (it returns on reconnect), a new account fills its brand kit and 3 design references from Instagram for free, and carousel references keep every slide with Cover/Isi/CTA labels that Buat Konten maps by slide position.

**Architecture:** A nullable `account_id text` (the Instagram user id) on the account-scoped tables. A `before insert` trigger stamps it from the user's current `instagram_connections` row, so no insert path can forget it; reads filter explicitly by the `accountId` that the new `requireAccount()` gate returns. `brand_references` becomes a group with a child table `brand_reference_images`. Disconnecting and switching accounts run as SQL functions. The new-account fill runs in `after()` from the Instagram callback.

**Tech Stack:** Next.js 16.4 (Cache Components, `after()` from `next/server`), Supabase Postgres (self-hosted, service role, RLS without policies), vitest, sharp.

**Spec:** `docs/superpowers/specs/2026-10-17-akun-instagram-design.md`. Executors read the spec first. The owner confirmed on 2026-10-17 that the old account's data is hidden, never deleted.

## Global Constraints

- UI text is in Bahasa Indonesia. Exact copy from the spec: modal title `Putuskan @username?`, sentence `Semuanya kembali kalau @username dihubungkan lagi.`, buttons `Batal` and `Putuskan`, worker error `Akun Instagram berbeda`, reconnect hint `Pastikan masuk dengan @lama`, Brand banner `Menyiapkan brand dari @akun…`, picker badge `Carousel · N`.
- Account key = `instagram_user_id` from Instagram Login (`instagram_connections.instagram_user_id`).
- Account-scoped tables: `brand_kit`, `brand_references`, `assets`, `posts`, `content_ideas`, `dm_conversations`, `dm_messages`, `dm_settings`, `dm_templates`. `facebook_connections` is keyed by user + `instagram_user_id`.
- `account_id` is a display filter, not a security boundary: per-id actions keep filtering by `user_id` only. Only actions that go out to Instagram also check the account (scheduling, worker, sending a DM).
- Credits and subscription stay per user (`ai_generations` and `payments` get no account).
- Labels: `cover`, `isi`, `cta`, `single`. A group stores at most 20 images. `MAX_REFERENCES` (30) counts groups. `MAX_IMPORT` (12) counts posts.
- The auto-fill imports at most 3 of the newest non-video posts, costs 0 credits, still logs to `ai_generations`, and runs once per account (when no `brand_kit` row exists for user + account).
- Call `requireAccount()` and `requireUser()` outside any `try`, because `redirect()` throws.
- Never log URLs, tokens or signed URLs. Log through `describeError()`.
- Schema changes go only in the new migration `supabase/migrations/20261017000000_akun_instagram.sql`. Never edit applied migrations.
- Do not commit `package-lock.json`. Its working-tree change (entry order only) predates this work.

## Review Focus

1. **Switching accounts while a post is due.** A post of @a that is `publishing` when the owner connects @b must never go out on @b: the worker compares `posts.account_id` with the connection right before any container call. Test: Task 9.
2. **Reconnecting @a after editing its brand.** The auto-fill must not run again, and an orphan brand kit adopted at migration time counts as existing. Test: Task 8 (callback with an existing kit does not call `after`).
3. **A carousel with video slides, or one where Instagram omits `children`.** Video slides use their thumbnail and are skipped without one; a carousel without `children` falls back to the cover alone as `single`. Test: Task 4 `toPosts` cases.
4. **Composer reference for a slide count that doesn't match the group.** A 7-slide post from a 3-image group cycles `isi`; a group without `cta` falls back to the cover. Test: Task 3 `pickReferenceImage` table.
5. **A hidden row edited through a crafted id.** Reading succeeds by user, but scheduling a post of a hidden account is refused (`save_post` raises `wrong_account`, `retryPost` filters by account) and a reply to a hidden conversation is refused. Test: Tasks 2 and 10.

---

## File Map

| File | Change |
|---|---|
| `supabase/migrations/20261017000000_akun_instagram.sql` | new: columns, trigger, keys, group table, SQL functions |
| `src/lib/auth.ts` | `requireAccount()` |
| `src/lib/connection.ts` | `disconnectInstagram`, `draftScheduledPosts`, `claimOrphanRows` |
| `src/lib/brand-options.ts` | `ReferenceLabel`, `labelsForCount`, `pickReferenceImage`, `colorsFromPalettes`, group types |
| `src/lib/instagram.ts`, `src/lib/facebook.ts` | `children` on media, `InstagramPost.images` |
| `src/lib/brand.ts` | groups, account filters, partial kit update, `sync_status` |
| `src/lib/brand-sync.ts` | new: `syncNewAccount()` |
| `src/lib/image-palette.ts` | new: server palette with sharp |
| `src/lib/posts.ts`, `assets.ts`, `ideas.ts`, `dm.ts`, `facebook-connection.ts` | `accountId` on reads |
| `src/lib/brand-ai.ts` | optional `cost` on `analyzeProfile` and `analyzeVisual` |
| `src/lib/image-ai.ts` | reference image chosen by slide |
| `src/worker/publish.ts` | account check |
| `src/app/api/auth/instagram/callback/route.ts` | switch, adopt, auto-fill |
| `src/app/(app)/(halaman)/pengaturan/*` | disconnect modal, reconnect hint, "connect first" notice |
| `src/app/(app)/(halaman)/brand/*` | slideshow cards, label select, carousel badge, sync banner |
| pages and actions of Brand, Buat, Kalender, Aset, Balasan | `requireAccount()` |
| `CLAUDE.md` | architecture notes |

---

### Task 1: Migration

**Files:**
- Create: `supabase/migrations/20261017000000_akun_instagram.sql`

**Interfaces:**
- Produces (SQL), used by later tasks:
  - Column `account_id text` (nullable) on the 9 account-scoped tables. Index `(user_id, account_id, created_at)`. `posts` gets `(user_id, account_id, scheduled_at)` instead. DM tables use their existing order columns.
  - Trigger function `public.stamp_account()`: `before insert` on the 9 tables. When `new.account_id is null`, it sets it from `instagram_connections.instagram_user_id where user_id = new.user_id`. It stays null when the user has no connection.
  - `brand_kit`, `dm_settings`: drop the PK on `user_id`, add `unique nulls not distinct (user_id, account_id)`. `brand_kit` gets `sync_status text check (sync_status in ('running','failed'))`, default null.
  - `facebook_connections`: PK becomes `(user_id, instagram_user_id)`.
  - Table `brand_reference_images (id uuid pk, user_id uuid not null → auth.users cascade, reference_id uuid not null → brand_references cascade, position smallint check 0–19, storage_path text unique not null, content_type text (same check), label text check in ('cover','isi','cta','single'), unique (reference_id, position))`. RLS on, revoke from anon and authenticated.
  - Existing data: each `brand_references` row is copied to one image (`position 0`, `single`), then `brand_references.storage_path` and `content_type` are dropped.
  - Existing rows: `update … set account_id = c.instagram_user_id from instagram_connections c where c.user_id = t.user_id` on each table.
  - `public.draft_scheduled_posts(p_user_id uuid, p_account_id text) returns integer`: scheduled → draft, clears `next_attempt_at`, returns the count.
  - `public.disconnect_instagram(p_user_id uuid) returns integer`: one transaction. It reads the connection's account, calls `draft_scheduled_posts`, deletes the connection row, and returns the count (0 when nothing was connected).
  - `public.claim_orphan_rows(p_user_id uuid, p_account_id text) returns void`: sets `account_id` on the user's null rows in the 9 tables. For `brand_kit` and `dm_settings`, it does so only when no row exists yet for that user + account, and deletes the orphan otherwise.
  - `save_post`: same signature. When `p_status = 'scheduled'` and the post's `account_id` (or, for a new post, the stamped one) differs from the current connection's account, it raises `wrong_account`.
  - All new functions: `set search_path = ''`, `revoke execute … from public, anon, authenticated`, `grant execute … to service_role`.

- [ ] **Step 1: Write the migration.** Follow the style of `20261016040000_multi_user.sql`: a comment per block, and `drop function` plus `create function` when replacing `save_post`. `nulls not distinct` needs Postgres 15 or newer, which self-hosted Supabase ships.
- [ ] **Step 2: Lint the SQL by reading it against the spec's data model section.** There is no local database. The tests mock Supabase.
- [ ] **Step 3: Ask the owner before applying.** `npm run db:push -- --db-url "<postgres-url>"` writes to the VPS database. Use AskUserQuestion with the options "Push sekarang (saya kirim URL)" or "Saya push sendiri". Expected after push: no error. If the server is below PG15, the `nulls not distinct` line fails. In that case, stamp the orphans first and fall back to a plain unique key.
- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261017000000_akun_instagram.sql
git commit -m "feat(db): account_id per Instagram account and carousel reference groups"
```

### Task 2: Gate and connection functions

**Files:**
- Modify: `src/lib/auth.ts`, `src/lib/connection.ts`
- Test: `src/lib/auth.test.ts`, `src/lib/connection.test.ts`

**Interfaces:**
- Consumes: Task 1's SQL functions.
- Produces:
  - `interface AccountScope { userId: string; accountId: string }` exported from `auth.ts`.
  - `requireAccount(): Promise<AccountScope>`: calls `requireActiveUser()`, then `getConnectedAccountId(userId)`. Without a connection it calls `redirect('/pengaturan?perlu=instagram')`. Wrap it in React `cache` like `currentPeriod`.
  - `disconnectInstagram(userId: string): Promise<number>`: rpc `disconnect_instagram`, returns how many scheduled posts became drafts.
  - `draftScheduledPosts(userId: string, accountId: string): Promise<number>`
  - `claimOrphanRows(userId: string, accountId: string): Promise<void>`
  - `countScheduledPosts(userId: string, accountId: string): Promise<number>` (head count on `posts`, status `scheduled`). It lives in `posts.ts`.
  - `deleteConnection` is removed. Its only caller, `disconnectInstagram` in `pengaturan/actions.ts`, switches to the new function.

- [ ] **Step 1: Write failing tests** in `auth.test.ts`, mocking `./connection` → `getConnectedAccountId: vi.fn()`:

```ts
describe('requireAccount', () => {
  it('returns the user and the connected account', async () => {
    session.userId = 'user-1'
    vi.mocked(getCurrentPeriod).mockResolvedValue(PERIOD)
    vi.mocked(getConnectedAccountId).mockResolvedValue('ig-1')
    await expect(requireAccount()).resolves.toEqual({ userId: 'user-1', accountId: 'ig-1' })
  })
  it('sends a user without Instagram to Pengaturan', async () => {
    session.userId = 'user-3'
    vi.mocked(getCurrentPeriod).mockResolvedValue(PERIOD)
    vi.mocked(getConnectedAccountId).mockResolvedValue(null)
    await expect(requireAccount()).rejects.toThrow('REDIRECT /pengaturan?perlu=instagram')
  })
})
```

  In `connection.test.ts` (follow its existing Supabase mock): `disconnectInstagram` calls rpc `disconnect_instagram` with `{ p_user_id }` and returns the number. It throws on an rpc error.
- [ ] **Step 2: Run** `npx vitest run src/lib/auth.test.ts src/lib/connection.test.ts`. Expected: FAIL (`requireAccount` is not exported).
- [ ] **Step 3: Implement.** If `auth.ts` importing `connection.ts` makes a cycle, move `getConnectedAccountId`'s query into `auth.ts`. Otherwise import it.
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: requireAccount gate and account switch functions`.

### Task 3: Pure label, mapping and colour functions

**Files:**
- Modify: `src/lib/brand-options.ts`
- Test: `src/lib/brand-options.test.ts`

**Interfaces:**
- Produces:
  - `type ReferenceLabel = 'cover' | 'isi' | 'cta' | 'single'`, `REFERENCE_LABELS: Record<ReferenceLabel, string>` = `{ cover: 'Cover', isi: 'Isi', cta: 'CTA', single: 'Tunggal' }`.
  - `MAX_GROUP_IMAGES = 20`
  - `labelsForCount(count: number): ReferenceLabel[]`
  - `interface LabeledImage { position: number; label: ReferenceLabel }`
  - `pickReferenceImage<T extends LabeledImage>(images: T[], slide: { index: number; count: number } | null): T | null`. `index` is 1-based, as `drawImage` already uses.
  - `colorsFromPalettes(palettes: string[][]): BrandColor[]`: takes colours round-robin across the palettes in order, skipping duplicates (case-insensitive), at most one per role. Roles are assigned in the order `utama, sekunder, aksen, latar, teks`.
  - `BrandReference` changes to `{ id, source, sourceLabel, permalink, palette, description, note, images: { id: string; url: string; position: number; label: ReferenceLabel }[] }`. The old `url` field is removed. Consumers read `images[0]`.

- [ ] **Step 1: Write failing tests**

```ts
it.each([
  [1, ['single']],
  [2, ['cover', 'isi']],
  [3, ['cover', 'isi', 'cta']],
  [5, ['cover', 'isi', 'isi', 'isi', 'cta']],
])('labelsForCount(%i)', (count, labels) => expect(labelsForCount(count)).toEqual(labels))

const group = labelsForCount(4).map((label, position) => ({ position, label })) // cover isi isi cta
it.each([
  [null, 0],
  [{ index: 1, count: 1 }, 0],
  [{ index: 1, count: 7 }, 0],
  [{ index: 7, count: 7 }, 3],
  [{ index: 2, count: 7 }, 1],
  [{ index: 3, count: 7 }, 2],
  [{ index: 4, count: 7 }, 1], // isi cycles
])('pickReferenceImage %j → position %i', (slide, position) =>
  expect(pickReferenceImage(group, slide)?.position).toBe(position))
it('falls back to the cover without cta, and to the first image without cover', () => {
  expect(pickReferenceImage([{ position: 0, label: 'cover' }, { position: 1, label: 'isi' }], { index: 3, count: 3 })?.position).toBe(0)
  expect(pickReferenceImage([{ position: 0, label: 'isi' }], { index: 1, count: 2 })?.position).toBe(0)
  expect(pickReferenceImage([], null)).toBeNull()
})
it('takes brand colours round-robin without duplicates', () => {
  expect(colorsFromPalettes([['#111111', '#222222'], ['#111111', '#333333']])).toEqual([
    { hex: '#111111', role: 'utama' }, { hex: '#222222', role: 'sekunder' }, { hex: '#333333', role: 'aksen' },
  ])
})
```

  Mapping rule (spec): slide 1, or one-image content, takes `cover`, then `single`, then the first image. The last slide (count > 1) takes `cta`. Middle slide i (1-based index, 2…count-1) takes `isi[(i - 2) % isi.length]`. When the needed label is missing, fall back to the cover rule. Sort by `position` first.
- [ ] **Step 2: Run** `npx vitest run src/lib/brand-options.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** in `brand-options.ts`. This file has no server imports, so the browser can use it.
- [ ] **Step 4: Run it again.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: reference labels and slide mapping`.

### Task 4: Carousel children from Instagram and Business Discovery

**Files:**
- Modify: `src/lib/instagram.ts:214-242`, `src/lib/facebook.ts:142-155`
- Test: `src/lib/instagram.test.ts`, `src/lib/facebook.test.ts`

**Interfaces:**
- Produces: `InstagramPost` = `{ id, caption, imageUrl /* cover */, images: string[] /* 1–20, carousel order */, isCarousel: boolean, permalink }`. `toPosts` drops top-level `VIDEO` posts. For `CAROUSEL_ALBUM`, `images` holds `children.data`: `media_url` for images, `thumbnail_url` for video slides, and video slides without a thumbnail are skipped. The list is capped at `MAX_GROUP_IMAGES`. When `children` is missing, `images` is `[media_url]` and `isCarousel` is false.
- Fields asked: `id,caption,media_type,media_url,thumbnail_url,permalink,children{media_type,media_url,thumbnail_url}`. Discovery asks the same inside `media.limit(…){…}`.

- [ ] **Step 1: Write failing `toPosts` tests:**
  - a carousel with 3 children → `images.length === 3`, `isCarousel === true`, `imageUrl === images[0]`
  - a carousel child that is a video with a thumbnail → its thumbnail is used
  - a video child without a thumbnail → skipped
  - a top-level `VIDEO` → absent
  - a carousel without `children` → one image, `isCarousel === false`
  - 25 children → 20

  In `facebook.test.ts`: the requested `fields` contains `children{media_type,media_url,thumbnail_url}`.
- [ ] **Step 2: Run** `npx vitest run src/lib/instagram.test.ts src/lib/facebook.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it again.** Expected: PASS. Then run `npm run typecheck` and fix callers that read `InstagramPost` (`brand/actions.ts`, `references-panel.tsx`).
- [ ] **Step 5: Verify Business Discovery live.** Ask the owner with AskUserQuestion, options "Saya cek sekarang di /brand → Akun lain" or "Lewati, pakai fallback cover". Children present means carousel groups work for other accounts. Absent means they fall back to `single` without code changes. Record the result in the spec's open items.
- [ ] **Step 6: Commit** `feat: read carousel slides from Instagram`.

### Task 5: Account filters on every dashboard read

**Files:**
- Modify: `src/lib/posts.ts`, `src/lib/assets.ts`, `src/lib/ideas.ts`, `src/lib/dm.ts`, `src/lib/facebook-connection.ts`, `src/lib/brand.ts` (kit and logo only; references are Task 6)
- Modify callers: pages and actions under `src/app/(app)/(halaman)/{aset,balasan,brand,kalender}/`, `src/app/(app)/buat/*`, `src/components/*` that list data, `src/lib/ai.ts` (`loadBrandContext`), `src/lib/image-ai.ts`, `src/lib/content-ai.ts`, `src/app/api/auth/facebook/callback/route.ts`, and the webhook `src/app/api/webhooks/instagram/route.ts`
- Test: existing test files of the changed modules (`assets.test.ts`, `balasan/actions.test.ts`, `buat/actions.test.ts`, `ai.test.ts`, `image-ai.test.ts`, `content-ai.test.ts`, `facebook/callback/route.test.ts`)

**Interfaces:**
- Consumes: `requireAccount()` and `AccountScope` (Task 2).
- Produces: these functions take `accountId: string` as their second parameter and add `.eq('account_id', accountId)`:
  - `listPosts`, `listContentPosts`, `countScheduledPosts`, `listAssets` (whatever `assets.ts:54` is), `listIdeas` (`ideas.ts:17`) and the posts query at `ideas.ts:44`
  - `listConversations`, `getConversation`/messages (`dm.ts:96-121`), `listTemplates` (`dm.ts:140`), `getDmVariables`/`saveDmVariables` (`dm_settings`, upsert with `account_id` and `onConflict: 'user_id,account_id'`)
  - `getBrandKit`, `getBrandContext`, `getBrandVisual`, `loadLogoImage`, `saveBrandKit`, `setLogo`, `removeLogo` (private `loadKit(userId, accountId)`; upserts carry `account_id` and `onConflict: 'user_id,account_id'`)
  - `getFacebookConnection`, `getDiscoveryAccount`, `markFacebookNeedsReconnect`, `deleteFacebookConnection` (filter `instagram_user_id = accountId`). `saveFacebookConnection` upserts with `onConflict: 'user_id,instagram_user_id'`.
  - `retryPost(userId, accountId, id)` adds `.eq('account_id', accountId)`.
  - `savePost` maps the `wrong_account` error to `PostLockedError('Post ini milik akun Instagram lain.')`.
  - Inserts (`assets`, `content_ideas`, `dm_templates`, `create_content`, `save_post`, `record_dm_message`) are unchanged: the trigger stamps them.
- Per-id reads and writes (`getPost`, `deletePost`, `cancelPost`, `updateTemplate`, …) stay `userId`-only.
- Every page loader, server action and route handler of Brand, Buat, Kalender, Aset and Balasan replaces `requireActiveUser()` with `const { userId, accountId } = await requireAccount()`. Pengaturan, Langganan, `src/components/*` status widgets and the OAuth routes keep `requireActiveUser()`.
- The webhook passes `entry.id` as the `accountId` wherever it reads DM settings. `findUserByInstagramId` already guarantees it equals the connected account.
- The Facebook callback reads the connected account id and saves the Page row under it.

- [ ] **Step 1: Update tests first.** Where a test asserts a Supabase chain or a call such as `listPosts('user-1', …)`, add the account (`'ig-1'`) and assert `.eq('account_id', 'ig-1')`. Action tests that mock `requireActiveUser` switch to mocking `requireAccount` → `{ userId: 'user-1', accountId: 'ig-1' }`. Add one test in `buat/actions.test.ts`: a schedule action whose `savePost` rejects with `PostLockedError('Post ini milik akun Instagram lain.')` returns that message.
- [ ] **Step 2: Run** `npm test`. Expected: the updated tests FAIL.
- [ ] **Step 3: Implement the signatures, then fix every caller** until `npm run typecheck` is clean.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: show only the connected account's data`.

### Task 6: Reference groups in the data layer and actions

**Files:**
- Modify: `src/lib/brand.ts:186-356`, `src/app/(app)/(halaman)/brand/actions.ts`
- Create: `src/lib/image-palette.ts`
- Test: `src/lib/brand.test.ts` (new, Supabase mocked like `assets.test.ts`), `src/lib/image-palette.test.ts`

**Interfaces:**
- Consumes: Tasks 3 and 4 types, Task 5's `accountId` convention.
- Produces:
  - `listReferences(userId, accountId): Promise<BrandReference[]>`: selects `…, brand_reference_images(id, position, storage_path, label)`, sorts images by position, signs every path.
  - `interface NewReference { images: { bytes: Uint8Array; type: ImageType }[] /* 1–20 */; labels?: ReferenceLabel[] /* defaults to labelsForCount */; source; sourceLabel; permalink; palette }`
  - `addReference(userId, accountId, reference): Promise<string>`: the limit counts the account's groups. It inserts the group, uploads each image (`ref-` prefix), then inserts the image rows. On any failure it deletes the group and removes the uploaded files. It returns the group id.
  - `setReferenceImageLabel(userId: string, imageId: string, label: ReferenceLabel): Promise<boolean>`
  - `deleteReference(userId, id)`: deletes the group and removes all its image files.
  - `loadReferenceImage(userId, id, slide: { index: number; count: number } | null): Promise<ReferenceImage | null>`: loads the group's images and returns the one chosen by `pickReferenceImage`, with the group note.
  - `loadVisualReferences(userId, accountId)`: per group (newest first), sends the cover, the first `isi` and the `cta` while they fit `VISUAL_BODY_BUDGET`. `VISUAL_REFERENCE_LIMIT` counts images. It returns `VisualReference { id /* group id */, note, dataUrl }[]`. Several images of one group share the id, so `analyzeVisualAction` saves the first description per group.
  - `paletteFromBytes(bytes: Uint8Array): Promise<string[]>` in `image-palette.ts`: `sharp(bytes).resize(64, 64, { fit: 'inside' }).ensureAlpha().raw()` → `extractPalette(data)` from `palette.ts`.
  - Actions:
    - `importReferencesAction(items)`: each item is `{ imageUrls: string[] /* 1–MAX_GROUP_IMAGES */, permalink, source, sourceLabel }`. `MAX_IMPORT` counts items. Each item becomes one group. `parseImportItem` validates every URL as before.
    - New `setReferenceLabelAction(imageId: unknown, label: unknown): Promise<ActionError>`
    - `uploadReferenceAction` makes a one-image `single` group.
    - All brand actions use `requireAccount()` (Task 5).

- [ ] **Step 1: Write failing tests.**
  - `brand.test.ts`: `addReference` with 3 images inserts labels `cover, isi, cta`. A failing image insert deletes the group and removes the uploaded files. The limit error appears at 30 groups. `loadReferenceImage` with `{ index: 3, count: 3 }` downloads the `cta` path.
  - `image-palette.test.ts`: a 2×1 PNG made with sharp (one red, one blue pixel) gives a palette containing `#ff0000`-ish and `#0000ff`-ish. Assert the length is ≥ 2 and every entry matches `isHex`.
- [ ] **Step 2: Run** `npx vitest run src/lib/brand.test.ts src/lib/image-palette.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, then update `src/lib/image-ai.ts`'s `packImages` to call `loadReferenceImage(userId, referenceId, input.slide)`. Edit-slide already passes `slide` by position (`content-actions.ts:190`). For a single-image post `slide` is null, which picks the cover.
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: carousel reference groups`.

### Task 7: Reference UI (slideshow, labels, carousel badge, composer count)

**Files:**
- Modify: `src/app/(app)/(halaman)/brand/references-panel.tsx`, `src/app/(app)/(halaman)/brand/brand-form.tsx` (if it reads `reference.url`), the Buat composer's reference select (`src/app/(app)/buat/composer.tsx` or wherever `references` are listed)

**Interfaces:**
- Consumes: `BrandReference.images`, `REFERENCE_LABELS`, `setReferenceLabelAction`, `InstagramPost.images` / `isCarousel`.
- Behaviour:
  - `ReferenceCard` shows a horizontal scroll-snap strip (`snap-x snap-mandatory overflow-x-auto`, one image per view) with prev/next buttons when there is more than one image. Each slide has a label chip, and a `<select>` under the visible slide changes it through `setReferenceLabelAction`. Note, description, palette and Hapus stay per group.
  - `useMissingPalettes` computes a group's palette from `images[0]`.
  - `PostPicker` cards with `isCarousel` show a `Carousel · N` badge. Selecting one sends `imageUrls: post.images`. The room count is per post.
  - The composer's reference options show `(<n> slide)` after the label when `images.length > 1`.

- [ ] **Step 1: Implement.** UI only: no unit test, the project has no component tests.
- [ ] **Step 2: Run** `npm run typecheck && npm run lint && npm run build`. Expected: clean, and `/brand` shows ◐ in the route table.
- [ ] **Step 3: Check in the browser** (`npm run dev`, open via the ngrok domain). Import one carousel from Post sendiri, then confirm the slides, chips and select work and that the label survives a reload. Use the `run` skill or Claude in Chrome.
- [ ] **Step 4: Commit** `feat: reference slideshow with slide labels`.

### Task 8: Callback switch, adoption and new-account auto-fill

**Files:**
- Create: `src/lib/brand-sync.ts`
- Modify: `src/app/api/auth/instagram/callback/route.ts`, `src/lib/brand.ts` (kit status helpers), `src/lib/brand-ai.ts` (optional cost)
- Test: `src/app/api/auth/instagram/callback/route.test.ts`, `src/lib/brand-sync.test.ts`

**Interfaces:**
- Consumes: `draftScheduledPosts`, `claimOrphanRows`, `getConnectedAccountId` (Task 2); `addReference`, `paletteFromBytes` (Task 6); `colorsFromPalettes` (Task 3); `toPosts` (Task 4).
- Produces:
  - `brand.ts`:
    - `hasBrandKit(userId, accountId): Promise<boolean>`
    - `startBrandSync(userId, accountId): Promise<boolean>`: inserts a `brand_kit` row with `sync_status 'running'`. It returns false on a unique violation, meaning another tab already started.
    - `updateBrandKit(userId, accountId, patch: Partial<BrandFields> & { syncStatus?: 'running' | 'failed' | null }): Promise<void>`
    - `getBrandKit` returns `syncStatus` too.
  - `brand-ai.ts`: `analyzeProfile(userId, sources, options?: { cost?: number })` and `analyzeVisual(userId, references, options?: { cost?: number })` pass `cost` to `runLogged`. Only `brand-sync.ts` passes `{ cost: 0 }`. `runLogged` already allows cost 0 with 0 credits left (`0 > 0` is false), so nothing else changes.
  - `syncNewAccount(userId: string, accountId: string): Promise<void>` in `brand-sync.ts`. Steps follow the spec's "Isi otomatis":
    1. Read the profile with `fetchOwnProfile` plus `profile_picture_url` (add that field to the request), and `fetchRecentMedia(token, 12)`.
    2. Run `analyzeProfile` with `{ instagram }` only and `{ cost: 0 }`, then `updateBrandKit` with the profile fields.
    3. Download the profile picture (`fetchImage`, `MAX_LOGO_BYTES`) and pass it to `setLogo`.
    4. Import the first 3 posts as groups (`fetchImage` per image, source `instagram`, label `@username`).
    5. Run `paletteFromBytes` on each cover and save it on the group (`updateReference`), then save `colorsFromPalettes` on the kit.
    6. Load the groups' visual references, run `analyzeVisual` with `{ cost: 0 }`, then save `visualStyle` and the descriptions.
    7. Set `syncStatus: null`.

    Each step catches its own error, logs it with `describeError` and remembers that it failed. Later steps still run where they can. At the end, `syncStatus` is `'failed'` if any step failed. The function never throws.
  - Callback order after `fetchProfile`:
    1. `previous = getConnectedAccountId(userId)`. If `previous` exists and differs from `profile.userId`, call `draftScheduledPosts(userId, previous)`.
    2. `saveConnection`.
    3. `claimOrphanRows(userId, profile.userId)`.
    4. If `!(await hasBrandKit(…))` and `await startBrandSync(…)`, call `after(() => syncNewAccount(userId, profile.userId))`.

    Steps 1, 3 and 4 run inside `step('gagal_database', …)`.

- [ ] **Step 1: Write failing tests.**
  - Callback (mock `next/server` `after: vi.fn()`, `@/lib/brand`, `@/lib/brand-sync`):
    - a new account calls `after` once
    - an account with a kit does not call `after`
    - a different previous account calls `draftScheduledPosts('user-1', 'ig-old')`
    - the same account does not call it
    - `claimOrphanRows` is called after `saveConnection`
  - `brand-sync.test.ts`, with Instagram, AI, brand and `fetchImage` mocked:
    - both AI calls get `{ cost: 0 }`
    - only 3 posts are imported out of 5
    - a failing `analyzeVisual` still saves the profile and ends with `syncStatus: 'failed'`
    - success ends with `syncStatus: null`
- [ ] **Step 2: Run** `npx vitest run src/app/api/auth/instagram/callback/route.test.ts src/lib/brand-sync.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`: `after` works in route handlers and runs after the redirect is sent.
- [ ] **Step 4: Run it again, then `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: fill a new account's brand from Instagram`.

### Task 9: Worker account check

**Files:**
- Modify: `src/lib/posts.ts` (`ClaimedPost.accountId: string | null`, read from the `claim_due_post` row), `src/worker/publish.ts`
- Test: `src/worker/publish.test.ts`

**Interfaces:**
- Produces: in `publish()`, right after `getPublishingAccount`, `if (post.accountId !== instagramUserId) throw new PublishFailed('Akun Instagram berbeda', false)`. The container is kept and there is no retry. `claim_due_post` returns `setof public.posts`, so `account_id` comes along without SQL changes.

- [ ] **Step 1: Write the failing test** `fails a post of another account without retry and without calling Instagram`. With a claimed post whose `accountId: 'ig-old'` and a connection whose `instagramUserId: 'ig-new'`, expect `markFailed` with `'Akun Instagram berbeda'` and no `createContainer` or `getContainerStatus` call.
- [ ] **Step 2: Run** `npx vitest run src/worker/publish.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it again.** Expected: PASS.
- [ ] **Step 5: Commit** `fix(worker): never publish a post on another account`.

### Task 10: Disconnect modal, reconnect hint, "connect first" notice, DM reply guard

**Files:**
- Modify: `src/app/(app)/(halaman)/pengaturan/disconnect-button.tsx`, `pengaturan/actions.ts`, `pengaturan/instagram-settings.tsx`, `pengaturan/page.tsx`, `src/app/(app)/(halaman)/balasan/actions.ts`
- Test: `src/app/(app)/(halaman)/balasan/actions.test.ts`

**Interfaces:**
- Consumes: `disconnectInstagram`, `countScheduledPosts` (Task 2), `getConversation(userId, accountId, igsid)` (Task 5).
- Behaviour:
  - `DisconnectButton` for Instagram takes `{ username: string; scheduledCount: number }` and opens a native `<dialog>` (`showModal()`) instead of `window.confirm`. The dialog has:
    - title `Putuskan @username?`
    - the hidden list: "brand kit, referensi desain, Aset, posting dan draft, ide, DM, dan template Auto DM"
    - when `scheduledCount > 0`: "`N` posting terjadwal akan kembali jadi draft."
    - `Semuanya kembali kalau @username dihubungkan lagi.`
    - buttons `Batal` (closes) and `Putuskan` (submits the server action form)

    Facebook keeps `window.confirm`.
  - `disconnectInstagram` action calls `disconnectInstagram(userId)` from `connection.ts`, then `refresh()`, as today.
  - The Instagram settings page loads `countScheduledPosts(userId, accountId)` when connected.
  - The Hubungkan ulang button (status `needs_reconnect`) shows the hint `Pastikan masuk dengan @<username>`.
  - `/pengaturan?perlu=instagram` shows a `Notice`: "Hubungkan akun Instagram dulu untuk memakai Brand, Buat Konten, Kalender, Aset, dan Balasan."
  - Balasan reply action: when `getConversation(userId, accountId, igsid)` is null, it returns "Percakapan ini milik akun Instagram lain." before calling Instagram.

- [ ] **Step 1: Write the failing test** in `balasan/actions.test.ts`: the reply to a conversation of another account returns that message and `sendDirectMessage` is not called.
- [ ] **Step 2: Run** `npx vitest run "src/app/(app)/(halaman)/balasan/actions.test.ts"`. Expected: FAIL.
- [ ] **Step 3: Implement the guard and the UI.**
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint && npm run build`. Expected: all pass, live pages ◐.
- [ ] **Step 5: Commit** `feat: disconnect dialog and account checks`.

### Task 11: Brand sync banner, docs, and end-to-end check

**Files:**
- Modify: `src/app/(app)/(halaman)/brand/page.tsx`, `CLAUDE.md`, `docs/superpowers/specs/2026-10-17-akun-instagram-design.md` (status line and open items)

**Behaviour:**
- When `kit.syncStatus === 'running'`, Brand shows a `Notice` reading `Menyiapkan brand dari @<username>…` above the form, plus a small client component that calls `router.refresh()` every 5 s while that status lasts.
- When it is `'failed'`, the warning reads "Sebagian brand gagal disiapkan otomatis. Lengkapi lewat tombol analisis di bawah."
- `CLAUDE.md`:
  - The Status line mentions per-account data.
  - Architecture gets a bullet **Akun Instagram** covering `account_id`, the trigger, `requireAccount()`, `disconnect_instagram`, `claim_orphan_rows`, the auto-fill in `after()`, and the worker check.
  - The Brand kit bullet mentions reference groups and labels.
  - The Data access bullet says reads filter by `accountId` as well.

- [ ] **Step 1: Implement the banner and the docs.**
- [ ] **Step 2: Run** `npm test && npm run typecheck && npm run lint && npm run build`. Expected: all pass.
- [ ] **Step 3: Manual check with two real accounts** (owner present; ask with AskUserQuestion whether the second account is available: "Ada akun kedua sekarang" / "Nanti saja, cek satu akun dulu"):
  1. Connect @b: brand fills by itself, logo and colours set, ≤3 reference groups with labels, no credits used (Langganan page unchanged).
  2. Disconnect: the dialog shows the count and scheduled posts become drafts.
  3. Reconnect @a: the old data is back and the auto-fill does not run.
- [ ] **Step 4: Commit** `docs: per-account data and carousel references`.
