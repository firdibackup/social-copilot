import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { CarouselyLoader } from '@/components/brand-mark'
import { LoadingState } from '@/components/loading-state'
import { Notice } from '@/components/notice'
import { currentPeriod, requireUser } from '@/lib/auth'
import { describeError, loadErrorMessage } from '@/lib/errors'
import { getOnboarding } from '@/lib/onboarding'
import type { OnboardingAnswers } from '@/lib/onboarding-options'
import { Wizard } from './wizard'

export const metadata: Metadata = { title: 'Kenalan dulu' }

/**
 * The onboarding wizard, full screen and outside the (app) group: requireActiveUser sends a paying user here until
 * it is finished or skipped, so this page needs only the payment, not the finished wizard.
 */
export default function MulaiPage() {
  return (
    <Suspense fallback={<OnboardingLoading />}>
      <WizardLoader />
    </Suspense>
  )
}

function OnboardingLoading() {
  return (
    <div className="fixed inset-0 overflow-y-auto bg-bg px-5 py-10 sm:py-16">
      <div className="mx-auto max-w-lg space-y-10">
        <CarouselyLoader label="Menyiapkan ruang brand-mu…" />
        <LoadingState variant="form" label="Memuat pengaturan awal…" />
      </div>
    </div>
  )
}

async function WizardLoader() {
  const userId = await requireUser()
  if (!(await currentPeriod(userId))) redirect('/langganan')
  let answers: OnboardingAnswers
  try {
    answers = await getOnboarding(userId)
  } catch (error) {
    console.error('[mulai] gagal memuat:', describeError(error))
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <Notice tone="warning">{loadErrorMessage(error)}</Notice>
      </main>
    )
  }
  return <Wizard initial={answers} />
}
