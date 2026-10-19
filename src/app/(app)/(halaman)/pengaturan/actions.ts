'use server'

import { redirect } from 'next/navigation'
import { currentPeriod, requireUser } from '@/lib/auth'
import { disconnectInstagram as disconnectAccount } from '@/lib/connection'
import { describeError } from '@/lib/errors'
import { deleteFacebookConnection } from '@/lib/facebook-connection'

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
