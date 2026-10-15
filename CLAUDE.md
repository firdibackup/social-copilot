# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

Built: Fondasi (app shell, Instagram OAuth, Supabase schema) and Kalender + Aset + publishing worker (photo and carousel posts; design in `docs/superpowers/specs/2026-10-14-kalender-aset-worker-design.md`). Remaining phases, in order: Buat AI (captions and images via 9Router, added to the existing `/buat` editor) → Balasan (DM inbox) → Analitik. The spec is `social-copilot-prd.md`; the UI is in Bahasa Indonesia.

## Commands

```bash
npm run dev                              # http://localhost:3000 (/ redirects to /kalender)
npm run build                            # also validates Cache Components rules
npm run lint && npm run typecheck
npm test                                 # vitest, all tests
npx vitest run src/lib/crypto.test.ts    # one file
npx vitest run -t 'rejects a tampered'   # one test by name
npm run worker                           # publishing worker; separate process, reads .env.local if present
npm run db:push -- --db-url "<postgres-url>"   # apply supabase/migrations (Supabase is self-hosted on the VPS)
ngrok http --url=<domain>.ngrok-free.app 3000   # public URL for the Meta OAuth callback
```

After `npm install <pkg>`, check `git diff package-lock.json`: npm 11 has dropped the `@rolldown/binding-*` optional dependencies from the lockfile here, after which vitest fails with "Cannot find native binding". Restore the lockfile and add only the new package's entries.

## Next.js 16.4 specifics

- This Next version differs from training data. Read the bundled guides in `node_modules/next/dist/docs/` before writing Next code (see `AGENTS.md`).
- `cacheComponents` and `partialPrefetching` are on. Request-time reads (Supabase, `searchParams`, `headers()`, current time) must sit inside `<Suspense>`. Call `await connection()` before reads that can resolve without an uncached fetch, or the result gets prerendered at build time (this happened to the sidebar status when Supabase env was empty). In the `npm run build` route table, pages with live data should show ◐, not ○.
- `src/proxy.ts` replaces `middleware.ts`.

## Architecture

- **No owner login yet; the tunnel guard is the security boundary.** `src/proxy.ts` uses `src/lib/tunnel-guard.ts`. Through ngrok, only `PUBLIC_PATHS` respond (currently the OAuth callback) and everything else returns 404. The guard relies on ngrok forwarding its own `Host`, so never start ngrok with `--host-header=rewrite`. New public endpoints, such as the Meta DM webhook, must be added to `PUBLIC_PATHS`. The Meta app's OAuth redirect URI is the bare tunnel domain with a trailing slash (`INSTAGRAM_REDIRECT_URI=https://<domain>/`; the token exchange fails without the slash), so `src/proxy.ts` rewrites `/?code=…` and `/?error=…` to the callback route and `next.config.ts` skips its `/` redirect for them. Local-only route handlers and server actions re-check `isLocalRequest()` themselves rather than trusting the proxy. Real owner auth is required before any public deploy.
- **Server-only code.** Modules in `src/lib` that touch secrets `import 'server-only'`. Vitest aliases that import to a stub (`vitest.config.mts`).
- **Data access.** `db()` in `src/lib/supabase.ts` is the service-role client. Tables have RLS on with no policies, so the publishable key can read nothing. Schema changes go in new files under `supabase/migrations/`.
- **Instagram connection.** Lives in `src/lib/connection.ts`: a singleton `instagram_connections` row (`id = 1`, enforced by a CHECK) plus one-time `oauth_states`. Raw HTTP to Instagram is in `src/lib/instagram.ts`. Anything that calls Instagram gets its token from `getValidAccessToken()`, which decrypts it, refreshes it lazily (when older than 24 hours and within 7 days of expiry), and flips status to `needs_reconnect` on Graph error 190.
- **Tokens.** Encrypted with AES-256-GCM using `TOKEN_ENCRYPTION_KEY`. Changing the key makes stored tokens unreadable, so the owner must reconnect.
- **Logging.** Graph API GETs carry `access_token` in the query string. Never log URLs or raw fetch errors; log through `describeError()`.
- **OAuth errors.** They reach the browser only as `?ig_error=<code>`, mapped to Indonesian messages in `src/app/(app)/pengaturan/instagram-settings.tsx`.
- **Posts.** Tables `assets`, `posts`, `post_media`, `publish_attempts`; data access in `src/lib/posts.ts` and `src/lib/assets.ts`. Post content changes only through the `save_post()` SQL function, which swaps caption, schedule and photos in one transaction and raises `post_locked` for posts the worker owns. Status-only changes (cancel, retry, delete) are conditional updates that report whether they won.
- **No duplicate posts.** A non-null `posts.ig_container_id` means Instagram may already have published the post, so its content stays locked. The worker saves the container id before `media_publish`, checks the container's `status_code` before any retry (`PUBLISHED` means done), and clears the id only when it is certain the post did not go out.
- **Worker.** `src/worker/` runs apart from Next via `tsx` with `--conditions=react-server`, which makes `server-only` resolve to an empty module. It polls `claim_due_post()` (`FOR UPDATE SKIP LOCKED`; a post stuck in `publishing` for 10 minutes is reclaimed) and retries transient errors after 1/5/15/30 minutes, at most 5 attempts. In production it runs on the VPS next to Supabase under pm2 or systemd.
- **Media.** Photos are cropped to 4:5–1.91:1, capped at 1440 px and re-encoded as JPEG in the browser (`toInstagramJpeg`) before upload. The `media` bucket is private; Meta gets signed URLs built from `NEXT_PUBLIC_SUPABASE_URL`, so that must be the public HTTPS domain, not an internal address. Signed URLs carry a token: never log them.
- **Time.** Schedules are entered and shown in WIB (fixed +07:00, `src/lib/format.ts`); the database stores UTC.

## Rules carried from the PRD

- AI output is always an editable draft. Nothing publishes or sends a DM without an explicit owner action. No bulk or unsolicited DMs, and no scraping.
- Scheduled publishing runs in the worker process (`npm run worker`), never in the browser or the Next server.
- Meta cannot fetch `localhost` media. Publish from Supabase Storage URLs.
- 9Router is called only from server code. As of 2026-10-14 it lists no image model: `/v1/images/generations` exists but answered `No credentials for provider: openai`. An image-capable model must be configured in 9Router before the Buat phase. Verify `ROUTER_MODEL` with a live request.
- `INSTAGRAM_ACCESS_TOKEN` in `.env.local` is a manual test token. The app does not use it.
