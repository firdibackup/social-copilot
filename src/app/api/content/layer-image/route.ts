import { requireAccount } from '@/lib/auth'
import { downloadMedia } from '@/lib/assets'
import { describeError } from '@/lib/errors'
import { imageType } from '@/lib/image'
import { isUuid } from '@/lib/params'
import { db, unwrap } from '@/lib/supabase'

/**
 * The stored bytes of one of the owner's images, same-origin, so the layer editor's export canvas isn't tainted
 * (instead of CORS on signed storage URLs). Ownership checked; only JPEG and PNG are served.
 */
export async function GET(request: Request) {
  const { userId, accountId } = await requireAccount()
  const id = new URL(request.url).searchParams.get('id')
  const noStore = { 'cache-control': 'private, no-store' }
  if (!isUuid(id)) return new Response(null, { status: 400, headers: noStore })
  try {
    const asset = unwrap(await db().from('assets').select('storage_path')
      .eq('id', id).eq('user_id', userId).eq('account_id', accountId).maybeSingle()) as { storage_path: string } | null
    if (!asset) return new Response(null, { status: 404, headers: noStore })
    const bytes = await downloadMedia(asset.storage_path)
    const type = imageType(bytes)
    if (type !== 'image/jpeg' && type !== 'image/png') return new Response(null, { status: 415, headers: noStore })
    return new Response(new Uint8Array(bytes), { headers: {
      'content-type': type, 'cache-control': 'private, max-age=300', 'vary': 'Cookie',
      'x-content-type-options': 'nosniff',
    } })
  } catch (error) {
    console.error('[lapisan] gambar lapisan gagal:', describeError(error))
    return new Response(null, { status: 500, headers: noStore })
  }
}
