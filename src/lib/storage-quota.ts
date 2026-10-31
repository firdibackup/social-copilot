import 'server-only'
import type { Locale } from '@/i18n/locale-config'
import { MAX_STORED_BYTES, STORAGE_FULL_CODE, storageFullMessage, fileTooLargeMessage } from './storage-quota-options'
import { db } from './supabase'

/**
 * Per-user storage for every paid plan (Pro and Max), across all of the user's accounts. System-only: never send
 * this number, or how much is used, to the browser.
 */
const QUOTA_BYTES = 250 * 1024 * 1024

/** The user's storage is full. Its message is safe to show and carries no numbers. */
export class StorageFullError extends Error {
  override name = 'StorageFullError'
  readonly code = STORAGE_FULL_CODE
  constructor(locale: Locale = 'id') {
    super(storageFullMessage(locale))
  }
}

/** The file is above the per-file limit even after compression. */
export class FileTooLargeError extends Error {
  override name = 'FileTooLargeError'
  constructor(locale: Locale = 'id') {
    super(fileTooLargeMessage(locale))
  }
}

export async function storageUsed(userId: string): Promise<number> {
  const { data, error } = await db().rpc('storage_used', { p_user_id: userId })
  if (error) throw new Error(`Supabase: ${error.message}`)
  return Number(data ?? 0)
}

/** Whether `incoming` more bytes still fit. Unreadable usage fails open: a Storage hiccup shouldn't block work. */
export async function hasStorageRoom(userId: string, incoming = 0): Promise<boolean> {
  try {
    return (await storageUsed(userId)) + incoming <= QUOTA_BYTES
  } catch (error) {
    console.error('[storage] pemakaian tidak terbaca:', error instanceof Error ? error.message : error)
    return true
  }
}

/** Run before every user-owned upload. Throws FileTooLargeError or StorageFullError. */
export async function assertStorageAvailable(userId: string, bytes: number, locale: Locale = 'id'): Promise<void> {
  if (bytes > MAX_STORED_BYTES) throw new FileTooLargeError(locale)
  if (!(await hasStorageRoom(userId, bytes))) {
    console.warn('[storage] kuota penuh, unggahan ditolak:', userId)
    throw new StorageFullError(locale)
  }
}

/** Ids of the user's AI images that no post, thread or slide uses, oldest first: what Aset suggests deleting. */
export async function listCleanupCandidates(userId: string, limit = 100): Promise<string[]> {
  const { data, error } = await db().rpc('storage_cleanup_candidates', { p_user_id: userId, p_limit: limit })
  if (error) throw new Error(`Supabase: ${error.message}`)
  return ((data ?? []) as { id: string }[]).map((row) => row.id)
}

/** For the admin panel only. */
export const storageQuotaBytes = () => QUOTA_BYTES
