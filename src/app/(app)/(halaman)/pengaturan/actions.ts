'use server'

import { getTranslations } from 'next-intl/server'

import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAccount, requireUser } from '@/lib/auth'
import { disconnectInstagram as disconnectAccount } from '@/lib/connection'
import { setDensityDefault } from '@/lib/density'
import { isTextDensity } from '@/lib/density-options'
import { describeError } from '@/lib/errors'
import { applyStoryToScheduled, countStoryCandidates, setStoryDefault } from '@/lib/post-stories'
import { deleteThreadsConnection } from '@/lib/threads-connection'

/**
 * Putuskan needs no subscription: Pengaturan remains reachable when access ends.
 */
async function reportTo(settingsQuery: string, hash: string): Promise<never> {
  redirect(`/pengaturan?${settingsQuery}${hash}`)
}

export async function disconnectInstagram(): Promise<void> {
  const userId = await requireUser()

  const outcome = await disconnectAccount(userId).then(
    () => 'ig=disconnected',
    (error: unknown) => {
      console.error('[pengaturan] gagal memutus Instagram:', describeError(error))
      return 'ig_error=gagal_putus'
    },
  )
  await reportTo(outcome, '')
}

/** Scheduled Threads versions then fail with a reconnect message until Threads is connected again. */
export async function disconnectThreads(): Promise<void> {
  const userId = await requireUser()

  const outcome = await deleteThreadsConnection(userId).then(
    () => 'th=disconnected',
    (error: unknown) => {
      console.error('[pengaturan] gagal memutus Threads:', describeError(error))
      return 'th_error=gagal_putus'
    },
  )
  await reportTo(outcome, '#threads')
}

/** A message for the owner, or null when it worked. */
type ActionError = string | null

export type StoryDefaultResult = { error: string } | { scheduled: number }

/**
 * Selalu bagikan ke Story: saved as soon as it is switched. Only new posts take it; switched on, it also says how
 * many scheduled posts could take it too.
 */
export async function setStoryDefaultAction(enabled: unknown): Promise<StoryDefaultResult> {
  const t = await getTranslations('settings')

  if (typeof enabled !== 'boolean') return { error: t('actions.invalidRequest') }
  const { userId, accountId } = await requireAccount()
  try {
    await setStoryDefault(userId, accountId, enabled)
    const scheduled = enabled ? await countStoryCandidates(userId, accountId).catch(() => 0) : 0
    return { scheduled }
  } catch (error) {
    console.error('[pengaturan] Story gagal disimpan:', describeError(error))
    return { error: t('actions.couldnTSaveStorySettingsTryAgain') }
  }
}

export type ApplyStoryResult = { error: string } | { applied: number }

/** Terapkan: Story on for the account's scheduled Instagram posts as well. */
export async function applyStoryToScheduledAction(): Promise<ApplyStoryResult> {
  const t = await getTranslations('settings')

  const { userId, accountId } = await requireAccount()
  try {
    const applied = await applyStoryToScheduled(userId, accountId)
    refresh()
    return { applied }
  } catch (error) {
    console.error('[pengaturan] Story gagal diterapkan ke post terjadwal:', describeError(error))
    return { error: t('actions.couldnTApplyThisToScheduledPosts') }
  }
}

/** Kepadatan teks: the density a new post in Buat starts with, saved as soon as it is picked. */
export async function setDensityDefaultAction(density: unknown): Promise<ActionError> {
  const t = await getTranslations('settings')

  if (!isTextDensity(density)) return t('actions.unknownOption')
  const { userId, accountId } = await requireAccount()
  try {
    await setDensityDefault(userId, accountId, density)
    return null
  } catch (error) {
    console.error('[pengaturan] kepadatan teks gagal disimpan:', describeError(error))
    return t('actions.couldnTSaveTextDensityTryAgain')
  }
}
