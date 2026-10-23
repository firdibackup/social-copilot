import type { Metadata } from 'next'
import { Suspense } from 'react'
import { firstValue, safeNext, type SearchParams } from '@/lib/params'
import { AuthCard, AuthForm } from './auth-form'

export const metadata: Metadata = { title: 'Masuk' }

interface MasukPageProps {
  searchParams: Promise<SearchParams>
}

export default function MasukPage({ searchParams }: MasukPageProps) {
  return (
    <AuthCard title="Masuk" description="Jadwalkan konten dan balas DM Instagram dari satu tempat.">
      <Suspense fallback={<AuthForm mode="masuk" />}>
        <SignInForm searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  )
}

/** proxy.ts sends visitors here with `next`, the page they wanted. */
async function SignInForm({ searchParams }: MasukPageProps) {
  const params = await searchParams
  const next = firstValue(params.next)
  const oauthError = firstValue(params.error) === 'google'
    ? 'Login Google tidak selesai atau sesi sudah kedaluwarsa. Silakan coba lagi.' : undefined
  return <AuthForm mode="masuk" next={next ? safeNext(next) : undefined} oauthError={oauthError} />
}
