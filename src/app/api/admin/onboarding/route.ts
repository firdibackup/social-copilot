import { requireAdmin } from '@/lib/auth'
import { describeError } from '@/lib/errors'
import { listOnboardingRecords } from '@/lib/onboarding-admin'
import { onboardingCsv } from '@/lib/onboarding-admin-options'

/** Admin › Onboarding › Ekspor CSV: every user's answers, trial use and paywall events. */
export async function GET(): Promise<Response> {
  await requireAdmin()
  try {
    // The BOM makes Excel read the file as UTF-8.
    const csv = `﻿${onboardingCsv(await listOnboardingRecords())}`
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="carousely-onboarding-${new Date().toISOString().slice(0, 10)}.csv"`,
        'cache-control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[admin] ekspor onboarding gagal:', describeError(error))
    return new Response('Ekspor gagal. Coba lagi.', { status: 500 })
  }
}
