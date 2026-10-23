import { currentPeriod, currentUser } from '@/lib/auth'
import { consumeOAuthState, getConnectedAccountId } from '@/lib/connection'
import { appUrl, settingsUrl } from '@/lib/env'
import { describeError } from '@/lib/errors'
import {
  exchangeThreadsCode,
  exchangeThreadsLongLivedToken,
  fetchThreadsProfile,
  THREADS_SCOPES,
} from '@/lib/threads'
import { saveThreadsConnection, ThreadsTakenError } from '@/lib/threads-connection'

type CallbackErrorCode =
  | 'ditolak'
  | 'state_tidak_valid'
  | 'sesi_lain'
  | 'perlu_instagram'
  | 'gagal_token'
  | 'gagal_profil'
  | 'gagal_database'
  | 'akun_dipakai'
type CallbackResult = { th: 'connected' } | { th_error: CallbackErrorCode }

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
    console.error(`[threads] callback ${code}:`, describeError(error))
    throw new CallbackFailure(code)
  }
}

async function completeLogin(userId: string, params: URLSearchParams): Promise<CallbackResult> {
  if (params.has('error')) return { th_error: 'ditolak' }

  const state = params.get('state')
  const code = params.get('code')
  if (!state || !code) return { th_error: 'state_tidak_valid' }
  // A state another user created fails here: their login must not land in this session.
  const stateResult = await step('gagal_database', () => consumeOAuthState(state, userId))
  if (stateResult === 'other_user') return { th_error: 'sesi_lain' }
  if (stateResult !== 'ok') return { th_error: 'state_tidak_valid' }

  // Threads publishes for the Instagram account (brand) connected now.
  const accountId = await step('gagal_database', () => getConnectedAccountId(userId))
  if (!accountId) return { th_error: 'perlu_instagram' }

  const shortLived = await step('gagal_token', () => exchangeThreadsCode(code))
  const longLived = await step('gagal_token', () => exchangeThreadsLongLivedToken(shortLived))
  const profile = await step('gagal_profil', () => fetchThreadsProfile(longLived.accessToken))
  const saved = await step('gagal_database', () =>
    saveThreadsConnection(userId, accountId, profile, longLived, THREADS_SCOPES).then(
      () => true,
      (error: unknown) => {
        if (error instanceof ThreadsTakenError) return false
        throw error
      },
    ),
  )
  return saved ? { th: 'connected' } : { th_error: 'akun_dipakai' }
}

/** Meta redirects the signed-in user's browser here; the result is reported on the settings page. */
export async function GET(request: Request): Promise<Response> {
  const user = await currentUser()
  if (!user) return Response.redirect(appUrl('/masuk'), 303)
  if (!(await currentPeriod(user.id))) return Response.redirect(appUrl('/pengaturan', { billing: 'pilih' }), 303)
  const result = await completeLogin(user.id, new URL(request.url).searchParams).catch((error: unknown) => {
    if (error instanceof CallbackFailure) return { th_error: error.code }
    throw error
  })
  return Response.redirect(settingsUrl(result), 303)
}
