
import { getTranslations } from 'next-intl/server'
import { listAssets } from '@/lib/assets'
import { requireAccount } from '@/lib/auth'
import { describeError } from '@/lib/errors'

/** Loaded when a photo picker opens, not on every draft navigation. */
export async function GET() {
  const t = await getTranslations('editor.routeassets')

  const { userId, accountId } = await requireAccount()
  const headers = { 'cache-control': 'private, no-store' }
  try {
    return Response.json(await listAssets(userId, accountId), { headers })
  } catch (error) {
    console.error('[buat] pustaka gagal dimuat:', describeError(error))
    return Response.json({ error: t('message1') }, { status: 500, headers })
  }
}
