import { requireAccount } from '@/lib/auth'
import { describeError } from '@/lib/errors'
import { isUuid } from '@/lib/params'
import { getContentRevisions } from '@/lib/posts'

export async function GET(request: Request) {
  const { userId, accountId } = await requireAccount()
  const ids = [...new Set(new URL(request.url).searchParams.getAll('id'))]
  const headers = { 'cache-control': 'private, no-store' }
  if (ids.length > 51 || !ids.every(isUuid)) {
    return Response.json({ error: 'Draft tidak valid.' }, { status: 400, headers })
  }
  try {
    return Response.json(await getContentRevisions(userId, accountId, ids), { headers })
  } catch (error) {
    console.error('[buat] status gagal dimuat:', describeError(error))
    return Response.json({ error: 'Status belum bisa dimuat.' }, { status: 500, headers })
  }
}
