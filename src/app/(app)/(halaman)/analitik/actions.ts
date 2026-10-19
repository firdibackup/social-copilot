'use server'

import { refresh } from 'next/cache'
import { MissingInsightsPermissionError, syncAnalytics } from '@/lib/analytics-sync'
import { requireAccount } from '@/lib/auth'
import { markNeedsReconnect, NeedsReconnectError } from '@/lib/connection'
import { describeError } from '@/lib/errors'
import { InstagramApiError } from '@/lib/instagram'

export interface RefreshResult {
  status: 'done' | 'cooldown' | 'error'
  message: string
}

const RECONNECT = 'Token Instagram kedaluwarsa atau dicabut. Hubungkan ulang Instagram.'
const MISSING_PERMISSION = 'Analitik butuh izin membaca insights. Hubungkan ulang Instagram sekali.'
const COOLDOWN = 'Data baru saja disinkronkan. Refresh bisa dipakai lagi 10 menit setelah sync terakhir.'

async function errorMessage(userId: string, error: unknown): Promise<string> {
  if (error instanceof MissingInsightsPermissionError) return MISSING_PERMISSION
  if (error instanceof NeedsReconnectError) return RECONNECT
  if (error instanceof InstagramApiError && error.isInvalidToken) {
    await markNeedsReconnect(userId)
    return RECONNECT
  }
  console.error('[analitik] sync gagal:', describeError(error))
  return error instanceof InstagramApiError
    ? `Instagram menolak: ${error.message}`
    : 'Instagram atau database tidak bisa dihubungi. Coba lagi.'
}

/** Refresh, and the page's own sync when its data is over 6 hours old. */
export async function refreshAnalytics(): Promise<RefreshResult> {
  const { userId, accountId } = await requireAccount()
  let result: RefreshResult
  try {
    const synced = await syncAnalytics(userId, accountId)
    if (synced === 'cooldown') return { status: 'cooldown', message: COOLDOWN }
    result = {
      status: 'done',
      message: `Refresh selesai: ${synced.updated} post diperbarui, ${synced.failed} gagal.`,
    }
  } catch (error) {
    result = { status: 'error', message: await errorMessage(userId, error) }
  }
  // Also after an error: a token marked for reconnecting changes what the page shows.
  refresh()
  return result
}
