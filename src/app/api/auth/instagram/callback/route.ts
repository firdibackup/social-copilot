import { getTranslations } from 'next-intl/server'
import { after } from 'next/server'
import { getUserLocale } from '@/i18n/locale'
import { currentPeriod, currentUser } from '@/lib/auth'
import { hasBrandKit, startBrandSync } from '@/lib/brand'
import { syncNewAccount } from '@/lib/brand-sync'
import {
  AccountTakenError,
  claimOrphanRows,
  consumeOAuthState,
  draftScheduledPosts,
  getConnectedAccountId,
  saveConnection,
} from '@/lib/connection'
import { appUrl, settingsUrl } from '@/lib/env'
import { ConfigError, describeError } from '@/lib/errors'
import { ensureWebhookSubscription } from '@/lib/inbox-sync'
import { exchangeCodeForToken, exchangeForLongLivedToken, fetchProfile, InstagramApiError } from '@/lib/instagram'
import { getCompletedAnswers, kitColumnsOf } from '@/lib/onboarding'
import { deleteOtherThreadsConnection } from '@/lib/threads-connection'

type CallbackErrorCode =
  | 'ditolak'
  | 'state_tidak_valid'
  | 'sesi_lain'
  | 'gagal_token'
  | 'gagal_token_panjang'
  | 'gagal_profil'
  | 'gagal_database'
  | 'akun_dipakai'
type CallbackResult = { ig: 'connected' } | { ig_error: CallbackErrorCode; ig_error_detail?: string }

class CallbackFailure extends Error {
  constructor(readonly code: CallbackErrorCode, readonly detail?: string) {
    super(code)
  }
}

/** Only provider/configuration errors reach the browser; never expose database or unexpected errors. */
async function publicErrorDetail(error: unknown, secrets: string[]): Promise<string | undefined> {
  if (!(error instanceof InstagramApiError) && !(error instanceof ConfigError)) return undefined
  const t = await getTranslations('settings')
  let message = error.message
  for (const secret of [...secrets, process.env.INSTAGRAM_APP_SECRET?.trim() ?? ''].filter(Boolean)) {
    message = message.replaceAll(secret, t('oauth.hidden')).replaceAll(encodeURIComponent(secret), t('oauth.hidden'))
  }
  // Provider messages can echo request parameters, including credentials in a URL.
  message = message.replace(/\b(access_token|client_secret|code|state)=([^\s&#]*)/gi, `$1=${t('oauth.hidden')}`)
  const metadata = error instanceof InstagramApiError
    ? [error.status ? `HTTP ${error.status}` : t('oauth.connectionFailed'), error.code !== null ? t('oauth.code', { code: error.code }) : null]
        .filter(Boolean).join(', ')
    : t('oauth.configuration')
  return `${message.replace(/\s+/g, ' ').trim().slice(0, 600)} (${metadata})`
}

/** Runs one login step and preserves safe diagnostics for Instagram API failures. */
async function step<T>(code: CallbackErrorCode, run: () => Promise<T>, secrets: string[] = []): Promise<T> {
  try {
    return await run()
  } catch (error) {
    const detail = code === 'gagal_token' || code === 'gagal_token_panjang' || code === 'gagal_profil'
      ? await publicErrorDetail(error, secrets)
      : undefined
    console.error(`[instagram] callback ${code}:`, detail ?? describeError(error))
    throw new CallbackFailure(code, detail)
  }
}

async function completeLogin(userId: string, params: URLSearchParams): Promise<CallbackResult> {
  if (params.has('error')) return { ig_error: 'ditolak' }

  const state = params.get('state')
  const code = params.get('code')
  if (!state || !code) return { ig_error: 'state_tidak_valid' }
  // A state another user created fails here: their login must not land in this session.
  const stateResult = await step('gagal_database', () => consumeOAuthState(state, userId))
  if (stateResult === 'other_user') {
    console.warn('[instagram] callback: state dibuat pengguna lain; sesi di host callback berbeda dengan host awal')
    return { ig_error: 'sesi_lain' }
  }
  if (stateResult !== 'ok') return { ig_error: 'state_tidak_valid' }

  const secrets = [code, state]
  const shortLived = await step('gagal_token', () => exchangeCodeForToken(code), secrets)
  secrets.push(shortLived.accessToken)
  const longLived = await step('gagal_token_panjang', () => exchangeForLongLivedToken(shortLived.accessToken), secrets)
  secrets.push(longLived.accessToken)
  const profile = await step('gagal_profil', () => fetchProfile(longLived.accessToken), secrets)
  // Read before saving: the save replaces the user's one connection row.
  const previous = await step('gagal_database', () => getConnectedAccountId(userId))
  const saved = await step('gagal_database', () =>
    saveConnection(userId, profile, longLived, shortLived.permissions).then(
      () => true,
      (error: unknown) => {
        if (error instanceof AccountTakenError) return false
        throw error
      },
    ),
  )
  if (!saved) return { ig_error: 'akun_dipakai' }
  await step('gagal_database', () => switchToAccount(userId, previous, profile.userId))
  after(() => ensureWebhookSubscription(userId))
  return { ig: 'connected' }
}

/**
 * After a connection is saved: a different account than before (Hubungkan ulang with another login) takes the
 * place of Putuskan, so the old account's scheduled posts become drafts and its Threads connection goes; rows
 * without an account join this one; and an account without a brand kit yet starts from the
 * onboarding answers and is filled from Instagram once, after the redirect.
 */
async function switchToAccount(userId: string, previous: string | null, accountId: string): Promise<void> {
  if (previous && previous !== accountId) await draftScheduledPosts(userId, previous)
  await deleteOtherThreadsConnection(userId, accountId)
  await claimOrphanRows(userId, accountId)
  if (await hasBrandKit(userId, accountId)) return
  const answers = await getCompletedAnswers(userId)
  if (await startBrandSync(userId, accountId, answers ? kitColumnsOf(answers) : {})) {
    // The cookie is unreadable inside after(), so the brand analysis language is taken now.
    const language = await getUserLocale()
    after(() => syncNewAccount(userId, accountId, answers?.postsPerWeek || undefined, language))
  }
}

/** Meta redirects the signed-in user's browser here; the result is reported on the settings page. */
export async function GET(request: Request): Promise<Response> {
  const user = await currentUser()
  if (!user) return Response.redirect(appUrl('/masuk'), 303)
  if (!(await currentPeriod(user.id))) return Response.redirect(appUrl('/langganan'), 303)
  const result = await completeLogin(user.id, new URL(request.url).searchParams).catch((error: unknown) => {
    if (error instanceof CallbackFailure) {
      return { ig_error: error.code, ...(error.detail ? { ig_error_detail: error.detail } : {}) }
    }
    throw error
  })
  return Response.redirect(settingsUrl(result), 303)
}
