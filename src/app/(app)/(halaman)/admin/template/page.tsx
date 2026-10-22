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

export const metadata: Metadata = { title: 'Template · Admin' }

export default function AdminTemplatePage() {
  return (
    <Suspense fallback={<LoadingState variant="gallery" label="Memuat template…" />}>
      <Templates />
    </Suspense>
  )
}

async function Templates() {
  await connection()
  await requireAdmin()
  let templates: DesignTemplate[]
  try {
    templates = await listTemplates()
  } catch (error) {
    console.error('[admin] template gagal dimuat:', describeError(error))
    return <Notice tone="error">Template gagal dimuat. Sudah menjalankan migrasi template desain?</Notice>
  }
  return <TemplatesPanel templates={templates} />
}
