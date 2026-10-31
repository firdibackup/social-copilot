'use server'

import { refresh } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { MissingInsightsPermissionError, syncAnalytics } from '@/lib/analytics-sync'
import { requireAccount } from '@/lib/auth'
import { markNeedsReconnect, NeedsReconnectError } from '@/lib/connection'
import { describeError } from '@/lib/errors'
import { InstagramApiError } from '@/lib/instagram'

export interface RefreshResult {
  status: 'done' | 'cooldown' | 'error'
  message: string
}

async function errorMessage(userId: string, error: unknown): Promise<string> {
  const t = await getTranslations('analytics.sync')
  if (error instanceof MissingInsightsPermissionError) return t('permission')
  if (error instanceof NeedsReconnectError) return t('reconnect')
  if (error instanceof InstagramApiError && error.isInvalidToken) {
    await markNeedsReconnect(userId)
    return t('reconnect')
  }
  console.error('[analitik] sync gagal:', describeError(error))
  return error instanceof InstagramApiError
    ? t('rejected', { message: error.message })
    : t('unavailable')
}

/** Refresh, and the page's own sync when its data is over 6 hours old. */
export async function refreshAnalytics(): Promise<RefreshResult> {
  const t = await getTranslations('analytics.sync')
  const { userId, accountId } = await requireAccount()
  let result: RefreshResult
  try {
    const synced = await syncAnalytics(userId, accountId)
    if (synced === 'cooldown') return { status: 'cooldown', message: t('cooldown') }
    result = {
      status: 'done',
      message: t('done', { updated: synced.updated, failed: synced.failed }),
    }
  } catch (error) {
    result = { status: 'error', message: await errorMessage(userId, error) }
  }
  // Also after an error: a token marked for reconnecting changes what the page shows.
  refresh()
  return result
}
