import { consumeOAuthState, saveConnection } from '@/lib/connection'
import { settingsUrl } from '@/lib/env'
import { describeError } from '@/lib/errors'
import { exchangeCodeForToken, exchangeForLongLivedToken, fetchProfile } from '@/lib/instagram'

type CallbackErrorCode = 'ditolak' | 'state_tidak_valid' | 'gagal_token' | 'gagal_profil' | 'gagal_database'
type CallbackResult = { ig: 'connected' } | { ig_error: CallbackErrorCode }

class CallbackFailure extends Error {
  constructor(readonly code: CallbackErrorCode) {
    super(code)
  }
}

/** Runs one step of the login; the real cause is logged here and only `code` reaches the browser. */
async function step<T>(code: CallbackErrorCode, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    console.error(`[instagram] callback ${code}:`, describeError(error))
    throw new CallbackFailure(code)
  }
}

async function completeLogin(params: URLSearchParams): Promise<CallbackResult> {
  if (params.has('error')) return { ig_error: 'ditolak' }

  const state = params.get('state')
  const code = params.get('code')
  if (!state || !code) return { ig_error: 'state_tidak_valid' }
  if (!(await step('gagal_database', () => consumeOAuthState(state)))) return { ig_error: 'state_tidak_valid' }

  const shortLived = await step('gagal_token', () => exchangeCodeForToken(code))
  const longLived = await step('gagal_token', () => exchangeForLongLivedToken(shortLived.accessToken))
  const profile = await step('gagal_profil', () => fetchProfile(longLived.accessToken))
  await step('gagal_database', () => saveConnection(profile, longLived, shortLived.permissions))
  return { ig: 'connected' }
}

/** Meta redirects here through the public tunnel; the result is reported on the local settings page. */
export async function GET(request: Request): Promise<Response> {
  const result = await completeLogin(new URL(request.url).searchParams).catch((error: unknown) => {
    if (error instanceof CallbackFailure) return { ig_error: error.code }
    throw error
  })
  return Response.redirect(settingsUrl(result), 303)
}
