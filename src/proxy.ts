import { NextResponse, type NextRequest } from 'next/server'
import { isAllowedRequest } from '@/lib/tunnel-guard'

/**
 * There is no owner login yet, so the dashboard is only served to this machine.
 * Through the ngrok tunnel, only the paths Meta needs respond; everything else is a 404.
 */
export function proxy(request: NextRequest) {
  const { pathname, search, searchParams } = request.nextUrl
  // The Meta app's redirect URI is the bare tunnel domain, so Instagram returns to `/`.
  // next.config.ts skips its `/` redirect for these same params.
  if (pathname === '/' && (searchParams.has('code') || searchParams.has('error'))) {
    return NextResponse.rewrite(new URL(`/api/auth/instagram/callback${search}`, request.url))
  }
  if (isAllowedRequest(request.headers, pathname)) return NextResponse.next()
  return new NextResponse(null, { status: 404 })
}
