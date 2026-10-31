import { getTranslations } from 'next-intl/server'
import { IntlMessages } from '@/i18n/client-messages'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { CarouselyLoader } from '@/components/brand-mark'
import { LoadingState } from '@/components/loading-state'
import { Notice } from '@/components/notice'
import { currentPeriod, requireUser } from '@/lib/auth'
import { ConfigError, describeError } from '@/lib/errors'
import { getOnboarding } from '@/lib/onboarding'
import type { OnboardingAnswers } from '@/lib/onboarding-options'
import { Wizard } from './wizard'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('onboarding.page')
  return { title: t('title') }
}

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

async function OnboardingLoading() {
  const t = await getTranslations('onboarding.page')
  return (
    <div className="fixed inset-0 overflow-y-auto bg-bg px-5 py-10 sm:py-16">
      <div className="mx-auto max-w-lg space-y-10">
        <CarouselyLoader label={t('preparing')} />
        <LoadingState variant="form" label={t('loading')} />
      </div>
    </div>
  )
}

async function WizardLoader() {
  const t = await getTranslations('onboarding.page')
  const userId = await requireUser()
  if (!(await currentPeriod(userId))) redirect('/langganan')
  let answers: OnboardingAnswers
  try {
    answers = await getOnboarding(userId)
  } catch (error) {
    console.error('[mulai] gagal memuat:', describeError(error))
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <Notice tone="warning">{error instanceof ConfigError ? t('configurationError', { message: error.message }) : t('databaseError')}</Notice>
      </main>
    )
  }
  return <IntlMessages namespaces={['common', 'onboarding']}><Wizard initial={answers} /></IntlMessages>
}
