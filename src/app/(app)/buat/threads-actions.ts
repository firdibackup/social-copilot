'use server'

import { requireAccount } from '@/lib/auth'
import { describeError } from '@/lib/errors'
import { isUuid } from '@/lib/params'
import { PlatformError, saveThreadItems } from '@/lib/post-threads'
import { parseThreadItems } from '@/lib/thread-items'

export type ThreadItemsResult = { postId: string } | { error: string }

/**
 * The Threads editor's autosave. An empty chain makes the post follow its caption again; without a post the first
 * save starts a new post for Threads only.
 */
export async function saveThreadItemsAction(input: unknown): Promise<ThreadItemsResult> {
  const { userId } = await requireAccount()
  const fields = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const postId = fields.postId === null ? null : isUuid(fields.postId) ? fields.postId : undefined
  if (postId === undefined) return { error: 'Post tidak ditemukan.' }
  const parsed = parseThreadItems(fields.items)
  if ('error' in parsed) return parsed
  if (postId === null && parsed.items.length === 0) return { error: 'Tulis post Threads dulu.' }
  try {
    return { postId: await saveThreadItems(userId, postId, parsed.items) }
  } catch (error) {
    if (error instanceof PlatformError) return { error: error.message }
    console.error('[buat] rantai Threads gagal disimpan:', describeError(error))
    return { error: 'Post Threads gagal disimpan. Coba lagi.' }
  }
}
