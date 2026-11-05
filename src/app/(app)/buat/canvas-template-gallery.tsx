'use client'

import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { confirmDialog } from '@/components/confirm-dialog'
import { fontFamilyOf } from '@/components/font-previews'
import type { CanvasTemplateSummary } from '@/lib/canvas-templates'
import type { DesignDoc } from '@/lib/design-doc'
import { renderDesignCanvas } from '@/lib/design-browser'
import { applyDesignOperation, type DesignOperation } from '@/lib/design-operations'
import { layerImageUrl } from '@/lib/layer-doc'
import { getCanvasTemplateAction, listCanvasTemplatesAction, manageCanvasTemplateAction, saveTemplateDocumentAction } from './canvas-template-actions'
import { Thumbnail } from './thumbnail'
import { DesignNodePanel } from './design-node-panel'
import { inspectCaption } from '@/lib/caption'
import { DesignCanvasInteraction } from './design-canvas-interaction'

const BUTTON = 'min-h-11 rounded-lg border border-hairline px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50'

export function CanvasTemplateGallery({ onBack, onDirtyChange }: { onBack: () => void; onDirtyChange: (dirty: boolean) => void }) {
  const t = useTranslations('editor.templateGallery')
  const locale = useLocale()
  const [items, setItems] = useState<CanvasTemplateSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<{ item: CanvasTemplateSummary; operation: 'rename' | 'duplicate'; name: string } | null>(null)
  const [preview, setPreview] = useState<DesignDoc | null>(null)
  const [page, setPage] = useState(0)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [rendered, setRendered] = useState(false)
  const [version, setVersion] = useState('')
  const [saved, setSaved] = useState<DesignDoc | null>(null)
  const [past, setPast] = useState<DesignDoc[]>([])
  const [future, setFuture] = useState<DesignDoc[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const dirty = !!preview && JSON.stringify(preview) !== JSON.stringify(saved)
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false) }, [dirty, onDirtyChange])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  useEffect(() => {
    let live = true
    listCanvasTemplatesAction().then(items => { if (live) setItems(items) })
      .catch(() => { if (live) setError(t('loadFailed')) })
    return () => { live = false }
  }, [t])

  useEffect(() => {
    if (!preview) return
    let live = true
    void renderDesignCanvas(preview, page, name => fontFamilyOf(name) ?? 'sans-serif').then(image => {
      if (!live) return
      const context = canvas.current?.getContext('2d')
      if (!context) throw new Error('canvas_unavailable')
      context.clearRect(0, 0, image.width, image.height)
      context.drawImage(image, 0, 0)
      setRendered(true)
    }).catch(() => { if (live) setError(t('previewFailed')) })
    return () => { live = false }
  }, [preview, page, t])

  async function refresh() {
    setBusy(true)
    setError(null)
    try { setItems(await listCanvasTemplatesAction()) }
    catch { setError(t('loadFailed')) }
    finally { setBusy(false) }
  }

  async function manage(item: CanvasTemplateSummary, operation: 'rename' | 'duplicate' | 'archive', name?: string) {
    if (operation === 'archive' && !await confirmDialog({ title: t('archiveConfirm'), description: item.name,
      confirmLabel: t('archive'), cancelLabel: t('cancel') })) return
    setBusy(true)
    setError(null)
    try {
      const result = await manageCanvasTemplateAction({ id: item.id, expectedVersion: item.version, operation, name })
      if (result.error) { setError(result.error); return }
      setEditing(null)
      setItems(await listCanvasTemplatesAction())
    } catch { setError(t('saveFailed')) }
    finally { setBusy(false) }
  }

  async function open(item: CanvasTemplateSummary) {
    setBusy(true)
    setError(null)
    try {
      const result = await getCanvasTemplateAction(item.id)
      if (!result.template) { setError(result.error ?? t('loadFailed')); return }
      setRendered(false)
      setPage(0)
      setPreview(result.template.doc)
      setSaved(result.template.doc)
      setVersion(result.template.version)
      setPast([])
      setFuture([])
    } catch { setError(t('loadFailed')) }
    finally { setBusy(false) }
  }

  function edit(operation: DesignOperation) {
    if (!preview || busy) return
    if (operation.type === 'caption' && operation.caption?.mode === 'static') {
      const errors = inspectCaption(operation.caption.value, locale === 'en' ? 'en' : 'id').errors
      if (errors.length) { setError(errors.join(' ')); return }
    }
    try {
      const next = applyDesignOperation(preview, operation)
      if (next === preview) return
      setPast(previous => [...previous.slice(-29), preview])
      setFuture([])
      setRendered(false)
      setError(null)
      const selected = operation.type === 'duplicatePage' ? next.pages[page + 1].id : preview.pages[page].id
      const nextIndex = next.pages.findIndex(item => item.id === selected)
      setPage(nextIndex < 0 ? Math.min(page, next.pages.length - 1) : nextIndex)
      setPreview(next)
    } catch { setError(t('invalidEdit')) }
  }

  function history(direction: 'undo' | 'redo') {
    if (!preview || busy) return
    const from = direction === 'undo' ? past : future
    const next = from.at(-1)
    if (!next) return
    if (direction === 'undo') { setPast(past.slice(0, -1)); setFuture([...future, preview]) }
    else { setFuture(future.slice(0, -1)); setPast([...past, preview]) }
    const nextIndex = next.pages.findIndex(item => item.id === preview.pages[page].id)
    setPage(nextIndex < 0 ? Math.min(page, next.pages.length - 1) : nextIndex)
    setRendered(false)
    setError(null)
    setPreview(next)
  }

  async function save() {
    if (!preview) return
    setBusy(true)
    setError(null)
    try {
      const image = await renderDesignCanvas(preview, 0, name => fontFamilyOf(name) ?? 'sans-serif')
      const blob = await new Promise<Blob>((resolve, reject) => image.toBlob(value => value ? resolve(value) : reject(new Error('export')), 'image/jpeg', 0.9))
      const form = new FormData()
      form.set('id', preview.id)
      form.set('doc', JSON.stringify(preview))
      form.set('expectedVersion', version)
      form.set('file', blob, 'template.jpg')
      const result = await saveTemplateDocumentAction(form)
      if ('error' in result) { setError(result.error); return }
      setVersion(result.version)
      setSaved(preview)
      try { setItems(await listCanvasTemplatesAction()) }
      catch { setError(t('loadFailed')) }
    } catch { setError(t('saveFailed')) }
    finally { setBusy(false) }
  }

  async function back() {
    if (dirty && !await confirmDialog({ title: t('discard'), confirmLabel: t('back'), cancelLabel: t('cancel') })) return
    if (preview) { setPreview(null); setError(null) } else onBack()
  }

  async function download() {
    if (!canvas.current) return
    const element = canvas.current
    try {
      const blob = await new Promise<Blob>((resolve, reject) => element.toBlob(value => value ? resolve(value) : reject(new Error('export')), 'image/png'))
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `carousely-slide-${page + 1}.png`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { setError(t('previewFailed')) }
  }

  return <section className="flex min-h-0 flex-1 flex-col overflow-y-auto" aria-label={t('title')} onKeyDown={event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !(event.target as HTMLElement).closest('input, textarea, select')) {
      event.preventDefault(); event.stopPropagation(); if (!busy) history(event.shiftKey ? 'redo' : 'undo')
    }
  }}>
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-hairline bg-white px-4 py-3">
      <button type="button" className={BUTTON} disabled={busy} onClick={() => void back()}>{t('back')}</button>
      <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{preview?.title ?? t('title')}</h3>
      {preview && <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={BUTTON} disabled={busy || !past.length} onClick={() => history('undo')}>{t('undo')}</button>
        <button type="button" className={BUTTON} disabled={busy || !future.length} onClick={() => history('redo')}>{t('redo')}</button>
        <button type="button" className="min-h-11 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-deep disabled:opacity-50" disabled={busy || !dirty} onClick={() => void save()}>{t('save')}</button>
        <span role="status" className="text-xs text-ink-muted">{t(dirty ? 'unsaved' : 'saved')}</span>
      </div>}
      {!preview && <button type="button" className={BUTTON} disabled={busy} onClick={() => void refresh()}>{t('refresh')}</button>}
    </div>
    {error && <p role="alert" className="shrink-0 px-4 py-2 text-sm text-red-700">{error}</p>}
    {busy && <p role="status" className="shrink-0 px-4 py-2 text-sm text-ink-muted">{t('loading')}</p>}
    {preview ? <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <div className="flex shrink-0 flex-col items-center gap-4 p-4 md:min-h-0 md:min-w-0 md:flex-1 md:overflow-y-auto md:p-8">
      <div className="relative w-full max-w-full shrink-0" style={{ maxWidth: `min(100%, ${preview.pages[page].width / preview.pages[page].height * 55}dvh)` }}>
      <canvas ref={canvas} width={preview.pages[page].width} height={preview.pages[page].height}
        aria-label={t('page', { page: page + 1, total: preview.pages.length })}
        className="h-auto w-full rounded-lg border border-hairline bg-white" />
      <DesignCanvasInteraction key={preview.pages[page].id} page={preview.pages[page]} selectedId={selectedId} disabled={busy || !rendered}
        onSelect={setSelectedId} onChange={edit} label={t('canvasControls')} />
      </div>
      <nav className="flex shrink-0 flex-wrap gap-2" aria-label={t('pages')}>
        {preview.pages.map((slide, index) => <button key={slide.id} type="button" className={BUTTON} disabled={busy}
          aria-current={page === index ? 'page' : undefined} onClick={() => { if (page !== index) { setRendered(false); setError(null); setPage(index) } }}>{index + 1}</button>)}
      </nav>
      <button type="button" className={BUTTON} disabled={!rendered || !!error} onClick={() => void download()}>{t('download')}</button>
      </div>
      <aside aria-label={t('properties')} className="min-w-0 shrink-0 border-t border-hairline bg-white p-4 md:w-80 md:overflow-y-auto md:border-t-0 md:border-l lg:w-[360px]">
      <fieldset disabled={busy} className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BUTTON} disabled={page === 0} onClick={() => edit({ type: 'movePage', pageId: preview.pages[page].id, direction: -1 })}>{t('moveUp')}</button>
          <button type="button" className={BUTTON} disabled={page === preview.pages.length - 1} onClick={() => edit({ type: 'movePage', pageId: preview.pages[page].id, direction: 1 })}>{t('moveDown')}</button>
          <button type="button" className={BUTTON} disabled={preview.pages.length >= 10} onClick={() => edit({ type: 'duplicatePage', pageId: preview.pages[page].id })}>{t('duplicatePage')}</button>
          <button type="button" className={BUTTON} disabled={preview.pages.length === 1} onClick={async () => {
            if (await confirmDialog({ title: t('deletePageConfirm'), confirmLabel: t('deletePage'), cancelLabel: t('cancel'), tone: 'danger' }))
              edit({ type: 'removePage', pageId: preview.pages[page].id })
          }}>{t('deletePage')}</button>
        </div>
        <DesignNodePanel doc={preview} pageIndex={page} onChange={edit} selectedId={selectedId} />
      </fieldset>
      </aside>
    </div> : <div className="space-y-4 p-4 md:p-8">
      {editing && <form className="space-y-2 rounded-lg border border-hairline p-3" onSubmit={event => { event.preventDefault(); void manage(editing.item, editing.operation, editing.name) }}>
        <label className="block text-sm">{t('name')}<input autoFocus required maxLength={120} value={editing.name} disabled={busy}
          onChange={event => setEditing({ ...editing, name: event.target.value })} className="mt-1 w-full rounded-lg border border-hairline px-3 py-2" /></label>
        <div className="flex gap-2"><button className={BUTTON} disabled={busy || !editing.name.trim()}>{t('save')}</button>
          <button type="button" className={BUTTON} disabled={busy} onClick={() => setEditing(null)}>{t('cancel')}</button></div>
      </form>}
      {items?.length === 0 && <p className="text-sm leading-relaxed text-ink-muted">{t('empty')}</p>}
      {!items && !error && <p role="status" className="text-sm text-ink-muted">{t('loading')}</p>}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{items?.map(item => <li key={item.id} className="overflow-hidden rounded-xl border border-hairline bg-white">
        <button type="button" disabled={busy} onClick={() => void open(item)} className="block w-full p-3 text-left hover:bg-zinc-50">
          {item.previewAssetId && <Thumbnail id={item.previewAssetId} src={layerImageUrl(item.previewAssetId)} size={256} className="mb-2 h-40 w-full rounded-lg bg-zinc-50 object-contain" />}
          <span className="block break-words text-sm font-semibold">{item.name}</span>
          <span className="text-xs text-ink-muted">{t('count', { count: item.pages })}</span>
        </button>
        <div className="flex flex-wrap gap-1 border-t border-hairline p-2">
          <button type="button" className={BUTTON} disabled={busy} onClick={() => setEditing({ item, operation: 'rename', name: item.name })}>{t('rename')}</button>
          <button type="button" className={BUTTON} disabled={busy} onClick={() => setEditing({ item, operation: 'duplicate', name: item.name })}>{t('duplicate')}</button>
          <button type="button" className={BUTTON} disabled={busy} onClick={() => void manage(item, 'archive')}>{t('archive')}</button>
        </div>
      </li>)}</ul>
    </div>}
  </section>
}
