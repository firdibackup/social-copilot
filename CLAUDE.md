# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

Built: Fondasi (app shell, Instagram OAuth, Supabase schema), Kalender + Aset + publishing worker (photo and carousel posts; design in `docs/superpowers/specs/2026-10-14-kalender-aset-worker-design.md`), Buat AI for text (captions, ideas, rewrites and hashtags in the `/buat` editor; design in `docs/superpowers/specs/2026-10-16-buat-ai-design.md`), and Balasan (DM inbox with keyword reply templates, "Aturan Auto DM"; design and Meta setup steps in `docs/superpowers/specs/2026-10-16-balasan-auto-dm-design.md`). Remaining phase: Analitik. AI images in Buat wait for an image model in 9Router. The spec is `social-copilot-prd.md`; the UI is in Bahasa Indonesia.

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
ngrok http --url=<domain> 3000           # public URL for the Meta OAuth callback and DM webhook (e.g. x.ngrok-free.dev)
```

After `npm install <pkg>`, check `git diff package-lock.json`: npm 11 has dropped the `@rolldown/binding-*` optional dependencies from the lockfile here, after which vitest fails with "Cannot find native binding". Restore the lockfile and add only the new package's entries.

## Next.js 16.4 specifics

- This Next version differs from training data. Read the bundled guides in `node_modules/next/dist/docs/` before writing Next code (see `AGENTS.md`).
- `cacheComponents` and `partialPrefetching` are on. Request-time reads (Supabase, `searchParams`, `headers()`, current time) must sit inside `<Suspense>`. Call `await connection()` before reads that can resolve without an uncached fetch, or the result gets prerendered at build time (this happened to the sidebar status when Supabase env was empty). In the `npm run build` route table, pages with live data should show ◐, not ○.
- `src/proxy.ts` replaces `middleware.ts`.

## Architecture

- **No owner login yet; the tunnel guard is the security boundary.** `src/proxy.ts` uses `src/lib/tunnel-guard.ts`. Through ngrok, only `PUBLIC_PATHS` respond (the OAuth callback and the DM webhook) and everything else returns 404. The guard relies on ngrok forwarding its own `Host`, so never start ngrok with `--host-header=rewrite`. New public endpoints must be added to `PUBLIC_PATHS`. The Meta app's OAuth redirect URI is the bare tunnel domain with a trailing slash (`INSTAGRAM_REDIRECT_URI=https://<domain>/`; the token exchange fails without the slash), so `src/proxy.ts` rewrites `/?code=…` and `/?error=…` to the callback route and `next.config.ts` skips its `/` redirect for them. Local-only route handlers and server actions re-check `isLocalRequest()` themselves rather than trusting the proxy. Real owner auth is required before any public deploy.
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
- **DMs.** Meta posts DMs to `src/app/api/webhooks/instagram/route.ts`. The GET handler answers the verify handshake (`INSTAGRAM_WEBHOOK_VERIFY_TOKEN`). The POST handler hashes the raw body and checks `X-Hub-Signature-256` against `INSTAGRAM_APP_SECRET` before parsing it (`src/lib/dm-webhook.ts`). It drops events whose `entry.id` is not the connected account, and it answers 5xx only when storing fails, because Meta retries those. Every message goes through `record_dm_message()`, keyed on Meta's `mid`. That makes retries and the echo of the app's own sends no-ops, and a late webhook never moves a conversation's summary or its 24-hour window. Replies go out from a server action (`sendDirectMessage`, Bearer token, JSON body), and only within 24 hours of the customer's last message. Meta delivers webhooks only once the app is Live, and each account must be subscribed once with the **Aktifkan DM** button (`/me/subscribed_apps`). Template matching and filling are pure functions in `src/lib/dm-templates.ts`: a keyword must appear as a whole word, case-sensitive, as the owner chose. Templates only ever fill the editable draft.
- **Time.** Schedules are entered and shown in WIB (fixed +07:00, `src/lib/format.ts`); the database stores UTC.
- **AI.** `src/lib/nine-router.ts` is the raw HTTP client. `src/lib/ai.ts` validates requests, builds the prompts, reads the answers, logs every request to `ai_generations` and enforces `DAILY_LIMIT` (100 per rolling 24 hours, counted from that table). Choices shared with the editor live in `src/lib/ai-options.ts`. Requests must send `stream: false`, or 9Router answers with SSE. A 200 can carry a provider notice instead of an answer, so only JSON that passes `parseOptions` counts as success. The `/buat` panel (`ai-assistant.tsx`) renders inside the post form, but its fields belong to a separate empty form (`AI_FORM_ID`, via the `form` attribute): otherwise Enter in a panel input submits the post with Jadwalkan, and React's form reset after a save shows the dropdowns' first options while state keeps the owner's choice. A failed `ai_generations` count blocks AI requests rather than reading as 0 (postgrest-js returns no error and no count for a HEAD 404).

## Rules carried from the PRD

- AI output and Auto DM templates are always an editable draft. Nothing publishes or sends a DM without an explicit owner action. No bulk or unsolicited DMs, and no scraping.
- Scheduled publishing runs in the worker process (`npm run worker`), never in the browser or the Next server.
- Meta cannot fetch `localhost` media. Publish from Supabase Storage URLs.
- 9Router is called only from server code. As of 2026-10-16 `/v1/models` lists no image model (`/v1/images/generations` answered `No credentials for provider: openai` on 2026-10-14), so AI images wait until one is configured. The PRD names the `Hermes-daily` combo, but on 2026-10-16 it answered every request with "Gemini 3.5 Flash is no longer available…", so `ROUTER_MODEL` is `cc/claude-haiku-4-5-20251001`. Verify a new `ROUTER_MODEL` with a live request; the tests mock 9Router.
- `INSTAGRAM_ACCESS_TOKEN` in `.env.local` is a manual test token. The app does not use it.
