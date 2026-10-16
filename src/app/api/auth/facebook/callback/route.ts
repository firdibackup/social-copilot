import { consumeOAuthState, getConnectedAccountId } from '@/lib/connection'
import { settingsUrl } from '@/lib/env'
import { describeError } from '@/lib/errors'
import { choosePage, exchangeFacebookCode, exchangeForLongLivedUserToken, fetchInstagramPages } from '@/lib/facebook'
import { saveFacebookConnection } from '@/lib/facebook-connection'

type CallbackErrorCode = 'ditolak' | 'state_tidak_valid' | 'gagal_token' | 'gagal_page' | 'tanpa_instagram' | 'gagal_database'
type CallbackResult = { fb: 'connected' } | { fb_error: CallbackErrorCode }

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
    console.error(`[facebook] callback ${code}:`, describeError(error))
    throw new CallbackFailure(code)
  }
}

async function completeLogin(params: URLSearchParams): Promise<CallbackResult> {
  if (params.has('error')) return { fb_error: 'ditolak' }

  const state = params.get('state')
  const code = params.get('code')
  if (!state || !code) return { fb_error: 'state_tidak_valid' }
  if (!(await step('gagal_database', () => consumeOAuthState(state)))) return { fb_error: 'state_tidak_valid' }

  const shortLived = await step('gagal_token', () => exchangeFacebookCode(code))
  const longLived = await step('gagal_token', () => exchangeForLongLivedUserToken(shortLived))
  const pages = await step('gagal_page', () => fetchInstagramPages(longLived))
  const connectedId = await step('gagal_database', () => getConnectedAccountId())
  const page = choosePage(pages, connectedId)
  if (!page) return { fb_error: 'tanpa_instagram' }
  await step('gagal_database', () => saveFacebookConnection(page))
  return { fb: 'connected' }
}

/** Facebook redirects here through the public tunnel; the result is reported on the local settings page. */
export async function GET(request: Request): Promise<Response> {
  const result = await completeLogin(new URL(request.url).searchParams).catch((error: unknown) => {
    if (error instanceof CallbackFailure) return { fb_error: error.code }
    throw error
  })
  return Response.redirect(settingsUrl(result), 303)
}
