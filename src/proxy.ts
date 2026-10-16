import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/** Pages and endpoints reachable without a session: sign in and up, the privacy page Meta links to, Meta's webhook. */
const PUBLIC_PATHS = new Set(['/masuk', '/daftar', '/privasi', '/api/webhooks/instagram'])
/** Signed-in users who open these go to the app instead. */
const AUTH_PAGES = new Set(['/masuk', '/daftar'])

/**
 * Refreshes the Supabase session on every request and sends visitors without one to /masuk. Pages and server
 * actions still check the session themselves (requireUser); this only keeps the redirects in one place.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search, searchParams } = request.nextUrl
  // The Meta app's redirect URI is the bare domain, so Instagram returns to `/`.
  // next.config.ts skips its `/` redirect for these same params.
  if (pathname === '/' && (searchParams.has('code') || searchParams.has('error'))) {
    return NextResponse.rewrite(new URL(`/api/auth/instagram/callback${search}`, request.url))
  }
  // Meta sends no cookies: skip the session round trip.
  if (pathname === '/api/webhooks/instagram') return NextResponse.next()

  // The response that carries refreshed session cookies. setAll replaces it, so only the last one is returned.
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list, headers) => {
          for (const { name, value } of list) request.cookies.set(name, value)
          response = NextResponse.next({ request })
          for (const { name, value, options } of list) response.cookies.set(name, value, options)
          for (const [key, value] of Object.entries(headers)) response.headers.set(key, value)
        },
      },
    },
  )
  const { data } = await supabase.auth.getClaims()
  const signedIn = Boolean(data?.claims?.sub)

  if (signedIn && AUTH_PAGES.has(pathname)) return redirectWithCookies(response, new URL('/kalender', request.url))
  if (!signedIn && !PUBLIC_PATHS.has(pathname)) {
    const login = new URL('/masuk', request.url)
    login.searchParams.set('next', `${pathname}${search}`)
    return redirectWithCookies(response, login)
  }
  return response
}

/** A redirect that keeps whatever setAll wrote, e.g. the cleared cookies of a session that could not be refreshed. */
function redirectWithCookies(from: NextResponse, url: URL): NextResponse {
  const redirect = NextResponse.redirect(url)
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie)
  return redirect
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
