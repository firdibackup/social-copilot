import { requireAccount } from '@/lib/auth'
import { createOAuthState } from '@/lib/connection'
import { settingsUrl } from '@/lib/env'
import { describeError } from '@/lib/errors'
import { buildThreadsAuthorizeUrl } from '@/lib/threads'

/** Threads is connected for the Instagram account (brand) connected now, so it needs one first. */
export async function GET(): Promise<Response> {
  const { userId } = await requireAccount()
  try {
    return Response.redirect(buildThreadsAuthorizeUrl(await createOAuthState(userId)), 303)
  } catch (error) {
    console.error('[threads] gagal memulai OAuth:', describeError(error))
    return Response.redirect(settingsUrl({ th_error: 'gagal_mulai' }), 303)
  }
}
