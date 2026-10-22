'use server'

import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import { currentPeriod, requireAccount, requireUser } from '@/lib/auth'
import { disconnectInstagram as disconnectAccount } from '@/lib/connection'
import { setDensityDefault } from '@/lib/density'
import { isTextDensity } from '@/lib/density-options'
import { describeError } from '@/lib/errors'
import { deleteFacebookConnection } from '@/lib/facebook-connection'
import { applyStoryToScheduled, countStoryCandidates, setStoryDefault } from '@/lib/post-stories'
import { deleteThreadsConnection } from '@/lib/threads-connection'

/**
 * Putuskan needs no subscription: a user whose period ended can still take their tokens out. Without a period
 * Pengaturan would send them on to Langganan, so the result is reported there.
 */
async function reportTo(userId: string, settingsQuery: string, hash: string): Promise<never> {
  if (await currentPeriod(userId)) redirect(`/pengaturan?${settingsQuery}${hash}`)
  redirect(`/langganan?${settingsQuery}`)
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
  await reportTo(userId, outcome, '')
}

export async function disconnectFacebook(): Promise<void> {
  const userId = await requireUser()

  const outcome = await deleteFacebookConnection(userId).then(
    () => 'fb=disconnected',
    (error: unknown) => {
      console.error('[pengaturan] gagal memutus Facebook:', describeError(error))
      return 'fb_error=gagal_putus'
    },
  )
  await reportTo(userId, outcome, '#facebook')
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
  await reportTo(userId, outcome, '#threads')
}

/** A message for the owner, or null when it worked. */
type ActionError = string | null

export type StoryDefaultResult = { error: string } | { scheduled: number }

/**
 * Selalu bagikan ke Story: saved as soon as it is switched. Only new posts take it; switched on, it also says how
 * many scheduled posts could take it too.
 */
export async function setStoryDefaultAction(enabled: unknown): Promise<StoryDefaultResult> {
  if (typeof enabled !== 'boolean') return { error: 'Permintaan tidak valid.' }
  const { userId, accountId } = await requireAccount()
  try {
    await setStoryDefault(userId, accountId, enabled)
    const scheduled = enabled ? await countStoryCandidates(userId, accountId).catch(() => 0) : 0
    return { scheduled }
  } catch (error) {
    console.error('[pengaturan] Story gagal disimpan:', describeError(error))
    return { error: 'Pengaturan Story gagal disimpan. Coba lagi.' }
  }
}

export type ApplyStoryResult = { error: string } | { applied: number }

/** Terapkan: Story on for the account's scheduled Instagram posts as well. */
export async function applyStoryToScheduledAction(): Promise<ApplyStoryResult> {
  const { userId, accountId } = await requireAccount()
  try {
    const applied = await applyStoryToScheduled(userId, accountId)
    refresh()
    return { applied }
  } catch (error) {
    console.error('[pengaturan] Story gagal diterapkan ke post terjadwal:', describeError(error))
    return { error: 'Gagal menerapkan ke post terjadwal. Coba lagi.' }
  }
}

/** Kepadatan teks: the density a new post in Buat starts with, saved as soon as it is picked. */
export async function setDensityDefaultAction(density: unknown): Promise<ActionError> {
  if (!isTextDensity(density)) return 'Pilihan tidak dikenal.'
  const { userId, accountId } = await requireAccount()
  try {
    await setDensityDefault(userId, accountId, density)
    return null
  } catch (error) {
    console.error('[pengaturan] kepadatan teks gagal disimpan:', describeError(error))
    return 'Kepadatan teks gagal disimpan. Coba lagi.'
  }
}
