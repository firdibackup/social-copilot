import 'server-only'
import { markNeedsReconnect, NeedsReconnectError } from '@/lib/connection'
import { describeError } from '@/lib/errors'
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

const RECONNECT = 'Token Instagram kedaluwarsa atau dicabut. Hubungkan ulang di Pengaturan.'

export const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

/** Owner-facing text for an Instagram call that failed. Not an action: it lives outside the 'use server' files. */
export async function instagramErrorMessage(userId: string, error: unknown, context: string): Promise<string> {
  if (error instanceof NeedsReconnectError) return RECONNECT
  if (error instanceof InstagramApiError && error.isInvalidToken) {
    await markNeedsReconnect(userId)
    return RECONNECT
  }
  console.error(`[balasan] ${context}:`, describeError(error))
  return error instanceof InstagramApiError
    ? `Instagram menolak: ${error.message}`
    : 'Instagram atau database tidak bisa dihubungi. Coba lagi.'
}
