import { getTranslations } from 'next-intl/server'
import { requireAccount } from '@/lib/auth'
import { listSessions } from '@/lib/chat'
import { describeError } from '@/lib/errors'
import { isUuid } from '@/lib/params'
import { loadMimoConversation, loadMimoSupport } from '@/lib/mimo-data'

export async function GET(request: Request) {
  const t = await getTranslations('mimo.api')
  const scope = await requireAccount()
  const params = new URL(request.url).searchParams
  const headers = { 'cache-control': 'private, no-store' }
  if (params.get('scope') !== `${scope.userId}:${scope.accountId}`) {
    return Response.json({ error: t('accountChanged') }, { status: 409, headers })
  }
  const part = params.get('part')
  const id = params.get('id')
  if (!['sessions', 'conversation', 'support'].includes(part ?? '') || (part === 'conversation' && !isUuid(id))) {
    return Response.json({ error: t('invalidConversation') }, { status: 400, headers })
  }
  try {
    const data = part === 'sessions' ? await listSessions(scope.userId, scope.accountId)
      : part === 'support' ? await loadMimoSupport(scope)
        : await loadMimoConversation(scope, id!)
    return Response.json(data, { headers })
  } catch (error) {
    console.error('[mimo] workspace gagal dimuat:', describeError(error))
    return Response.json({ error: t('loadError') }, { status: 500, headers })
  }
}
