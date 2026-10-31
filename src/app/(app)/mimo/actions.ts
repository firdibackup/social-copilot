'use server'

import { getTranslations } from 'next-intl/server'
import { getUserLocale, type Locale } from '@/i18n/locale'
import { refresh } from 'next/cache'
import { aiErrorMessage, remainingCredits } from '@/lib/ai'
import { getPlan } from '@/lib/app-settings'
import { getBillingCatalog } from '@/lib/billing-catalog'
import { listProductGroups } from '@/lib/assets'
import { parseRuleInput } from '@/lib/auto-dm-rules'
import { requireAccount } from '@/lib/auth'
import { formatCreditShare } from '@/lib/billing-options'
import { bulkContentRequest } from '@/lib/bulk-content'
import { deleteSession, discardScript, getMessage, getSession, resolveConfirmation, updateBulkCard } from '@/lib/chat'
import {
  applyBulkEdits,
  bulkBrief,
  bulkItemCost,
  parseBulkSettings,
  type BulkSettings,
  type BulkItem,
  type BulkPlanItem,
  type ChatPart,
} from '@/lib/chat-options'
import { enqueueContentJob, getContentJobByKey } from '@/lib/content-jobs'
import { AUTO_PRODUCT } from '@/lib/content-options'
import { getDensityDefault } from '@/lib/density'
import { describeError } from '@/lib/errors'
import { deleteAccountIdea, ensureIdea, getAccountIdea } from '@/lib/ideas'
import { isUuid } from '@/lib/params'
import { ContentError } from '@/lib/posts'
import { parseStrategy } from '@/lib/strategy-options'
import { hasStorageRoom, StorageFullError } from '@/lib/storage-quota'
import { storageFullMessage } from '@/lib/storage-quota-options'

/** An error to show, or null when it went through. */
type ActionError = string | null


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
  const t = await getTranslations('mimo.actions')
  const { userId, accountId } = await requireAccount()
  const locale = await getUserLocale()
  if (!isUuid(confirmId)) return t('notFound')
  try {
    const message = await loadMessage(userId, accountId, sessionId, messageId)
    const card = message?.parts.find((part) => part.type === 'confirm' && part.id === confirmId)
    if (!message || card?.type !== 'confirm') return t('notFound')
    if (card.state !== 'pending') return null

    let payload: unknown
    if (card.kind === 'strategy') {
      const parsed = parseStrategy(card.payload, locale)
      if ('error' in parsed) return parsed.error
      payload = card.payload
    } else {
      const parsed = parseRuleInput(card.payload, locale)
      if ('error' in parsed) return parsed.error
      payload = card.payload
    }
    const result = await resolveConfirmation(userId, accountId, message.id, confirmId, card.kind, payload, accept)
    if (result === 'not_found') return t('notFound')
  } catch (error) {
    console.error('[mimo] konfirmasi gagal:', describeError(error))
    return t('failed')
  }
  refresh()
  return null
}

/** Buang on a script Mimo saved: the idea leaves Buat, and the card says so. */
export async function discardScriptAction(sessionId: string, messageId: string, ideaId: string): Promise<ActionError> {
  const t = await getTranslations('mimo.actions')
  const { userId, accountId } = await requireAccount()
  try {
    const message = await loadMessage(userId, accountId, sessionId, messageId)
    const owns = message?.parts.some((part) => part.type === 'scripts' && part.items.some((item) => item.ideaId === ideaId))
    if (!message || !owns || !isUuid(ideaId)) return t('notFound')
    const result = await discardScript(userId, accountId, message.id, ideaId)
    if (result === 'not_found') return t('notFound')
  } catch (error) {
    console.error('[mimo] skrip gagal dibuang:', describeError(error))
    return t('discardFailed')
  }
  refresh()
  return null
}

type BulkCard = Extract<ChatPart, { type: 'bulk' }>

