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
  const next = firstValue((await searchParams).next)
  return <AuthForm mode="masuk" next={next ? safeNext(next) : undefined} />
}
