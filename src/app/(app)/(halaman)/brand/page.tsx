
import { getUserLocale } from '@/i18n/locale'
import { localizeLibraryMessage } from './localized-errors'
import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { IntlMessages } from '@/i18n/client-messages'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { LoadingState } from '@/components/loading-state'
import { Notice } from '@/components/notice'
import { requireAccount } from '@/lib/auth'
import { getBillingCatalog } from '@/lib/billing-catalog'
import { DEFAULT_CATALOG } from '@/lib/billing-catalog-options'
import { getBrandKit, listReferences, VISUAL_REFERENCE_LIMIT } from '@/lib/brand'
import { getConnection } from '@/lib/connection'
import { describeError, loadErrorMessage } from '@/lib/errors'
import { BrandForm } from './brand-form'
import { ReferencesPanel } from './references-panel'
import { StrategyCard } from './strategy-card'
import { SyncRefresher } from './sync-refresher'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('brand')
  return { title: t('metadata.title') }
}

export default async function BrandPage() {
  const t = await getTranslations('brand')
  return (
    <IntlMessages namespaces={['common', 'brand']}>
    <div className="max-w-5xl space-y-8">
      <header className="max-w-2xl space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{t('page.text1')}</h1>
        <p className="text-zinc-500">
          {t('page.text2')}</p>
      </header>
      <Suspense fallback={<LoadingState variant="form" label={t('page.text3')} />}>
        <BrandStudio />
      </Suspense>
    </div>
    </IntlMessages>
  )
}

async function BrandStudio() {
  const t = await getTranslations('brand')
  await connection()
  const { userId, accountId } = await requireAccount()
  let data
  try {
    const [kit, references, instagram, billing] = await Promise.all([
      getBrandKit(userId, accountId),
      listReferences(userId, accountId),
      getConnection(userId),
      getBillingCatalog().catch(() => ({ catalog: DEFAULT_CATALOG })),
    ])
    data = { kit, references, instagram, labelCredits: billing.catalog.rates.reference_labels }
  } catch (error) {
    console.error('[brand] gagal memuat:', describeError(error))
    return <Notice tone="warning">{localizeLibraryMessage(loadErrorMessage(error), await getUserLocale())}</Notice>
  }

  const instagramUsername = data.instagram?.status === 'active' ? data.instagram.username : null
  const syncing = data.kit.syncStatus
  return (
    <div className="space-y-10">
      {syncing === 'running' && (
        <Notice tone="success">
          {t('page.syncing', { username: data.instagram?.username ?? t('page.text5') })}<SyncRefresher />
        </Notice>
      )}
      {syncing === 'failed' && (
        <Notice tone="warning">
          {t('page.text7')}</Notice>
      )}
      <StrategyCard strategy={data.kit.strategy} syncing={syncing === 'running'} />
      {/* The form copies the kit into state once: remount it when the fill finishes, or it keeps the empty kit. */}
      <BrandForm
        key={syncing ?? 'siap'}
        kit={data.kit}
        references={data.references}
        instagramUsername={instagramUsername}
        visualLimit={VISUAL_REFERENCE_LIMIT}
      />
      <ReferencesPanel
        references={data.references}
        instagramUsername={instagramUsername}
        labelCredits={data.labelCredits}
      />
    </div>
  )
}
