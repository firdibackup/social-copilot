'use server'

import { refresh } from 'next/cache'
import { aiErrorMessage } from '@/lib/ai'
import { requireAccount } from '@/lib/auth'
import { getPublishingAccount } from '@/lib/connection'
import {
  deleteTemplate,
  getConversation,
  isReplyWindowOpen,
  listMessages,
  markConversationSeen,
  recordMessage,
  saveTemplate,
  saveVariables,
} from '@/lib/dm'
import { KEYWORD_MAX_LENGTH, parseVariables, REPLY_MAX_LENGTH } from '@/lib/dm-templates'
import { describeError } from '@/lib/errors'
import { PROFILE_BATCH, readProfiles, syncConversations } from '@/lib/inbox-sync'
import { sendDirectMessage } from '@/lib/instagram'
import { isUuid } from '@/lib/params'
import { draftReply, REPLY_CONTEXT_MESSAGES } from '@/lib/reply-ai'
import { instagramErrorMessage, text, type ActionError, type DraftResult, type SyncState } from './action-utils'

const WINDOW_CLOSED =
  'Sudah lewat 24 jam sejak pesan terakhir pelanggan, jadi Instagram tidak menerima balasan dari aplikasi. Balas lewat aplikasi Instagram.'

/** Opening the DM tab and Muat ulang: stores the DMs Instagram has that the webhook never brought, at most every 10 minutes. */
export async function syncDmsAction(): Promise<SyncState> {
  const { userId } = await requireAccount()
  let result: SyncState
  try {
    const synced = await syncConversations(userId)
    if (synced === 'cooldown') return { status: 'cooldown', message: 'DM baru saja ditarik dari Instagram.' }
    result = {
      status: 'done',
      message: synced.messages > 0 ? `${synced.messages} pesan ditarik dari Instagram.` : 'Semua DM sudah ada.',
    }
  } catch (error) {
    result = { status: 'error', message: await instagramErrorMessage(userId, error, 'DM gagal ditarik') }
  }
  refresh()
  return result
}

export async function sendReply(igsid: unknown, reply: unknown): Promise<ActionError> {
  const { userId, accountId } = await requireAccount()
  const message = text(reply)
  if (!message) return 'Tulis balasan dulu.'
  if (message.length > REPLY_MAX_LENGTH) return `Balasan maksimal ${REPLY_MAX_LENGTH} karakter.`

  const customer = typeof igsid === 'string' ? igsid : ''
  let mid: string
  try {
    // Null too for a conversation of an account that isn't the connected one: replies go out from that account.
    const conversation = customer ? await getConversation(userId, accountId, customer) : null
    if (!conversation) return 'Percakapan tidak ditemukan.'
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

export async function saveTemplateAction(id: unknown, keyword: unknown, body: unknown): Promise<ActionError> {
  const { userId } = await requireAccount()
  const templateId = id === null ? null : isUuid(id) ? id : undefined
  const trigger = text(keyword)
  const reply = text(body)
  if (templateId === undefined) return 'Template tidak ditemukan.'
  if (!reply) return 'Isi template dulu.'
  if (reply.length > REPLY_MAX_LENGTH) return `Template maksimal ${REPLY_MAX_LENGTH} karakter.`
  if (trigger.length > KEYWORD_MAX_LENGTH) return `Kata kunci maksimal ${KEYWORD_MAX_LENGTH} karakter.`

  try {
    if (!(await saveTemplate(userId, templateId, trigger || null, reply))) return 'Template tidak ditemukan.'
  } catch (error) {
    console.error('[balasan] template gagal disimpan:', describeError(error))
    return 'Template gagal disimpan. Periksa koneksi Supabase.'
  }
  refresh()
  return null
}

export async function deleteTemplateAction(id: unknown): Promise<ActionError> {
  const { userId } = await requireAccount()
  if (!isUuid(id)) return 'Template tidak ditemukan.'
  try {
    await deleteTemplate(userId, id)
  } catch (error) {
    console.error('[balasan] template gagal dihapus:', describeError(error))
    return 'Template gagal dihapus. Coba lagi.'
  }
  refresh()
  return null
}

export async function saveVariablesAction(lines: unknown): Promise<ActionError> {
  const { userId, accountId } = await requireAccount()
  const parsed = parseVariables(typeof lines === 'string' ? lines : '')
  if ('error' in parsed) return parsed.error
  try {
    await saveVariables(userId, accountId, parsed.variables)
  } catch (error) {
    console.error('[balasan] variabel gagal disimpan:', describeError(error))
    return 'Variabel gagal disimpan. Periksa koneksi Supabase.'
  }
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
  const { userId, accountId } = await requireAccount()
  const customer = typeof igsid === 'string' ? igsid : ''
  const ownerDraft = typeof draft === 'string' ? draft.slice(0, REPLY_MAX_LENGTH) : ''
  try {
    const conversation = customer ? await getConversation(userId, accountId, customer) : null
    if (!conversation) return { error: 'Percakapan tidak ditemukan.' }
    const messages = (await listMessages(userId, customer)).slice(-REPLY_CONTEXT_MESSAGES)
    if (messages.length === 0 && !ownerDraft.trim()) return { error: 'Belum ada pesan untuk dibalas.' }
    const reply = await draftReply(userId, {
      channel: 'dm',
      lines: messages.map((message) => ({ fromCustomer: message.fromCustomer, text: message.text })),
      draft: ownerDraft,
    })
    return { draft: reply }
  } catch (error) {
    console.error('[balasan] draf AI gagal:', describeError(error))
    return { error: aiErrorMessage(error) }
  }
}