/** The bulk card on the owner's message, or null. */
async function loadBulkCard(userId: string, accountId: string, sessionId: unknown, messageId: unknown, bulkId: unknown) {
  if (!isUuid(bulkId)) return null
  const message = await loadMessage(userId, accountId, sessionId, messageId)
  const card = message?.parts.find((part): part is BulkCard => part.type === 'bulk' && part.id === bulkId)
  return message && card ? { message, card } : null
}

/**
 * Queues one approved plan item, safely more than once: its key is the job's request key (and a new topic's idea
 * id), so a second run finds the post the first one made. A new topic gets its script written from the plan's
 * angle and outline, then goes straight on to its images; a saved script is drawn as it is.
 */
async function queueBulkItem(userId: string, accountId: string, item: BulkPlanItem, settings: BulkSettings, locale: Locale): Promise<BulkItem> {
  const t = await getTranslations('mimo.actions')
  const { density, productGroupId } = settings
  const existing = await getContentJobByKey(userId, accountId, item.key)
  if (existing) return { postId: existing.post_id, ideaId: existing.idea_id ?? item.key, title: item.title }

  if (item.scripted && item.ideaId) {
    const idea = await getAccountIdea(userId, accountId, item.ideaId)
    if (!idea) throw new ContentError(t('ideaMissing'))
    if (!idea.script) throw new ContentError(t('invalidScript'))
    const request = { ...bulkContentRequest(item, idea.id, density, productGroupId), slides: idea.script.length }
    const postId = await enqueueContentJob(userId, accountId, item.key, idea.id, 'content', { request, script: idea.script, attachmentPath: null }, locale)
    return { postId, ideaId: idea.id, title: idea.title }
  }

  const ideaId = item.ideaId ?? item.key
  if (!item.ideaId) await ensureIdea(userId, accountId, ideaId, { title: item.title, pillarId: item.pillarId })
  try {
    const postId = await enqueueContentJob(userId, accountId, item.key, ideaId, 'script', {
      density,
      brief: bulkBrief(item),
      auto: { request: bulkContentRequest(item, ideaId, density, productGroupId) },
    }, locale)
    return { postId, ideaId, title: item.title }
  } catch (error) {
    if (!item.ideaId) await deleteAccountIdea(userId, accountId, ideaId).catch(() => undefined)
    throw error
  }
}

const queueErrorMessage = (error: unknown, t: Awaited<ReturnType<typeof getTranslations<'mimo.actions'>>>) => {
  if (error instanceof ContentError) return error.message
  const text = describeError(error)
  if (text.includes('idea_not_found')) return t('ideaMissing')
  if (text.includes('wrong_account')) return t('accountChanged')
  if (text.includes('script_not_ready')) return t('scriptWriting')
  return t('queueFailed')
}

/**
 * Setuju on Mimo's bulk plan, with the owner's edits: the only step that spends quota. The whole plan's cost is
 * checked first, then every post is queued and its script, caption and images are made in the background without
 * asking again. Moving the card to `starting` first makes a double click or a second tab start nothing twice; a
 * card left in `starting` (the server stopped mid-way) is finished by the next click, safely, from its saved plan.
 */
