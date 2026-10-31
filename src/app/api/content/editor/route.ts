
import { getTranslations } from 'next-intl/server'
import { requireAccount } from '@/lib/auth'
import { loadEditorDetail, loadEditorSupport } from '@/lib/editor-data'
import { describeError } from '@/lib/errors'
import { isUuid } from '@/lib/params'

export async function GET(request: Request) {
  const t = await getTranslations('editor.routeeditor')

  const scope = await requireAccount()
  const params = new URL(request.url).searchParams
  const headers = { 'cache-control': 'private, no-store' }
  // The browser's cache key must agree with the currently authenticated scope.
  if (params.get('scope') !== `${scope.userId}:${scope.accountId}`) {
    return Response.json({ error: t('message1') }, { status: 409, headers })
  }
  if (['id', 'ide'].some((key) => params.has(key) && !isUuid(params.get(key)))) {
    return Response.json({ error: t('message2') }, { status: 400, headers })
  }
  const start = performance.now()
  try {
    const data = params.get('part') === 'support'
      ? await loadEditorSupport(scope)
      : await loadEditorDetail(scope, Object.fromEntries(params))
    return Response.json(data, { headers: { ...headers, 'server-timing': `editor;dur=${(performance.now() - start).toFixed(1)}` } })
  } catch (error) {
    console.error('[buat] editor gagal dimuat:', describeError(error))
    return Response.json({ error: t('message3') }, { status: 500, headers })
  }
}
