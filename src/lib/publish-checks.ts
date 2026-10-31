
import { createTranslator } from 'next-intl'
import type { Locale } from '@/i18n/locale-config'
import idMessages from '../../messages/id/editor.json'
import enMessages from '../../messages/en/editor.json'
import 'server-only'
import { listThreadItems } from './post-threads'
import { itemsFromCaption, threadItemsError } from './thread-items'
import { getThreadsConnection } from './threads-connection'


export interface ScheduleTarget {
  postId: string
  instagram: boolean
  threads: boolean
  /** The content being scheduled: what the editor sends, or the stored post. */
  caption: string
  assetIds: readonly string[]
}

/**
 * Why the post can't go on the schedule for its platforms, or null: Instagram needs a photo, and Threads a working
 * connection and a chain it accepts (the stored one, or the caption split as the worker would).
 */
export async function scheduleProblem(userId: string, accountId: string, target: ScheduleTarget, locale: Locale = 'id'): Promise<string | null> {
  const t = createTranslator({ locale, messages: locale === 'en' ? enMessages : idMessages, namespace: 'publishChecks' })

  if (target.instagram && target.assetIds.length === 0) return t('message1')
  if (!target.threads) return null
  const connection = await getThreadsConnection(userId, accountId)
  if (connection?.status !== 'active') return t('needsThreads')
  const stored = await listThreadItems(userId, target.postId)
  const items =
    stored.length > 0
      ? stored.map((item) => ({ text: item.text, assetIds: item.media.map((media) => media.assetId) }))
      : itemsFromCaption(target.caption, target.assetIds)
  return threadItemsError(items, locale)
}
