'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Plus } from 'lucide-react'
import type { CanvasTemplateSummary } from '@/lib/canvas-templates'
import { layerImageUrl } from '@/lib/layer-doc'
import { STARTER_CATEGORIES, STARTER_TEMPLATES, starterPage, type StarterFormat } from '@/lib/starter-templates'
import { createCanvasTemplateAction } from '@/app/(app)/buat/canvas-template-actions'
import { StarterThumb } from './starter-thumb'

/** Template saya plus the built-in starters; picking one creates a saved copy and opens the editor. */
export function TemplateHome({ mine }: { mine: CanvasTemplateSummary[] }) {
  const t = useTranslations('editor.designEditor')
  const locale = useLocale() === 'en' ? 'en' : 'id'
  const router = useRouter()
  const [format, setFormat] = useState<StarterFormat>('4:5')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const starters = useMemo(() => STARTER_TEMPLATES.map(item => ({ ...item, page: starterPage(item.id, format) })), [format])

  async function create(starterId: string | null, name: string) {
    setBusy(starterId ?? 'blank')
    setError(null)
    const result = await createCanvasTemplateAction({ name, starterId, format }).catch(() => ({ error: t('loadFailed') }))
    if ('error' in result) { setError(result.error); setBusy(null); return }
    router.push(`/admin/editor-template/${result.id}`)
  }

  return <div className="space-y-8">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-ink-muted">{t('exampleHint')}</p>
      </div>
      <div role="radiogroup" className="flex rounded-lg bg-zinc-100 p-1 text-sm font-medium">
        {(['4:5', '1:1'] as const).map(value => <button key={value} type="button" role="radio" aria-checked={format === value}
          onClick={() => setFormat(value)} className={`rounded-md px-3 py-1.5 ${format === value ? 'bg-white shadow-sm' : 'text-ink-muted'}`}>{value}</button>)}
      </div>
    </header>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

    <section className="space-y-3">
      <h2 className="text-sm font-semibold">{t('mine')}</h2>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
        <li><button type="button" disabled={!!busy} onClick={() => void create(null, t('untitled'))}
          className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 text-sm font-medium text-ink-muted hover:border-accent hover:text-accent disabled:opacity-50">
          <Plus size={20} />{busy === 'blank' ? t('saving') : t('newTemplate')}</button></li>
        {mine.map(item => <li key={item.id}><Link href={`/admin/editor-template/${item.id}`} className="group block text-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {item.previewAssetId ? <img src={layerImageUrl(item.previewAssetId)} alt="" className="aspect-[4/5] w-full rounded-xl bg-zinc-100 object-cover ring-accent group-hover:ring-2" />
            : <span className="block aspect-[4/5] rounded-xl bg-zinc-100 ring-accent group-hover:ring-2" />}
          <span className="mt-1.5 line-clamp-1 font-medium">{item.name}</span>
        </Link></li>)}
      </ul>
    </section>

    {STARTER_CATEGORIES.map(category => <section key={category} className="space-y-3">
      <h2 className="text-sm font-semibold">{t('defaults')} · {t(`categories.${category}`)}</h2>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
        {starters.filter(item => item.category === category).map(item => <li key={item.id}>
          <button type="button" disabled={!!busy} onClick={() => void create(item.id, item.name[locale])} className="group block w-full text-left text-sm disabled:opacity-60">
            <StarterThumb page={item.page} />
            <span className="mt-1.5 line-clamp-1 font-medium">{busy === item.id ? t('saving') : item.name[locale]}</span>
          </button>
        </li>)}
      </ul>
    </section>)}
  </div>
}
