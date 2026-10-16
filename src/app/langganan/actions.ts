'use server'

import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { grantFreePeriod, paymentsEnabled, startCheckout } from '@/lib/billing'
import { describeError } from '@/lib/errors'

/**
 * Sends the user to Mayar's checkout for one more period, or grants it at once while payments are off. The page
 * reports a failure as `?gagal=bayar`.
 */
export async function startCheckoutAction(): Promise<void> {
  const user = await currentUser()
  if (!user) redirect('/masuk')

  if (!paymentsEnabled()) {
    try {
      await grantFreePeriod(user.id)
    } catch (error) {
      console.error('[langganan] periode gratis gagal dibuat:', describeError(error))
      redirect('/langganan?gagal=bayar')
    }
    redirect('/langganan?bayar=selesai')
  }

  let link: string
  try {
    link = await startCheckout(user.id, user.email)
  } catch (error) {
    console.error('[langganan] checkout gagal dibuat:', describeError(error))
    redirect('/langganan?gagal=bayar')
  }
  redirect(link)
}
