import { getTranslations } from 'next-intl/server'
import { IntlMessages } from '@/i18n/client-messages'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { firstValue, safeNext, type SearchParams } from '@/lib/params'
import { AuthCard, AuthForm } from './auth-form'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.form')
  return { title: t('login') }
}

interface MasukPageProps {
  searchParams: Promise<SearchParams>
}

export default async function MasukPage({ searchParams }: MasukPageProps) {
  const t = await getTranslations('auth.form')
  return (
    <IntlMessages namespaces={['common', 'auth']}>
    <AuthCard title={t('login')} description={t('loginDescription')}>
      <Suspense fallback={<AuthForm mode="masuk" />}>
        <SignInForm searchParams={searchParams} />
      </Suspense>
    </AuthCard>
    </IntlMessages>
  )
}

/** proxy.ts sends visitors here with `next`, the page they wanted. */
async function SignInForm({ searchParams }: MasukPageProps) {
  const t = await getTranslations('auth.form')
  const params = await searchParams
  const next = firstValue(params.next)
  const oauthError = firstValue(params.error) === 'google'
    ? t('oauthIncomplete') : undefined
  return <AuthForm mode="masuk" next={next ? safeNext(next) : undefined} oauthError={oauthError} />
}
