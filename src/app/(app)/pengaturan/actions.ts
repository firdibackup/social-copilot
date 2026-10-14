'use server'

import { redirect } from 'next/navigation'
import { deleteConnection } from '@/lib/connection'
import { describeError } from '@/lib/errors'
import { assertLocalRequest } from '@/lib/local-only'

export async function disconnectInstagram(): Promise<void> {
  await assertLocalRequest()

  const outcome = await deleteConnection().then(
    () => 'ig=disconnected',
    (error: unknown) => {
      console.error('[pengaturan] gagal memutus Instagram:', describeError(error))
      return 'ig_error=gagal_putus'
    },
  )
  redirect(`/pengaturan?${outcome}`)
}
