import { getTranslations } from 'next-intl/server'
import { IntlMessages } from '@/i18n/client-messages'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { CarouselyLoader } from '@/components/brand-mark'
import { LoadingState } from '@/components/loading-state'
import { Notice } from '@/components/notice'
import { requireUser } from '@/lib/auth'
import { ConfigError, describeError } from '@/lib/errors'
import { getConnection } from '@/lib/connection'
import { avatarUrl } from '@/lib/instagram-lookup'
import { getOnboarding, getOnboardingExtras } from '@/lib/onboarding'
import type { OnboardingAnswers } from '@/lib/onboarding-options'
import type { SearchParams } from '@/lib/params'
import { Wizard, type WizardExtras } from './wizard'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('onboarding.page')
  return { title: t('title') }
}

/**
 * The onboarding wizard, full screen and outside the (app) group: requireActiveUser sends every user here until it is
 * finished or skipped. A user without a paid period starts on the free trial.
 */
export default function MulaiPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <Suspense fallback={<OnboardingLoading />}>
      <WizardLoader searchParams={searchParams} />
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

async function WizardLoader({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const t = await getTranslations('onboarding.page')
  const userId = await requireUser()
  let answers: OnboardingAnswers
  let extras: WizardExtras
  try {
    const [saved, stored, connection, params] = await Promise.all([
      getOnboarding(userId), getOnboardingExtras(userId), getConnection(userId), searchParams,
    ])
    answers = saved
    extras = {
      avatarUrl: await avatarUrl(stored.avatarPath),
      // The Instagram login can be done from the first step; the callback then returns here.
      connected: connection && !connection.provisional ? connection.username : null,
      loginFailed: typeof params.ig_error === 'string',
      unchecked: saved.igUsername !== '' && !stored.hasProfile,
    }
  } catch (error) {
    console.error('[mulai] gagal memuat:', describeError(error))
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <Notice tone="warning">{error instanceof ConfigError ? t('configurationError', { message: error.message }) : t('databaseError')}</Notice>
      </main>
    )
  }
  return <IntlMessages namespaces={['common', 'onboarding']}><Wizard initial={answers} extras={extras} /></IntlMessages>
}
