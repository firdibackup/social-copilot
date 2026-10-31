# i18n lane brief (ID default + EN)

Library: `next-intl` 4.14.9, **without i18n routing**. Locale is the `locale` cookie (`id` default, `en`). URLs never change.

## Ground rules
- Read before coding: `node_modules/next/dist/docs/01-app/02-guides/internationalization.md` (Next 16 has breaking changes) and `src/i18n/*`.
- **Only edit files in your lane's write scope.** The tree has unrelated uncommitted user work: never revert, reformat or `git stash/checkout/reset` anything. No `npm install`. **Do not run `next build`** (disk is nearly full; the orchestrator builds once at the end).
- Indonesian strings move **verbatim** into `messages/id/<namespace>.json`. Write natural, concise product English in `messages/en/<namespace>.json` (not literal word-for-word; keep the casual friendly tone, "you"). Keep brand/product names: Carousely, Mimo, Instagram, Threads, Meta, Story, Reels, carousel.
- Both locale files must have identical keys (`tsc` enforces `en` matches `id`). Nest keys by component/page: `{ "monthView": { "previous": "Bulan sebelumnya" } }`.
- Use ICU for counts/variables: `"posts": "{count, plural, other {# post}}"`, `"hello": "Halo, {name}"`. Rich text: `t.rich('key', { b: (c) => <strong>{c}</strong> })`.
- Do not translate: route slugs (`/kalender`), query param names/values (`?tampilan=minggu`), DB values, enum keys, log messages (`console.error`), code comments.
- Indonesian UI must render **exactly as before** (existing tests assert Indonesian text and must keep passing).

## Shared namespaces (read-only for lanes except the Shell lane)
- `common` (owned by the Shell lane after kickoff): generic words + `common.postStatus.<draft|scheduled|publishing|published|failed|cancelled>`. If you need a new shared key, put it in **your own** namespace instead.
- Shared client components in `src/components/` may only use the `common` namespace (they render inside pages whose providers carry `common` + the page's namespace). Header/sidebar-only components may use `shell`.
- Every page-level `<IntlMessages>` wrapper must include `'common'`.

## How to translate
- **Server Component:** `import { getTranslations, getLocale } from 'next-intl/server'` → `const t = await getTranslations('calendar')`. Must be async; fine under existing Suspense boundaries.
- **Client Component:** `import { useTranslations, useLocale } from 'next-intl'` → `const t = useTranslations('calendar')`. The root provider only ships `common` + `shell`. For your client components, wrap the nearest server parent output in `<IntlMessages namespaces={['common', '<yourNs>']}>` from `@/i18n/client-messages` (nested providers **replace**, so list every namespace the island needs). Alternatively pass already-translated strings as props from a server parent.
- **Server Action / Route Handler:** `const t = await getTranslations('<ns>')` and return translated error strings. For pure validators in `src/lib/*-options.ts` that return Indonesian errors, either return message keys that the action translates, or take a `locale: Locale` param — pick the smaller change and keep their tests passing.
- **Module-level label maps** (e.g. `STATUS_LABELS`): keep the export for back-compat if tests use it, but render through `t(\`status.${value}\`)`.
- **Dates/numbers:** `src/lib/format.ts` and `src/lib/calendar.ts` helpers already take an optional `locale` (default `'id'`), e.g. `formatTime(date, locale)`, `formatMonth(month, locale)`; `dateFormat(locale, options)` gives a cached `Intl.DateTimeFormat`. For numbers use `intlLocale(locale)` from `@/i18n/locale-config` (`'id-ID' | 'en-US'`) instead of a hardcoded `'id-ID'`. Currency stays IDR.
- `getUserLocale()` from `@/i18n/locale` reads the cookie in any request context (server actions, route handlers).
- `aria-label`, `title`, `placeholder`, `alt`, `metadata` titles, toasts, confirm dialogs, empty/loading states are all UI copy: translate them.

## Validation each lane owns
`npx tsc --noEmit`, `npx eslint <your files>`, `npx vitest run <your dirs/tests>`. Then grep your scope for leftover Indonesian UI strings and list any you intentionally left (with reason).
