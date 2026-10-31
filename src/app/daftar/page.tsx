import { getTranslations } from 'next-intl/server'
import { IntlMessages } from '@/i18n/client-messages'
import type { Metadata } from 'next'
import { AuthCard, AuthForm } from '../masuk/auth-form'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.form')
  return { title: t('signup') }
}

export default async function DaftarPage() {
  const t = await getTranslations('auth.form')
  return (
    <IntlMessages namespaces={['common', 'auth']}>
    <AuthCard
      title={t('create')}
      description={t('signupDescription')}
    >
      <AuthForm mode="daftar" />
    </AuthCard>
    </IntlMessages>
  )
}
