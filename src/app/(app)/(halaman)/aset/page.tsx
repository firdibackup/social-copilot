
import { getUserLocale } from '@/i18n/locale'
import { localizeLibraryMessage } from '../brand/localized-errors'
import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { IntlMessages } from '@/i18n/client-messages'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { LoadingState } from '@/components/loading-state'
import { Notice } from '@/components/notice'
import { listAssetLibrary, type AssetLibrary } from '@/lib/assets'
import { requireAccount } from '@/lib/auth'
import { getBillingCatalog } from '@/lib/billing-catalog'
import { getBrandFields } from '@/lib/brand'
import { describeError, loadErrorMessage } from '@/lib/errors'
import { AssetLibraryView } from './asset-library'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('assets')
  return { title: t('metadata.title') }
}

export default async function AsetPage() {
  const t = await getTranslations('assets')
  return (
    <IntlMessages namespaces={['common', 'assets']}>
    <div className="space-y-6">
      <header className="max-w-2xl space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{t('page.text1')}</h1>
        <p className="text-zinc-500">
          {t('page.text2')}</p>
      </header>
      <Suspense fallback={<LoadingState variant="gallery" label={t('page.text3')} />}>
        <AssetGrid />
      </Suspense>
    </div>
    </IntlMessages>
  )
}

/** The website only fills the Dari website card; Aset still works when Brand can't be read. */
async function websiteOf(userId: string, accountId: string): Promise<string> {
  try {
    return (await getBrandFields(userId, accountId))?.websiteUrl ?? ''
  } catch (error) {
    console.error('[aset] website brand gagal dimuat:', describeError(error))
    return ''
  }
}

async function AssetGrid() {
  await connection()
  const { userId, accountId } = await requireAccount()
  let library: AssetLibrary
  let websiteUrl: string
  try {
    ;[library, websiteUrl] = await Promise.all([listAssetLibrary(userId, accountId), websiteOf(userId, accountId)])
  } catch (error) {
    console.error('[aset] gagal memuat:', describeError(error))
    return <Notice tone="warning">{localizeLibraryMessage(loadErrorMessage(error), await getUserLocale())}</Notice>
  }

  const { catalog } = await getBillingCatalog()
  return <AssetLibraryView library={library} websiteUrl={websiteUrl} rates={catalog.rates} />
}
