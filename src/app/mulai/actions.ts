'use server'

import { currentPeriod, requireUser } from '@/lib/auth'
import { getConnectedAccountId } from '@/lib/connection'
import { describeError } from '@/lib/errors'
import { saveOnboarding } from '@/lib/onboarding'
import { parseAnswers } from '@/lib/onboarding-options'

export type OnboardingResult = { error: string } | { next: string }

/**
 * Saves the wizard's answers. `complete` (Selesai or Lewati) ends it: the user goes on to connect Instagram, or
 * back to the app when an account is connected already. Without it, the answers are kept for a later visit.
 */
export async function saveOnboardingAction(input: unknown, complete: unknown): Promise<OnboardingResult> {
  const userId = await requireUser()
  if (!(await currentPeriod(userId))) return { next: '/langganan' }
  const parsed = parseAnswers(input)
  if ('error' in parsed) return parsed
  try {
    await saveOnboarding(userId, parsed.answers, complete === true)
    if (complete !== true) return { next: '' }
    return { next: (await getConnectedAccountId(userId)) ? '/kalender' : '/pengaturan?baru=1#instagram' }
  } catch (error) {
    console.error('[mulai] jawaban gagal disimpan:', describeError(error))
    return { error: 'Jawaban gagal disimpan. Coba lagi.' }
  }
}
