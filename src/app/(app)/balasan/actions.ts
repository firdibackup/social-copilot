'use server'

import { refresh } from 'next/cache'
import { getPublishingAccount, getValidAccessToken, markNeedsReconnect, NeedsReconnectError } from '@/lib/connection'
import { deleteTemplate, getConversation, isReplyWindowOpen, recordMessage, saveTemplate, saveVariables } from '@/lib/dm'
import { KEYWORD_MAX_LENGTH, parseVariables, REPLY_MAX_LENGTH } from '@/lib/dm-templates'
import { describeError } from '@/lib/errors'
import { InstagramApiError, sendDirectMessage, subscribeToMessages } from '@/lib/instagram'
import { assertLocalRequest } from '@/lib/local-only'
import { isUuid } from '@/lib/params'

/** Each action returns a message for the owner, or null when it worked. */
type ActionError = string | null

const RECONNECT = 'Token Instagram kedaluwarsa atau dicabut. Hubungkan ulang di Pengaturan.'
const WINDOW_CLOSED =
  'Sudah lewat 24 jam sejak pesan terakhir pelanggan, jadi Instagram tidak menerima balasan dari aplikasi. Balas lewat aplikasi Instagram.'

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

/** Owner-facing text for an Instagram call that failed. */
async function instagramErrorMessage(error: unknown, context: string): Promise<string> {
  if (error instanceof NeedsReconnectError) return RECONNECT
  if (error instanceof InstagramApiError && error.isInvalidToken) {
    await markNeedsReconnect()
    return RECONNECT
  }
  console.error(`[balasan] ${context}:`, describeError(error))
  return error instanceof InstagramApiError
    ? `Instagram menolak: ${error.message}`
    : 'Instagram atau database tidak bisa dihubungi. Coba lagi.'
}

export async function sendReply(igsid: unknown, reply: unknown): Promise<ActionError> {
  await assertLocalRequest()
  const message = text(reply)
  if (!message) return 'Tulis balasan dulu.'
  if (message.length > REPLY_MAX_LENGTH) return `Balasan maksimal ${REPLY_MAX_LENGTH} karakter.`

  const customer = typeof igsid === 'string' ? igsid : ''
  let mid: string
  try {
    const conversation = customer ? await getConversation(customer) : null
    if (!conversation) return 'Percakapan tidak ditemukan.'
    if (!isReplyWindowOpen(conversation, new Date())) return WINDOW_CLOSED
    const account = await getPublishingAccount()
    mid = await sendDirectMessage(account.accessToken, account.instagramUserId, customer, message)
  } catch (error) {
    return instagramErrorMessage(error, 'balasan gagal dikirim')
  }

  // The DM is out. If this write fails, the webhook echo stores it moments later.
  await recordMessage({ mid, igsid: customer, fromCustomer: false, text: message, sentAt: new Date() }).catch(
    (error: unknown) => console.error('[balasan] balasan terkirim tapi gagal disimpan:', describeError(error)),
  )
  refresh()
  return null
}

export async function saveTemplateAction(id: unknown, keyword: unknown, body: unknown): Promise<ActionError> {
  await assertLocalRequest()
  const templateId = id === null ? null : isUuid(id) ? id : undefined
  const trigger = text(keyword)
  const reply = text(body)
  if (templateId === undefined) return 'Template tidak ditemukan.'
  if (!reply) return 'Isi template dulu.'
  if (reply.length > REPLY_MAX_LENGTH) return `Template maksimal ${REPLY_MAX_LENGTH} karakter.`
  if (trigger.length > KEYWORD_MAX_LENGTH) return `Kata kunci maksimal ${KEYWORD_MAX_LENGTH} karakter.`

  try {
    if (!(await saveTemplate(templateId, trigger || null, reply))) return 'Template tidak ditemukan.'
  } catch (error) {
    console.error('[balasan] template gagal disimpan:', describeError(error))
    return 'Template gagal disimpan. Periksa koneksi Supabase.'
  }
  refresh()
  return null
}

export async function deleteTemplateAction(id: unknown): Promise<ActionError> {
  await assertLocalRequest()
  if (!isUuid(id)) return 'Template tidak ditemukan.'
  try {
    await deleteTemplate(id)
  } catch (error) {
    console.error('[balasan] template gagal dihapus:', describeError(error))
    return 'Template gagal dihapus. Coba lagi.'
  }
  refresh()
  return null
}

export async function saveVariablesAction(lines: unknown): Promise<ActionError> {
  await assertLocalRequest()
  const parsed = parseVariables(typeof lines === 'string' ? lines : '')
  if ('error' in parsed) return parsed.error
  try {
    await saveVariables(parsed.variables)
  } catch (error) {
    console.error('[balasan] variabel gagal disimpan:', describeError(error))
    return 'Variabel gagal disimpan. Periksa koneksi Supabase.'
  }
  refresh()
  return null
}

/** Asks Meta to send the connected account's DMs to the webhook. */
export async function subscribeAction(): Promise<ActionError> {
  await assertLocalRequest()
  try {
    await subscribeToMessages(await getValidAccessToken())
    return null
  } catch (error) {
    return instagramErrorMessage(error, 'langganan DM gagal')
  }
}
