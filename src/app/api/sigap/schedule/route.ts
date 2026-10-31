import { getUserLocale } from '@/i18n/locale'
import { getTranslations } from 'next-intl/server'
import { requireAccount } from '@/lib/auth'
import { getMessage, getSession } from '@/lib/chat'
import { loadScheduleData } from '@/lib/chat-schedule'
import type { ScheduleRef } from '@/lib/chat-schedule-options'
import { describeError } from '@/lib/errors'
import { parseWibInput } from '@/lib/format'
import { isUuid } from '@/lib/params'

export async function GET(request: Request) {
  const t = await getTranslations('mimo.api')
  const locale = await getUserLocale()
  const { userId, accountId } = await requireAccount()
  const query = new URL(request.url).searchParams
  const sessionId = query.get('session')
  const messageId = query.get('message')
  const cardId = query.get('card')
  const headers = { 'cache-control': 'private, no-store' }
  if (!isUuid(sessionId) || !isUuid(messageId) || !isUuid(cardId)) return Response.json({ error: t('invalidCard') }, { status: 400, headers })
  try {
    if (!await getSession(userId, accountId, sessionId)) return Response.json({ error: t('chatMissing') }, { status: 404, headers })
    const message = await getMessage(userId, sessionId, messageId)
    const card = message?.parts.find((part) => (part.type === 'schedule' || part.type === 'bulk') && part.id === cardId)
    let refs: ScheduleRef[]
    if (card?.type === 'schedule') refs = card.items
    else if (card?.type === 'bulk' && card.state === 'started') refs = card.items.map((item) => ({ kind: 'post', id: item.postId, title: item.title }))
    else return Response.json({ error: t('cardMissing') }, { status: 404, headers })
    const from = card.type === 'schedule' && card.from ? parseWibInput(card.from) : null
    return Response.json(await loadScheduleData(userId, accountId, refs, from ?? undefined, locale), { headers })
  } catch (error) {
    console.error('[mimo] jadwal gagal dimuat:', describeError(error))
    return Response.json({ error: t('scheduleError') }, { status: 500, headers })
  }
}
