'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { deleteConnection } from '@/lib/connection'
import { describeError } from '@/lib/errors'
import { isLocalRequest } from '@/lib/tunnel-guard'

export async function disconnectInstagram(): Promise<void> {
  // Server actions are POSTs to the page route, so check here too rather than trusting proxy.ts alone.
  if (!isLocalRequest(await headers())) throw new Error('Tidak diizinkan')

  const outcome = await deleteConnection().then(
    () => 'ig=disconnected',
    (error: unknown) => {
      console.error('[pengaturan] gagal memutus Instagram:', describeError(error))
      return 'ig_error=gagal_putus'
    },
  )
  redirect(`/pengaturan?${outcome}`)
}
