import { NextResponse } from 'next/server'
import { authClient } from '@/lib/auth'
import { appUrl } from '@/lib/env'
import { describeError } from '@/lib/errors'
import { safeNext } from '@/lib/params'

/** Public PKCE return: exchange the one-use code and write the session to cookies. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const next = safeNext(params.get('next'))
  const code = params.get('code')
  if (code && !params.has('error')) {
    try {
      const { data, error } = await (await authClient()).auth.exchangeCodeForSession(code)
      if (error) throw error
      if (data.session) {
        // Subscription and onboarding checks remain in the destination's existing guards.
        return NextResponse.redirect(new URL(next, appUrl('/')), {
          headers: { 'Cache-Control': 'private, no-store' },
        })
      }
    } catch (error) {
      console.error('[auth] callback Google gagal:', describeError(error))
    }
  }
  return NextResponse.redirect(appUrl('/masuk', { error: 'google', next }), {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
