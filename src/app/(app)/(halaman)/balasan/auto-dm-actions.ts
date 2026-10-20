'use server'

import { refresh } from 'next/cache'
import { deleteRule, saveRule, setRuleActive } from '@/lib/auto-dm'
import { parseRuleInput } from '@/lib/auto-dm-rules'
import { requireAccount } from '@/lib/auth'
import { getPublishingAccount } from '@/lib/connection'
import { describeError } from '@/lib/errors'
import { fetchOwnMedia } from '@/lib/instagram'
import { isUuid } from '@/lib/params'
import { instagramErrorMessage, type ActionError } from './action-utils'

const NOT_FOUND = 'Aturan tidak ditemukan.'
/** Posts in the "Satu post" picker. */
const POST_PICKER_LIMIT = 24

/** A post the rule can listen to. `thumbnailUrl` is a signed CDN link: never log it. */
export interface RulePost {
  id: string
  thumbnailUrl: string | null
  caption: string
  likes: number | null
  comments: number | null
}

/**
 * Simpan: a new rule starts active. The form goes back to the DM tab itself: a redirect here would reject the
 * action's promise in the browser, which reads as a failure.
 */
export async function saveAutoDmRuleAction(id: unknown, input: unknown): Promise<ActionError> {
  const { userId, accountId } = await requireAccount()
  const ruleId = id === null ? null : isUuid(id) ? id : undefined
  if (ruleId === undefined) return NOT_FOUND
  const parsed = parseRuleInput(input)
  if ('error' in parsed) return parsed.error

  try {
    if (!(await saveRule(userId, accountId, ruleId, parsed.rule))) return NOT_FOUND
  } catch (error) {
    console.error('[auto-dm] aturan gagal disimpan:', describeError(error))
    return 'Aturan gagal disimpan. Periksa koneksi Supabase.'
  }
  refresh()
  return null
}

/** Jedakan / Lanjutkan. */
export async function setAutoDmRuleActiveAction(id: unknown, active: unknown): Promise<ActionError> {
  const { userId, accountId } = await requireAccount()
  if (!isUuid(id) || typeof active !== 'boolean') return NOT_FOUND
  try {
    if (!(await setRuleActive(userId, accountId, id, active))) return NOT_FOUND
  } catch (error) {
    console.error('[auto-dm] status aturan gagal diubah:', describeError(error))
    return 'Status aturan gagal diubah. Coba lagi.'
  }
  refresh()
  return null
}

export async function deleteAutoDmRuleAction(id: unknown): Promise<ActionError> {
  const { userId, accountId } = await requireAccount()
  if (!isUuid(id)) return NOT_FOUND
  try {
    await deleteRule(userId, accountId, id)
  } catch (error) {
    console.error('[auto-dm] aturan gagal dihapus:', describeError(error))
    return 'Aturan gagal dihapus. Coba lagi.'
  }
  refresh()
  return null
}

/** The account's newest posts, read from Instagram when the form opens. */
export async function listRulePostsAction(): Promise<{ posts: RulePost[] } | { error: string }> {
  const { userId } = await requireAccount()
  try {
    const media = await fetchOwnMedia((await getPublishingAccount(userId)).accessToken, POST_PICKER_LIMIT)
    return {
      posts: media.map((post) => ({
        id: post.id,
        thumbnailUrl: post.thumbnailUrl,
        caption: post.caption,
        likes: post.likes,
        comments: post.comments,
      })),
    }
  } catch (error) {
    return { error: await instagramErrorMessage(userId, error, 'post gagal dimuat') }
  }
}
