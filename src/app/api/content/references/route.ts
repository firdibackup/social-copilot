import { requireAccount } from '@/lib/auth'
import { listReferences } from '@/lib/brand'
import { describeError } from '@/lib/errors'

/** Loaded when the reference picker opens, not with the editor: it signs a URL for every reference image. */
export async function GET() {
  const { userId, accountId } = await requireAccount()
  const headers = { 'cache-control': 'private, no-store' }
  try {
    return Response.json(await listReferences(userId, accountId), { headers })
  } catch (error) {
    console.error('[buat] referensi gagal dimuat:', describeError(error))
    return Response.json({ error: 'Referensi belum bisa dimuat. Coba lagi.' }, { status: 500, headers })
  }
}
