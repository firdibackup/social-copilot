import { requireUser } from '@/lib/auth'
import { createOAuthState } from '@/lib/connection'
import { settingsUrl } from '@/lib/env'
import { describeError } from '@/lib/errors'
import { buildAuthorizeUrl } from '@/lib/instagram'

export async function GET(): Promise<Response> {
  const userId = await requireUser()
  try {
    return Response.redirect(buildAuthorizeUrl(await createOAuthState(userId)), 303)
  } catch (error) {
    console.error('[instagram] gagal memulai OAuth:', describeError(error))
    return Response.redirect(settingsUrl({ ig_error: 'gagal_mulai' }), 303)
  }
}
