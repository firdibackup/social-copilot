import 'server-only'
import { listThreadItems } from './post-threads'
import { itemsFromCaption, threadItemsError } from './thread-items'
import { getThreadsConnection } from './threads-connection'

const NEEDS_THREADS =
  'Threads belum terhubung atau perlu disambungkan ulang. Hubungkan di Pengaturan, atau matikan Threads untuk post ini.'

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
export async function scheduleProblem(userId: string, accountId: string, target: ScheduleTarget): Promise<string | null> {
  if (target.instagram && target.assetIds.length === 0) return 'Pilih minimal 1 foto.'
  if (!target.threads) return null
  const connection = await getThreadsConnection(userId, accountId)
  if (connection?.status !== 'active') return NEEDS_THREADS
  const stored = await listThreadItems(userId, target.postId)
  const items =
    stored.length > 0
      ? stored.map((item) => ({ text: item.text, assetIds: item.media.map((media) => media.assetId) }))
      : itemsFromCaption(target.caption, target.assetIds)
  return threadItemsError(items)
}
