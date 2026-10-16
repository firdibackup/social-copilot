import { currentUser } from '@/lib/auth'
import { AccountTakenError, consumeOAuthState, saveConnection } from '@/lib/connection'
import { appUrl, settingsUrl } from '@/lib/env'
import { describeError } from '@/lib/errors'
import { exchangeCodeForToken, exchangeForLongLivedToken, fetchProfile } from '@/lib/instagram'

type CallbackErrorCode =
  | 'ditolak'
  | 'state_tidak_valid'
  | 'gagal_token'
  | 'gagal_profil'
  | 'gagal_database'
  | 'akun_dipakai'
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

async function completeLogin(userId: string, params: URLSearchParams): Promise<CallbackResult> {
  if (params.has('error')) return { ig_error: 'ditolak' }

  const state = params.get('state')
  const code = params.get('code')
  if (!state || !code) return { ig_error: 'state_tidak_valid' }
  // A state another user created fails here: their login must not land in this session.
  if (!(await step('gagal_database', () => consumeOAuthState(state, userId)))) return { ig_error: 'state_tidak_valid' }

  const shortLived = await step('gagal_token', () => exchangeCodeForToken(code))
  const longLived = await step('gagal_token', () => exchangeForLongLivedToken(shortLived.accessToken))
  const profile = await step('gagal_profil', () => fetchProfile(longLived.accessToken))
  const saved = await step('gagal_database', () =>
    saveConnection(userId, profile, longLived, shortLived.permissions).then(
      () => true,
      (error: unknown) => {
        if (error instanceof AccountTakenError) return false
        throw error
      },
    ),
  )
  return saved ? { ig: 'connected' } : { ig_error: 'akun_dipakai' }
}

/** Meta redirects the signed-in user's browser here; the result is reported on the settings page. */
export async function GET(request: Request): Promise<Response> {
  const user = await currentUser()
  if (!user) return Response.redirect(appUrl('/masuk'), 303)
  const result = await completeLogin(user.id, new URL(request.url).searchParams).catch((error: unknown) => {
    if (error instanceof CallbackFailure) return { ig_error: error.code }
    throw error
  })
  return Response.redirect(settingsUrl(result), 303)
}
