/** Public origin for canonical URLs, robots and the sitemap. APP_URL is the production domain (see .env.example). */
export const siteUrl = () => new URL(process.env.APP_URL || 'http://localhost:3000')

/** Paths search engines may index. Everything else is the signed-in app, auth or API. */
export const INDEXABLE_PATHS = ['/', '/privasi'] as const

/** Private areas kept out of search. /masuk and /daftar stay crawlable so their noindex tag is seen. */
export const PRIVATE_PATHS = [
  '/api/', '/auth/', '/mulai', '/langganan', '/admin', '/buat', '/mimo', '/kalender', '/analitik',
  '/aset', '/balasan', '/brand', '/pengaturan',
] as const
