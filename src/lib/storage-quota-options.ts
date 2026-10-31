import type { Locale } from '@/i18n/locale-config'
import id from '../../messages/id/assets.json'
import en from '../../messages/en/assets.json'
/**
 * Client-safe storage limits. The per-user quota itself lives only in storage-quota.ts (server-only): never import
 * or show it here, and never put either number in a user-facing message.
 */

/** Largest file the app stores. Browser and server pipelines compress below it; the server rejects anything above. */
export const MAX_STORED_BYTES = 2 * 1024 * 1024

/** Stable signal for structured errors; legacy string responses remain supported in both languages. */
export const STORAGE_FULL_CODE = 'storage_full'

/** Indonesian compatibility export for existing callers. */
export const STORAGE_FULL_MESSAGE = id.storage.full

/** Localized copy for action responses. */
export const storageFullMessage = (locale: Locale = 'id') => (locale === 'en' ? en : id).storage.full
export const fileTooLargeMessage = (locale: Locale = 'id') => (locale === 'en' ? en : id).storage.fileTooLarge
