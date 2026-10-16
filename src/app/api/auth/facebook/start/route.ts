import { requireUser } from '@/lib/auth'
import { createOAuthState } from '@/lib/connection'
import { settingsUrl } from '@/lib/env'
import { describeError } from '@/lib/errors'
import { buildFacebookAuthorizeUrl } from '@/lib/facebook'

export async function GET(): Promise<Response> {
  const userId = await requireUser()
  try {
    return Response.redirect(buildFacebookAuthorizeUrl(await createOAuthState(userId)), 303)
  } catch (error) {
    console.error('[facebook] gagal memulai OAuth:', describeError(error))
    return Response.redirect(settingsUrl({ fb_error: 'gagal_mulai' }), 303)
  }
}
