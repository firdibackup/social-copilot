import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { connection } from 'next/server'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { IntlMessages } from '@/i18n/client-messages'
import { LoadingState } from '@/components/loading-state'
import { Notice } from '@/components/notice'
import { requireAccount, requireAdmin } from '@/lib/auth'
import { getCanvasTemplate } from '@/lib/canvas-templates'
import { describeError } from '@/lib/errors'
import { isUuid } from '@/lib/params'
import { DesignEditorShell } from '@/app/(app)/buat/design-editor/editor-shell'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('editor.designEditor')
  return { title: t('title') }
}

export default async function TemplateEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('editor.designEditor')
  return <IntlMessages namespaces={['common', 'editor']}>
    <Suspense fallback={<LoadingState variant="editor" className="h-full" label={t('title')} />}><Editor params={params} /></Suspense>
  </IntlMessages>
}

async function Editor({ params }: { params: Promise<{ id: string }> }) {
  await connection()
  const { id } = await params
  if (!isUuid(id)) notFound()
  const t = await getTranslations('editor.designEditor')
  await requireAdmin()
  const { userId, accountId } = await requireAccount()
  let template: Awaited<ReturnType<typeof getCanvasTemplate>>
  try {
    template = await getCanvasTemplate(userId, accountId, id)
  } catch (error) {
    console.error('[template] gagal dimuat:', describeError(error))
    return <Notice tone="warning">{t('loadFailed')}</Notice>
  }
  if (!template) notFound()
  return <DesignEditorShell initial={{ ...template.doc, title: template.name }} version={template.version} />
}
