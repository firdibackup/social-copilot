import { requireAccount } from '@/lib/auth'
import { describeError } from '@/lib/errors'
import { isUuid } from '@/lib/params'
import { db, unwrap } from '@/lib/supabase'

/** A separate HTTP request can cancel an image edit while its server action is still running. */
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return Response.json({ error: 'Permintaan tidak diizinkan.' }, { status: 403 })
  }
  const { userId, accountId } = await requireAccount()
  const input = await request.json().catch(() => null)
  if (!input || !isUuid(input.postId) || !['content', 'images', 'slide', 'edit'].includes(input.target)
    || (['slide', 'edit'].includes(input.target) && !isUuid(input.id))) {
    return Response.json({ error: 'Permintaan pembatalan tidak valid.' }, { status: 400 })
  }
  try {
    const cancelled = unwrap(await db().rpc('cancel_generation', {
      p_user_id: userId, p_account_id: accountId, p_post_id: input.postId,
      p_target: input.target, p_id: ['slide', 'edit'].includes(input.target) ? input.id : null,
    }))
    return Response.json({ cancelled })
  } catch (error) {
    console.error('[buat] pembatalan gagal:', describeError(error))
    return Response.json({ error: 'Proses belum berhasil dibatalkan. Coba lagi.' }, { status: 500 })
  }
}
