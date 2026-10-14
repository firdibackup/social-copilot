import { NextResponse, type NextRequest } from 'next/server'
import { isAllowedRequest } from '@/lib/tunnel-guard'

/**
 * There is no owner login yet, so the dashboard is only served to this machine.
 * Through the ngrok tunnel, only the paths Meta needs respond; everything else is a 404.
 */
export function proxy(request: NextRequest) {
  if (isAllowedRequest(request.headers, request.nextUrl.pathname)) return NextResponse.next()
  return new NextResponse(null, { status: 404 })
}
