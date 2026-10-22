import { listAssets } from '@/lib/assets'
import { requireAccount } from '@/lib/auth'
import { describeError } from '@/lib/errors'

/** Loaded when a photo picker opens, not on every draft navigation. */
export async function GET() {
  const { userId, accountId } = await requireAccount()
  const headers = { 'cache-control': 'private, no-store' }
  try {
    return Response.json(await listAssets(userId, accountId), { headers })
  } catch (error) {
    console.error('[buat] pustaka gagal dimuat:', describeError(error))
    return Response.json({ error: 'Foto belum bisa dimuat. Coba lagi.' }, { status: 500, headers })
  }
}