export async function startBulkAction(sessionId: string, messageId: string, bulkId: string, edits: unknown, inputSettings?: unknown): Promise<ActionError> {
  const t = await getTranslations('mimo.actions')
  const { userId, accountId } = await requireAccount()
  const locale = await getUserLocale()
  if (!(await hasStorageRoom(userId))) return storageFullMessage(await getUserLocale())
  try {
    const found = await loadBulkCard(userId, accountId, sessionId, messageId, bulkId)
    if (!found) return t('notFound')
    const { message, card } = found
    if (card.state === 'started') return null
    if (card.state === 'cancelled') return t('cancelled')

    let plan = card.plan
    let settings = card.settings
    if (card.state === 'proposed') {
      const edited = applyBulkEdits(card.plan, edits, locale)
      if ('error' in edited) return edited.error
      plan = edited.plan

      const parsed = parseBulkSettings(inputSettings === undefined
        ? settings ?? { density: await getDensityDefault(userId, accountId), productGroupId: AUTO_PRODUCT }
        : inputSettings, locale)
      if ('error' in parsed) return parsed.error
      settings = parsed.settings
      if (settings.productGroupId !== null && settings.productGroupId !== AUTO_PRODUCT) {
        const products = await listProductGroups(userId, accountId)
        if (!products.some((product) => product.id === settings!.productGroupId)) {
          return t('productMissing')
        }
      }

      const [{ remaining, period }, billing] = await Promise.all([remainingCredits(userId), getBillingCatalog()])
      const { credits } = period?.plan ?? await getPlan()
      const total = plan.reduce((sum, item) => sum + bulkItemCost(item, billing.catalog.rates), 0)
      if (total > remaining) {
        return t('quota', { needed: formatCreditShare(total, credits, locale), remaining: formatCreditShare(remaining, credits, locale) })
      }
      const moved = await updateBulkCard(userId, accountId, message.id, card.id, 'proposed', { state: 'starting', plan, settings })
      if (moved === 'not_found') return t('notFound')
      // Another click or tab is starting it.
      if (moved === 'already') return null
    }

    // Old cards may have started before bulk settings existed.
    settings ??= { density: await getDensityDefault(userId, accountId), productGroupId: AUTO_PRODUCT }
    const items: BulkItem[] = []
    const errors: string[] = []
    for (const item of plan) {
      try {
        const queued = await queueBulkItem(userId, accountId, item, settings, locale)
        if (!items.some((other) => other.postId === queued.postId)) items.push(queued)
      } catch (error) {
        console.error('[mimo] konten massal gagal diantrekan:', describeError(error))
        errors.push(`${item.title}: ${queueErrorMessage(error, t)}`)
      }
    }

    if (items.length === 0) {
      // Nothing was queued, so nothing was spent: the plan stays to try again.
      await updateBulkCard(userId, accountId, message.id, card.id, 'starting', { state: 'proposed', errors })
      refresh()
      return errors.join(' ') || t('failed')
    }
    await updateBulkCard(userId, accountId, message.id, card.id, 'starting', { state: 'started', items, errors })
    refresh()
    return null
  } catch (error) {
    if (error instanceof StorageFullError) return storageFullMessage(await getUserLocale())
    console.error('[mimo] konten massal gagal dimulai:', describeError(error))
    return aiErrorMessage(error)
  }
}

/** Batal on Mimo's bulk plan, before anything was made. */
export async function cancelBulkAction(sessionId: string, messageId: string, bulkId: string): Promise<ActionError> {
  const t = await getTranslations('mimo.actions')
  const { userId, accountId } = await requireAccount()
  try {
    const found = await loadBulkCard(userId, accountId, sessionId, messageId, bulkId)
    if (!found) return t('notFound')
    if (found.card.state !== 'proposed') return null
    const result = await updateBulkCard(userId, accountId, found.message.id, found.card.id, 'proposed', { state: 'cancelled' })
    if (result === 'not_found') return t('notFound')
  } catch (error) {
    console.error('[mimo] rencana konten massal gagal dibatalkan:', describeError(error))
    return t('failed')
  }
  refresh()
  return null
}

/** Removes a conversation and its messages. Scripts it saved stay in Buat. */
export async function deleteSessionAction(sessionId: string): Promise<ActionError> {
  const t = await getTranslations('mimo.actions')
  const { userId, accountId } = await requireAccount()
  if (!isUuid(sessionId)) return t('conversationMissing')
  try {
    await deleteSession(userId, accountId, sessionId)
  } catch (error) {
    console.error('[mimo] percakapan gagal dihapus:', describeError(error))
    return t('deleteFailed')
  }
  refresh()
  return null
}
