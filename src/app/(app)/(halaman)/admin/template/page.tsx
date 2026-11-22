
import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { LoadingState } from '@/components/loading-state'
import { Notice } from '@/components/notice'
import { requireAdmin } from '@/lib/auth'
import { describeError } from '@/lib/errors'
import { pickFirst, REFERENCE_LABELS, type ReferenceLabel } from '@/lib/brand-options'
import { DESIGN_STYLES } from '@/lib/design-styles'
import { chooseRoleTemplates, templateCoverage, type BankTemplate, type DesignTemplate } from '@/lib/template-options'
import { listTemplates } from '@/lib/templates'
import { CARD, CARD_TITLE, HINT, TABLE, TD, TH } from '../ui'
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
  return (
    <div className="space-y-6">
      <Coverage templates={templates} />
      <TemplatesPanel templates={templates} />
    </div>
  )
}

const LABEL_ORDER: ReferenceLabel[] = ['cover', 'isi', 'cta', 'single']

/** Which styles Otomatis can serve in full, and where a missing role will be borrowed from (chooseRoleTemplates). */
async function Coverage({ templates }: { templates: DesignTemplate[] }) {
  const t = await getTranslations('admin')
  const bank: BankTemplate[] = templates.flatMap((template) =>
    template.status === 'ready' && template.active && template.label ? [{ id: template.id, label: template.label, styles: template.styles }] : [])
  return (
    <section className={CARD}>
      <div className="space-y-1">
        <h2 className={CARD_TITLE}>{t('template_page.coverageTitle')}</h2>
        <p className={HINT}>{t('template_page.coverageHint')}</p>
      </div>
      <div className="overflow-x-auto">
        <table className={TABLE}>
          <thead className="border-b border-zinc-100">
            <tr>
              <th className={TH}>{t('template_page.coverageStyle')}</th>
              {LABEL_ORDER.map((label) => <th key={label} className={`${TH} text-right`}>{REFERENCE_LABELS[label]}</th>)}
              <th className={TH}><span className="sr-only">Status</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {templateCoverage(templates).map(({ style, counts, missing }) => {
              const chosen = chooseRoleTemplates(bank, style, pickFirst)
              return (
                <tr key={style}>
                  <td className={`${TD} font-medium text-zinc-900`}>{DESIGN_STYLES[style].label}</td>
                  {LABEL_ORDER.map((label) => (
                    <td key={label} className={`${TD} text-right tabular-nums ${counts[label] === 0 && label !== 'single' ? 'font-semibold text-amber-700' : 'text-zinc-700'}`}>{counts[label]}</td>
                  ))}
                  <td className={TD}>
                    {missing.length === 0 ? (
                      <span className="text-xs text-emerald-700">{t('template_page.coverageComplete')}</span>
                    ) : (
                      <span role="note" className="text-xs text-amber-800">
                        {t('template_page.coverageMissing', {
                          roles: missing.map((role) => {
                            const from = chosen[role]
                            const source = from ? t('template_page.coverageBorrows', { style: from.label === 'single' ? `${DESIGN_STYLES[from.style].label} · ${REFERENCE_LABELS.single}` : DESIGN_STYLES[from.style].label }) : t('template_page.coverageNone')
                            return `${REFERENCE_LABELS[role]} (${source})`
                          }).join(', '),
                        })}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
