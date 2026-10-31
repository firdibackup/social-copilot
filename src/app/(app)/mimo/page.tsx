import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoadingState } from '@/components/loading-state'
import { MimoWorkspace } from './mimo-workspace'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('mimo.page')
  return { title: t('title') }
}

/** A small navigation shell; conversations use the account-scoped browser cache. */
export default async function MimoPage() {
  const t = await getTranslations('mimo.page')
  return <Suspense fallback={<LoadingState variant="chat" className="h-full" label={t('loading')} />}><MimoWorkspace /></Suspense>
}
