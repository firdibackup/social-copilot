'use server'

import { redirect } from 'next/navigation'
import { requireActiveUser } from '@/lib/auth'
import { disconnectInstagram as disconnectAccount } from '@/lib/connection'
import { describeError } from '@/lib/errors'
import { deleteFacebookConnection } from '@/lib/facebook-connection'

export async function disconnectInstagram(): Promise<void> {
  const userId = await requireActiveUser()

  const outcome = await disconnectAccount(userId).then(
    () => 'ig=disconnected',
    (error: unknown) => {
      console.error('[pengaturan] gagal memutus Instagram:', describeError(error))
      return 'ig_error=gagal_putus'
    },
  )
  redirect(`/pengaturan?${outcome}`)
}

export async function disconnectFacebook(): Promise<void> {
  const userId = await requireActiveUser()

  const outcome = await deleteFacebookConnection(userId).then(
    () => 'fb=disconnected',
    (error: unknown) => {
      console.error('[pengaturan] gagal memutus Facebook:', describeError(error))
      return 'fb_error=gagal_putus'
    },
  )
  redirect(`/pengaturan?${outcome}#facebook`)
}
