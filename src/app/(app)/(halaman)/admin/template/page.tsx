
import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { LoadingState } from '@/components/loading-state'
import { Notice } from '@/components/notice'
import { requireAdmin } from '@/lib/auth'
import { describeError } from '@/lib/errors'
import type { DesignTemplate } from '@/lib/template-options'
import { listTemplates } from '@/lib/templates'
import { TemplatesPanel } from './templates-panel'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin')
  return { title: t('template_page.templatesAdmin') }
}

export default async function AdminTemplatePage() {
  const t = await getTranslations('admin')

  return (
    <Suspense fallback={<LoadingState variant="gallery" label={t('template_page.loadingTemplates')} />}>
      <Templates />
    </Suspense>
  )
}

async function Templates() {
  const t = await getTranslations('admin')

  await connection()
  await requireAdmin()
  let templates: DesignTemplate[]
  try {
    templates = await listTemplates()
  } catch (error) {
    console.error('[admin] template gagal dimuat:', describeError(error))
    return <Notice tone="error">{t('template_page.couldnTLoadTemplatesHaveYouRun')}</Notice>
  }
  return <TemplatesPanel templates={templates} />
}
