import sharp from 'sharp'
import { requireAccount } from '@/lib/auth'
import { downloadMedia } from '@/lib/assets'
import { isUuid } from '@/lib/params'
import { db, unwrap } from '@/lib/supabase'
import { describeError } from '@/lib/errors'

/** Private thumbnails: fixed sizes, ownership checked, no arbitrary upstream URLs. */
export async function GET(request: Request) {
  const { userId, accountId } = await requireAccount()
  const params = new URL(request.url).searchParams
  const id = params.get('id')
  const width = Number(params.get('w'))
  const noStore = { 'cache-control': 'private, no-store' }
  if (!isUuid(id) || ![96, 256].includes(width) || params.get('scope') !== `${userId}:${accountId}`) {
    return new Response(null, { status: 400, headers: noStore })
  }
  try {
    const asset = unwrap(await db().from('assets').select('storage_path')
      .eq('id', id).eq('user_id', userId).eq('account_id', accountId).maybeSingle()) as { storage_path: string } | null
    if (!asset) return new Response(null, { status: 404, headers: noStore })
    const image = await sharp(await downloadMedia(asset.storage_path))
      .rotate().resize({ width, height: width, fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer()
    return new Response(new Uint8Array(image), { headers: {
      'content-type': 'image/webp', 'cache-control': 'private, max-age=300', 'vary': 'Cookie',
      'x-content-type-options': 'nosniff',
    } })
  } catch (error) {
    console.error('[buat] thumbnail gagal:', describeError(error))
    return new Response(null, { status: 500, headers: noStore })
  }
}
