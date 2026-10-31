import { aiErrorMessage, AiLimitError, AiOutputError } from '@/lib/ai'
import { RouterApiError } from '@/lib/nine-router'
import { getLocale, getTranslations } from 'next-intl/server'
import 'server-only'
import { markNeedsReconnect, NeedsReconnectError } from '@/lib/connection'
import { ConfigError, describeError } from '@/lib/errors'
import { InstagramApiError } from '@/lib/instagram'

/** Each action returns a message for the owner, or null when it worked. */
export type ActionError = string | null

/** What a pull from Instagram (DMs, comments) tells the Muat ulang button. */
export interface SyncState {
  status: 'done' | 'cooldown' | 'error'
  message: string
}

/** What the ✨ AI button gets back: the draft, or a message for the owner. */
export type DraftResult = { draft: string } | { error: string }

export const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

/** Owner-facing text for an Instagram call that failed. Not an action: it lives outside the 'use server' files. */
export async function instagramErrorMessage(userId: string, error: unknown, context: string): Promise<string> {
  const t = await getTranslations('inbox.actionUtils')
  const RECONNECT = t('yourInstagramTokenExpiredOrWasRevokedReconnectIn')
  if (error instanceof NeedsReconnectError) return RECONNECT
  if (error instanceof InstagramApiError && error.isInvalidToken) {
    await markNeedsReconnect(userId)
    return RECONNECT
  }
  console.error(`[balasan] ${context}:`, describeError(error))
  return error instanceof InstagramApiError
    ? t('rejected', { message: error.message })
    : t('couldnTReachInstagramOrTheDatabaseTryAgain')
}

/** Localized load errors for the inbox pages. */
export async function inboxLoadError(error: unknown): Promise<string> {
  const t = await getTranslations('inbox.actionUtils')
  return error instanceof ConfigError ? t('loadConfig', { message: error.message }) : t('loadDatabase')
}

/** Only the operator-facing error is localized; AI prompts and generated replies stay untouched. */
export async function inboxAiError(error: unknown): Promise<string> {
  if (await getLocale() === 'id') return aiErrorMessage(error)
  const t = await getTranslations('inbox.aiErrors')
  if (error instanceof ConfigError) return t('config', { message: error.message })
  if (error instanceof AiOutputError) return t('output', { snippet: error.snippet })
  if (error instanceof AiLimitError) {
    const renewal = error.message.match(/Kuota baru mulai (.*), atau/)?.[1]
    return renewal ? t('credits', { date: renewal }) : t('inactive')
  }
  if (error instanceof RouterApiError) {
    const { status } = error
    if (status === 0) return t('unreachable')
    if (status === 200) return t('empty')
    if (status === 401 || status === 403) return t('key')
    if (status === 404) return t('model')
    if (status === 413) return t('large')
    if (status === 429) return t('quota')
    if (status >= 500) return t('service')
    return t('rejected', { status })
  }
  return t('database')
}
