'use server'

import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { startCheckout } from '@/lib/billing'
import { describeError } from '@/lib/errors'

/** Sends the user to Mayar's checkout for one more period; the page reports a failure as `?gagal=bayar`. */
export async function startCheckoutAction(): Promise<void> {
  const user = await currentUser()
  if (!user) redirect('/masuk')

  let link: string
  try {
    link = await startCheckout(user.id, user.email)
  } catch (error) {
    console.error('[langganan] checkout gagal dibuat:', describeError(error))
    redirect('/langganan?gagal=bayar')
  }
  redirect(link)
}
