import { createOAuthState } from '@/lib/connection'
import { settingsUrl } from '@/lib/env'
import { describeError } from '@/lib/errors'
import { buildAuthorizeUrl } from '@/lib/instagram'
import { isLocalRequest } from '@/lib/tunnel-guard'

export async function GET(request: Request): Promise<Response> {
  // proxy.ts already hides this route from the tunnel; checked again so it stays safe if the proxy changes.
  if (!isLocalRequest(request.headers)) return new Response(null, { status: 404 })

  try {
    return Response.redirect(buildAuthorizeUrl(await createOAuthState()), 303)
  } catch (error) {
    console.error('[instagram] gagal memulai OAuth:', describeError(error))
    return Response.redirect(settingsUrl({ ig_error: 'gagal_mulai' }), 303)
  }
}
