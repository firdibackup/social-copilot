import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { IntlMessages } from '@/i18n/client-messages'
import { LoadingState } from '@/components/loading-state'
import { Notice } from '@/components/notice'
import { requireAccount, requireAdmin } from '@/lib/auth'
import { listCanvasTemplates } from '@/lib/canvas-templates'
import { describeError } from '@/lib/errors'
import { TemplateHome } from './template-home'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('editor.designEditor')
  return { title: t('title') }
}

export default async function TemplatePage() {
  const t = await getTranslations('editor.designEditor')
  return <IntlMessages namespaces={['common', 'editor']}>
    <Suspense fallback={<LoadingState variant="gallery" label={t('title')} />}><Templates /></Suspense>
  </IntlMessages>
}

async function Templates() {
  await connection()
  const t = await getTranslations('editor.designEditor')
  await requireAdmin()
  const { userId, accountId } = await requireAccount()
  try {
    return <TemplateHome mine={await listCanvasTemplates(userId, accountId)} />
  } catch (error) {
    console.error('[template] daftar gagal dimuat:', describeError(error))
    return <Notice tone="warning">{t('loadFailed')}</Notice>
  }
}
