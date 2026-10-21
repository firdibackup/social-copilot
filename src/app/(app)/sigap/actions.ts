'use server'

import { refresh } from 'next/cache'
import { parseRuleInput } from '@/lib/auto-dm-rules'
import { requireAccount } from '@/lib/auth'
import { deleteSession, discardScript, getMessage, getSession, resolveConfirmation } from '@/lib/chat'
import { describeError } from '@/lib/errors'
import { isUuid } from '@/lib/params'
import { parseStrategy } from '@/lib/strategy-options'

/** An error to show, or null when it went through. */
type ActionError = string | null

const NOT_FOUND = 'Pesan tidak ditemukan. Muat ulang halaman.'
const FAILED = 'Gagal menyimpan. Coba lagi.'

/** The message a card belongs to, checked to be the owner's, in a conversation of the connected account. */
async function loadMessage(userId: string, accountId: string, sessionId: unknown, messageId: unknown) {
  if (!isUuid(sessionId) || !isUuid(messageId)) return null
  if (!(await getSession(userId, accountId, sessionId))) return null
  return getMessage(userId, sessionId, messageId)
}

/**
 * Simpan or Batal on a confirmation card. The payload stored with the card is checked again by the same parsers
 * the forms use, then saved like the Brand and Balasan pages save it.
 */
export async function resolveConfirmAction(
  sessionId: string,
  messageId: string,
  confirmId: string,
  accept: boolean,
): Promise<ActionError> {
  const { userId, accountId } = await requireAccount()
  if (!isUuid(confirmId)) return NOT_FOUND
  try {
    const message = await loadMessage(userId, accountId, sessionId, messageId)
    const card = message?.parts.find((part) => part.type === 'confirm' && part.id === confirmId)
    if (!message || card?.type !== 'confirm') return NOT_FOUND
    if (card.state !== 'pending') return null

    let payload: unknown
    if (card.kind === 'strategy') {
      const parsed = parseStrategy(card.payload)
      if ('error' in parsed) return parsed.error
      payload = card.payload
    } else {
      const parsed = parseRuleInput(card.payload)
      if ('error' in parsed) return parsed.error
      payload = card.payload
    }
    const result = await resolveConfirmation(userId, accountId, message.id, confirmId, card.kind, payload, accept)
    if (result === 'not_found') return NOT_FOUND
  } catch (error) {
    console.error('[sigap] konfirmasi gagal:', describeError(error))
    return FAILED
  }
  refresh()
  return null
}

/** Buang on a script Sigap saved: the idea leaves Buat, and the card says so. */
export async function discardScriptAction(sessionId: string, messageId: string, ideaId: string): Promise<ActionError> {
  const { userId, accountId } = await requireAccount()
  try {
    const message = await loadMessage(userId, accountId, sessionId, messageId)
    const owns = message?.parts.some((part) => part.type === 'scripts' && part.items.some((item) => item.ideaId === ideaId))
    if (!message || !owns || !isUuid(ideaId)) return NOT_FOUND
    const result = await discardScript(userId, accountId, message.id, ideaId)
    if (result === 'not_found') return NOT_FOUND
  } catch (error) {
    console.error('[sigap] skrip gagal dibuang:', describeError(error))
    return 'Gagal membuang skrip. Coba lagi.'
  }
  refresh()
  return null
}

/** Removes a conversation and its messages. Scripts it saved stay in Buat. */
export async function deleteSessionAction(sessionId: string): Promise<ActionError> {
  const { userId, accountId } = await requireAccount()
  if (!isUuid(sessionId)) return 'Percakapan tidak ditemukan.'
  try {
    await deleteSession(userId, accountId, sessionId)
  } catch (error) {
    console.error('[sigap] percakapan gagal dihapus:', describeError(error))
    return 'Gagal menghapus percakapan. Coba lagi.'
  }
  refresh()
  return null
}
