'use server'

import { getTranslations } from 'next-intl/server'

import { refresh } from 'next/cache'
import { requireAccount } from '@/lib/auth'
import { getPublishingAccount } from '@/lib/connection'
import {
  getConversation,
  isReplyWindowOpen,
  listMessages,
  markConversationSeen,
  recordMessage,
} from '@/lib/dm'
import { REPLY_MAX_LENGTH } from '@/lib/inbox-rules'
import { describeError } from '@/lib/errors'
import { PROFILE_BATCH, readProfiles, syncConversations } from '@/lib/inbox-sync'
import { sendDirectMessage } from '@/lib/instagram'
import { draftReply, REPLY_CONTEXT_MESSAGES } from '@/lib/reply-ai'
import { inboxAiError, instagramErrorMessage, text, type ActionError, type DraftResult, type SyncState } from './action-utils'

/** Opening the DM tab and Muat ulang: stores the DMs Instagram has that the webhook never brought, at most every 10 minutes. */
export async function syncDmsAction(): Promise<SyncState> {
  const t = await getTranslations('inbox.actions')
  const { userId } = await requireAccount()
  let result: SyncState
  try {
    const synced = await syncConversations(userId)
    if (synced === 'cooldown') return { status: 'cooldown', message: t('dmsWereJustFetchedFromInstagram') }
    result = {
      status: 'done',
      message: synced.messages > 0 ? t('syncedCount', { count: synced.messages }) : t('allDmsAreUpToDate'),
    }
  } catch (error) {
    result = { status: 'error', message: await instagramErrorMessage(userId, error, 'DM gagal ditarik') }
  }
  refresh()
  return result
}

export async function sendReply(igsid: unknown, reply: unknown): Promise<ActionError> {
  const t = await getTranslations('inbox.actions')
  const WINDOW_CLOSED =
  t('itSBeenOver24HoursSinceTheCustomer')
  const { userId, accountId } = await requireAccount()
  const message = text(reply)
  if (!message) return t('writeAReplyFirst')
  if (message.length > REPLY_MAX_LENGTH) return t('replyLimit', { max: REPLY_MAX_LENGTH })

  const customer = typeof igsid === 'string' ? igsid : ''
  let mid: string
  try {
    // Null too for a conversation of an account that isn't the connected one: replies go out from that account.
    const conversation = customer ? await getConversation(userId, accountId, customer) : null
    if (!conversation) return t('conversationNotFound')
    if (!isReplyWindowOpen(conversation, new Date())) return WINDOW_CLOSED
    const account = await getPublishingAccount(userId)
    mid = await sendDirectMessage(account.accessToken, account.instagramUserId, customer, message)
  } catch (error) {
    return instagramErrorMessage(userId, error, 'balasan gagal dikirim')
  }

  // The DM is out. If this write fails, the webhook echo stores it moments later.
  await recordMessage(userId, { mid, igsid: customer, fromCustomer: false, text: message, sentAt: new Date() }).catch(
    (error: unknown) => console.error('[balasan] balasan terkirim tapi gagal disimpan:', describeError(error)),
  )
  refresh()
  return null
}

export async function syncProfilesAction(value: unknown): Promise<void> {
  const { userId, accountId } = await requireAccount()
  if (!Array.isArray(value)) return
  const ids = [...new Set(value.filter((item): item is string => typeof item === 'string' && item !== ''))].slice(0, PROFILE_BATCH)
  try {
    const conversations = (
      await Promise.all(ids.map((igsid) => getConversation(userId, accountId, igsid)))
    ).filter((conversation) => conversation !== null)
    if ((await readProfiles(userId, conversations)).length > 0) refresh()
  } catch (error) {
    console.error('[balasan] profil lama gagal diisi:', describeError(error))
  }
}

/**
 * Called by the open thread once it shows, never while rendering. No refresh(): the list's dot goes on the next
 * navigation, and the bell polls on its own.
 */
export async function markConversationSeenAction(igsid: unknown): Promise<void> {
  const { userId, accountId } = await requireAccount()
  if (typeof igsid !== 'string' || igsid === '') return
  try {
    await markConversationSeen(userId, accountId, igsid)
  } catch (error) {
    console.error('[balasan] status dibaca gagal disimpan:', describeError(error))
  }
}

/** ✨ AI in a DM: writes a reply from the conversation, or tidies the owner's draft. Sends nothing. */
export async function draftDmReply(igsid: unknown, draft: unknown): Promise<DraftResult> {
  const t = await getTranslations('inbox.actions')
  const { userId, accountId } = await requireAccount()
  const customer = typeof igsid === 'string' ? igsid : ''
  const ownerDraft = typeof draft === 'string' ? draft.slice(0, REPLY_MAX_LENGTH) : ''
  try {
    const conversation = customer ? await getConversation(userId, accountId, customer) : null
    if (!conversation) return { error: t('conversationNotFound') }
    const messages = (await listMessages(userId, customer)).slice(-REPLY_CONTEXT_MESSAGES)
    if (messages.length === 0 && !ownerDraft.trim()) return { error: t('noMessagesToReplyToYet') }
    const reply = await draftReply(userId, {
      channel: 'dm',
      lines: messages.map((message) => ({ fromCustomer: message.fromCustomer, text: message.text })),
      draft: ownerDraft,
    })
    return { draft: reply }
  } catch (error) {
    console.error('[balasan] draf AI gagal:', describeError(error))
    return { error: await inboxAiError(error) }
  }
}
