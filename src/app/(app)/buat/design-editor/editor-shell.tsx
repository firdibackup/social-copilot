'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  ArrowLeft, ChevronDown, ChevronUp, Copy, Download, Eye, EyeOff, ImagePlus, Layers, LayoutTemplate, Lock, LockOpen,
  Plus, Redo2, Shapes, Trash2, Type, Undo2, ZoomIn, ZoomOut,
} from 'lucide-react'
import { confirmDialog } from '@/components/confirm-dialog'
import { fontFamilyOf } from '@/components/font-previews'
import { colorHex, hexColor, walkNodes, type DesignDoc, type DesignNode, type DesignPage } from '@/lib/design-doc'
import { renderDesignCanvas } from '@/lib/design-browser'
import { applyDesignOperation, clonePage, cloneNode, type DesignOperation } from '@/lib/design-operations'
import { fieldReady } from '@/lib/design-fields'
import { newTextNode } from '@/lib/design-nodes'
import { saveTemplateDocumentAction } from '../canvas-template-actions'
import { LeftPanel, type PanelKey } from './left-panels'
import { ContextToolbar } from './context-toolbar'
import { Inspector } from './inspector'
import { PageCanvas } from './page-canvas'

const familyOf = (name: string) => fontFamilyOf(name) ?? 'sans-serif'
const RAIL: { key: PanelKey; icon: typeof Type }[] = [
  { key: 'templates', icon: LayoutTemplate }, { key: 'elements', icon: Shapes }, { key: 'text', icon: Type },
  { key: 'uploads', icon: ImagePlus }, { key: 'layers', icon: Layers },
]
const ICON_BUTTON = 'inline-flex size-9 items-center justify-center rounded-lg text-ink-muted hover:bg-zinc-100 hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent'
type Status = 'saved' | 'unsaved' | 'saving' | 'failed' | 'conflict'
const AUTOSAVE_MS = 1500

/** The full-screen template editor: header, icon rail + left panel, stacked pages, floating toolbar, AI inspector. */
export function DesignEditorShell({ initial, version: initialVersion }: { initial: DesignDoc; version: string }) {
  const t = useTranslations('editor.designEditor')
  const router = useRouter()
  const [doc, setDoc] = useState(initial)
  const [past, setPast] = useState<DesignDoc[]>([])
  const [future, setFuture] = useState<DesignDoc[]>([])
  const [pageIndex, setPageIndex] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [panel, setPanel] = useState<PanelKey | null>('templates')
  const [zoom, setZoom] = useState(0.34)
  const [status, setStatus] = useState<Status>('saved')
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; nodeId: string | null } | null>(null)
  const [editingText, setEditingText] = useState<string | null>(null)
  const version = useRef(initialVersion)
  const savedJson = useRef(JSON.stringify(initial))
  const scroller = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<(HTMLDivElement | null)[]>([])
  const docRef = useRef(doc)
  docRef.current = doc

  const page = doc.pages[Math.min(pageIndex, doc.pages.length - 1)]
  const selected = selectedId ? walkNodes(page.children).find(node => node.id === selectedId) ?? null : null

  const notify = useCallback((message: string) => { setToast(message); window.setTimeout(() => setToast(null), 2400) }, [])

  const apply = useCallback((operation: DesignOperation, after?: (next: DesignDoc) => void) => {
    setDoc(current => {
      try {
        const next = applyDesignOperation(current, operation)
        if (next === current) return current
        setPast(previous => [...previous.slice(-49), current])
        setFuture([])
        setError(null)
        after?.(next)
        return next
      } catch {
        setError(t('invalid'))
        return current
      }
    })
  }, [t])
  const editNode = useCallback((nodeId: string, changes: Partial<DesignNode>) =>
    apply({ type: 'node', pageId: docRef.current.pages[Math.min(pageIndex, docRef.current.pages.length - 1)].id, nodeId, changes }), [apply, pageIndex])

  function history(direction: 'undo' | 'redo') {
    const from = direction === 'undo' ? past : future
    const target = from.at(-1)
    if (!target) return
    if (direction === 'undo') { setPast(from.slice(0, -1)); setFuture([...future, doc]) }
    else { setFuture(from.slice(0, -1)); setPast([...past, doc]) }
    setDoc(target)
    setPageIndex(index => Math.min(index, target.pages.length - 1))
  }

  // ---------- autosave ----------
  const dirty = JSON.stringify(doc) !== savedJson.current
  useEffect(() => { if (dirty && status !== 'saving' && status !== 'conflict') setStatus('unsaved') }, [dirty, status])
  const save = useCallback(async () => {
    const current = docRef.current
    const json = JSON.stringify(current)
    if (json === savedJson.current) return
    setStatus('saving')
    try {
      const image = await renderDesignCanvas(current, 0, familyOf, 0.5)
      const blob = await new Promise<Blob>((resolve, reject) => image.toBlob(value => value ? resolve(value) : reject(new Error('export')), 'image/jpeg', 0.85))
      const form = new FormData()
      form.set('id', current.id)
      form.set('doc', json)
      form.set('expectedVersion', version.current)
      form.set('file', blob, 'template.jpg')
      const result = await saveTemplateDocumentAction(form)
      if ('error' in result) {
        setStatus(result.conflict ? 'conflict' : 'failed')
        if (result.conflict) setError(t('conflict'))
        return
      }
      version.current = result.version
      savedJson.current = json
      setStatus(JSON.stringify(docRef.current) === json ? 'saved' : 'unsaved')
    } catch { setStatus('failed') }
  }, [])
  useEffect(() => {
    if (!dirty || status === 'saving' || status === 'conflict') return
    const timer = window.setTimeout(() => void save(), status === 'failed' ? 5000 : AUTOSAVE_MS)
    return () => window.clearTimeout(timer)
  }, [doc, dirty, status, save])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  // ---------- zoom ----------
  const fit = useCallback(() => {
    const box = scroller.current
    if (!box) return
    const target = docRef.current.pages[0]
    setZoom(Math.max(0.05, Math.min(8, Math.min((box.clientWidth - 120) / target.width, (box.clientHeight - 140) / target.height))))
  }, [])
  useEffect(() => { fit() }, [fit])
  useEffect(() => {
    const box = scroller.current
    if (!box) return
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      setZoom(value => Math.max(0.05, Math.min(8, value * Math.exp(-event.deltaY * 0.002))))
    }
    box.addEventListener('wheel', wheel, { passive: false })
    return () => box.removeEventListener('wheel', wheel)
  }, [])

  // ---------- element actions ----------
  const selectPage = (index: number) => { setPageIndex(index); setSelectedId(null) }
  const duplicateNode = useCallback((node: DesignNode) => {
    const copy = cloneNode(node)
    copy.transform = { ...copy.transform, x: copy.transform.x + 24, y: copy.transform.y + 24 }
    copy.locked = false
    apply({ type: 'insertNode', pageId: page.id, node: copy }, () => setSelectedId(copy.id))
  }, [apply, page.id])
  const removeNode = useCallback((node: DesignNode) => {
    apply({ type: 'removeNode', pageId: page.id, nodeId: node.id })
    setSelectedId(null)
  }, [apply, page.id])
  const insertNode = useCallback((node: DesignNode, message: string) => {
    apply({ type: 'insertNode', pageId: page.id, node }, () => setSelectedId(node.id))
    notify(message)
  }, [apply, page.id, notify])
  const insertPages = useCallback((pages: DesignPage[], replace: boolean) => {
    if (replace) {
      const [first, ...rest] = pages
      apply({ type: 'replacePage', pageId: page.id, page: { ...first, id: page.id, name: page.name } })
      if (rest.length) apply({ type: 'insertPages', index: pageIndex + 1, pages: rest })
    } else apply({ type: 'insertPages', index: pageIndex + 1, pages }, () => setPageIndex(index => index + 1))
    setSelectedId(null)
  }, [apply, page.id, page.name, pageIndex])

  // ---------- keyboard ----------
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return
      const mod = event.ctrlKey || event.metaKey
      if (mod && event.key.toLowerCase() === 'z') { event.preventDefault(); history(event.shiftKey ? 'redo' : 'undo'); return }
      if (mod && event.key.toLowerCase() === 'y') { event.preventDefault(); history('redo'); return }
      if (event.shiftKey && event.key === '!') { event.preventDefault(); fit(); return }
      if (event.key === 'Escape') { setSelectedId(null); setMenu(null); return }
      if (!selected || selected.locked) return
      if (mod && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateNode(selected); return }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeNode(selected); return }
      const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
      if (delta) {
        event.preventDefault()
        const step = event.shiftKey ? 10 : 1
        editNode(selected.id, { transform: { ...selected.transform, x: selected.transform.x + delta[0] * step, y: selected.transform.y + delta[1] * step } })
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  const fields = useMemo(() => doc.pages.flatMap(item => walkNodes(item.children)
    .filter(node => node.data?.carousely?.field && node.data.carousely.field.mode !== 'static')
    .map(node => ({ node, page: item, ready: fieldReady(node.data!.carousely!.field) }))), [doc])

  async function download() {
    try {
      const image = await renderDesignCanvas(doc, pageIndex, familyOf)
      const blob = await new Promise<Blob>((resolve, reject) => image.toBlob(value => value ? resolve(value) : reject(new Error('export')), 'image/png'))
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${doc.title || 'carousely'}-${pageIndex + 1}.png`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { setError(t('renderFailed')) }
  }

  const statusLabel = { saved: t('saved'), unsaved: t('unsaved'), saving: t('saving'), failed: t('saveFailed'), conflict: t('conflict') }[status]
  const pageGap = 72

  return (
    <div className="fixed inset-0 z-40 flex h-dvh flex-col bg-[#f1f1f5] text-ink" onClick={() => setMenu(null)}>
      {/* ---------- header (56 px) ---------- */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-hairline bg-white px-3">
        <button type="button" className={ICON_BUTTON} aria-label={t('back')} onClick={async () => {
          if (dirty) await save()
          router.push('/admin/editor-template')
        }}><ArrowLeft size={18} /></button>
        <span className="mx-1 h-6 w-px bg-hairline" />
        <button type="button" className={ICON_BUTTON} aria-label={t('undo')} disabled={!past.length} onClick={() => history('undo')}><Undo2 size={18} /></button>
        <button type="button" className={ICON_BUTTON} aria-label={t('redo')} disabled={!future.length} onClick={() => history('redo')}><Redo2 size={18} /></button>
        <div className="flex min-w-0 flex-1 justify-center">
          <input aria-label={t('rename')} value={doc.title} maxLength={120}
            onChange={event => setDoc(current => ({ ...current, title: event.target.value }))}
            onBlur={event => { if (!event.target.value.trim()) setDoc(current => ({ ...current, title: t('untitled') })) }}
            className="w-full max-w-[420px] truncate rounded-md border border-transparent bg-transparent px-2 py-1 text-center text-[15px] font-semibold hover:border-hairline focus:border-accent focus:outline-none" />
        </div>
        <span role="status" className={`text-xs ${status === 'failed' || status === 'conflict' ? 'text-red-600' : 'text-ink-muted'}`}>{statusLabel}</span>
        <button type="button" className={ICON_BUTTON} aria-label={t('download')} title={t('download')} onClick={() => void download()}><Download size={18} /></button>
        <button type="button" disabled={!dirty || status === 'saving' || status === 'conflict'} onClick={() => void save()}
          className="h-9 rounded-lg bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-deep disabled:opacity-50">{t('save')}</button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ---------- icon rail ---------- */}
        <nav aria-label={t('title')} className="flex w-[72px] shrink-0 flex-col items-center gap-1 border-r border-hairline bg-white py-2">
          {RAIL.map(({ key, icon: Icon }) => {
            const label = t(`rail.${key}`)
            const open = panel === key
            return <button key={key} type="button" aria-pressed={open} title={open ? t('railHide', { panel: label }) : t('railOpen', { panel: label })}
              onClick={() => setPanel(open ? null : key)}
              className={`flex w-16 flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-medium ${open ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:bg-zinc-100 hover:text-ink'}`}>
              <Icon size={20} aria-hidden="true" />{label}
            </button>
          })}
        </nav>

        {/* ---------- left panel (≈230 px) ---------- */}
        {panel && <aside className="w-[260px] shrink-0 overflow-y-auto border-r border-hairline bg-white">
          <LeftPanel panel={panel} page={page} doc={doc} selected={selected}
            onInsertNode={insertNode} onInsertPages={insertPages} onSelect={setSelectedId} onEdit={editNode}
            onReorder={(nodeId, to) => apply({ type: 'reorderNode', pageId: page.id, nodeId, to })}
            onError={setError} notify={notify} />
        </aside>}

        {/* ---------- canvas column ---------- */}
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-4">
            <ContextToolbar page={page} node={selected} onEdit={editNode} onPage={changes => apply({ type: 'page', pageId: page.id, changes })}
              onDuplicate={() => selected && duplicateNode(selected)} onDelete={() => selected && removeNode(selected)}
              onReorder={to => selected && apply({ type: 'reorderNode', pageId: page.id, nodeId: selected.id, to })} />
          </div>
          <div ref={scroller} className="min-h-0 flex-1 overflow-auto" onPointerDown={event => {
            if (event.target === event.currentTarget) setSelectedId(null)
          }}>
            <div className="flex min-w-max flex-col items-center px-16 pt-20 pb-28" style={{ gap: pageGap }}>
              {doc.pages.map((item, index) => {
                const current = index === pageIndex
                return <div key={item.id} ref={element => { pageRefs.current[index] = element }} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs" style={{ width: item.width * zoom }}>
                    <button type="button" onClick={() => selectPage(index)}
                      className={`rounded px-1 font-semibold ${current ? 'text-ink' : 'text-ink-muted hover:text-ink'}`}>{item.name || t('page', { n: index + 1 })}</button>
                    <div className={`flex items-center ${current ? '' : 'opacity-60'}`}>
                      <button type="button" className={ICON_BUTTON} aria-label={t('moveUp')} disabled={index === 0}
                        onClick={() => { apply({ type: 'movePage', pageId: item.id, direction: -1 }); setPageIndex(index - 1) }}><ChevronUp size={16} /></button>
                      <button type="button" className={ICON_BUTTON} aria-label={t('moveDown')} disabled={index === doc.pages.length - 1}
                        onClick={() => { apply({ type: 'movePage', pageId: item.id, direction: 1 }); setPageIndex(index + 1) }}><ChevronDown size={16} /></button>
                      <button type="button" className={ICON_BUTTON} aria-label={t('duplicatePage')} disabled={doc.pages.length >= 10}
                        onClick={() => { apply({ type: 'duplicatePage', pageId: item.id }); setPageIndex(index + 1) }}><Copy size={15} /></button>
                      <button type="button" className={ICON_BUTTON} aria-label={t('deletePage')} disabled={doc.pages.length === 1} onClick={async () => {
                        if (await confirmDialog({ title: t('deletePageConfirm'), confirmLabel: t('deletePage'), cancelLabel: t('back'), tone: 'danger' })) {
                          apply({ type: 'removePage', pageId: item.id }); setPageIndex(Math.max(0, index - 1)); setSelectedId(null)
                        }
                      }}><Trash2 size={15} /></button>
                    </div>
                  </div>
                  <div onPointerDownCapture={() => { if (!current) selectPage(index) }}
                    className={current ? 'outline-2 outline-offset-4 outline-accent/40' : ''}>
                    <PageCanvas page={item} zoom={zoom} active={current} selectedId={current ? selectedId : null} disabled={status === 'conflict'}
                      label={t('canvas', { n: index + 1 })} onSelect={setSelectedId} onCommit={editNode}
                      onEditText={id => { setSelectedId(id); setEditingText(id) }}
                      onContextMenu={(x, y, nodeId) => setMenu({ x, y, nodeId })} />
                  </div>
                </div>
              })}
              <button type="button" disabled={doc.pages.length >= 10} title={doc.pages.length >= 10 ? t('pageLimit') : undefined}
                onClick={() => {
                  const blank: DesignPage = { id: crypto.randomUUID(), name: `Slide ${doc.pages.length + 1}`, width: page.width, height: page.height,
                    background: { type: 'solid', color: hexColor('#ffffff') }, children: [] }
                  apply({ type: 'insertPages', index: doc.pages.length, pages: [blank] }, next => setPageIndex(next.pages.length - 1))
                }}
                className="flex h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-white text-sm font-medium text-ink-muted hover:border-accent hover:text-accent disabled:opacity-50"
                style={{ width: page.width * zoom }}><Plus size={16} />{t('addPage')}</button>
            </div>
          </div>

          {/* zoom widget (bottom-left) and minimap (bottom-right) */}
          <div className="absolute bottom-4 left-4 z-20 flex items-center gap-1 rounded-xl border border-hairline bg-white p-1 shadow-sm">
            <button type="button" className={ICON_BUTTON} aria-label={t('zoomOut')} onClick={() => setZoom(value => Math.max(0.05, value / 1.2))}><ZoomOut size={16} /></button>
            <select aria-label={t('zoomIn')} value="" onChange={event => {
              if (event.target.value === 'fit') fit(); else if (event.target.value) setZoom(Number(event.target.value))
            }} className="h-8 rounded-md bg-transparent px-1 text-xs font-semibold tabular-nums">
              <option value="">{Math.round(zoom * 100)}%</option>
              {[0.25, 0.5, 1, 2].map(value => <option key={value} value={value}>{value * 100}%</option>)}
              <option value="fit">{t('fit')}</option>
            </select>
            <button type="button" className={ICON_BUTTON} aria-label={t('zoomIn')} onClick={() => setZoom(value => Math.min(8, value * 1.2))}><ZoomIn size={16} /></button>
            <button type="button" className="h-8 rounded-md px-2 text-xs font-semibold text-ink-muted hover:bg-zinc-100" onClick={fit}>{t('fit')}</button>
          </div>
          <Minimap pages={doc.pages} current={pageIndex} onPick={index => {
            selectPage(index)
            pageRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }} />

          {error && <p role="alert" className="absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white shadow">{error}</p>}
          {toast && <p role="status" className="absolute top-3 right-4 z-30 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow">{toast}</p>}
        </main>

        {/* ---------- AI inspector (≈264 px) ---------- */}
        <aside className="w-[280px] shrink-0 overflow-y-auto border-l border-hairline bg-white">
          <Inspector doc={doc} page={page} node={selected} fields={fields} editingText={editingText}
            onDoneEditing={() => setEditingText(null)} onEdit={editNode} onSelect={(pageId, nodeId) => {
              const index = doc.pages.findIndex(item => item.id === pageId)
              if (index >= 0) { setPageIndex(index); setSelectedId(nodeId) }
            }}
            onPage={changes => apply({ type: 'page', pageId: page.id, changes })}
            onCaption={caption => apply({ type: 'caption', caption })} />
        </aside>
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} node={menu.nodeId ? walkNodes(page.children).find(node => node.id === menu.nodeId) ?? null : null}
        onClose={() => setMenu(null)} labels={t}
        actions={{
          duplicate: node => duplicateNode(node), remove: node => removeNode(node),
          reorder: (node, to) => apply({ type: 'reorderNode', pageId: page.id, nodeId: node.id, to }),
          lock: node => editNode(node.id, { locked: !node.locked }),
          hide: node => editNode(node.id, { hidden: !node.hidden }),
          addText: () => insertNode(newTextNode(page, 'heading', t('heading'), crypto.randomUUID()), t('addHeading')),
          lockAll: locked => page.children.forEach(node => { if (!!node.locked !== locked) editNode(node.id, { locked }) }),
        }} />}
      <div className="fixed inset-0 z-50 grid place-items-center bg-white p-8 text-center text-sm text-ink-muted lg:hidden">{t('desktopOnly')}</div>
    </div>
  )
}

function Minimap({ pages, current, onPick }: { pages: DesignPage[]; current: number; onPick: (index: number) => void }) {
  return <div className="absolute right-4 bottom-4 z-20 flex max-h-[45%] flex-col gap-1.5 overflow-y-auto rounded-xl border border-hairline bg-white p-1.5 shadow-sm">
    {pages.map((page, index) => <button key={page.id} type="button" onClick={() => onPick(index)} aria-label={page.name}
      className={`w-12 rounded border-2 ${index === current ? 'border-accent' : 'border-transparent'}`}
      style={{ aspectRatio: `${page.width} / ${page.height}`, background: page.background.type === 'solid' ? colorHex(page.background.color) : '#e6e8ed' }} />)}
  </div>
}

type MenuActions = {
  duplicate: (node: DesignNode) => void; remove: (node: DesignNode) => void
  reorder: (node: DesignNode, to: 'front' | 'back' | 'forward' | 'backward') => void
  lock: (node: DesignNode) => void; hide: (node: DesignNode) => void; addText: () => void; lockAll: (locked: boolean) => void
}
function ContextMenu({ x, y, node, onClose, actions, labels: t }: { x: number; y: number; node: DesignNode | null; onClose: () => void
  actions: MenuActions; labels: ReturnType<typeof useTranslations<'editor.designEditor'>> }) {
  const item = (label: ReactNode, run: () => void, danger = false) =>
    <button type="button" role="menuitem" onClick={() => { run(); onClose() }}
      className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm hover:bg-zinc-100 ${danger ? 'text-red-600' : ''}`}>{label}</button>
  return <div role="menu" aria-label={t('contextMenu')} onClick={event => event.stopPropagation()}
    className="fixed z-50 w-56 rounded-xl border border-hairline bg-white p-1 shadow-[0_12px_32px_-8px_rgba(23,24,39,0.3)]"
    style={{ left: Math.min(x, window.innerWidth - 240), top: Math.min(y, window.innerHeight - 320) }}>
    {node ? <>
      {item(<><Copy size={14} />{t('duplicate')}</>, () => actions.duplicate(node))}
      {item(<><ChevronUp size={14} />{t('front')}</>, () => actions.reorder(node, 'front'))}
      {item(<><ChevronDown size={14} />{t('back_')}</>, () => actions.reorder(node, 'back'))}
      {item(<>{node.locked ? <LockOpen size={14} /> : <Lock size={14} />}{node.locked ? t('unlock') : t('lock')}</>, () => actions.lock(node))}
      {item(<>{node.hidden ? <Eye size={14} /> : <EyeOff size={14} />}{node.hidden ? t('show') : t('hide')}</>, () => actions.hide(node))}
      <div className="my-1 h-px bg-hairline" />
      {item(<><Trash2 size={14} />{t('delete')}</>, () => actions.remove(node), true)}
    </> : <>
      {item(<><Type size={14} />{t('addHeading')}</>, actions.addText)}
      {item(<><Lock size={14} />{t('lock')}</>, () => actions.lockAll(true))}
      {item(<><LockOpen size={14} />{t('unlock')}</>, () => actions.lockAll(false))}
    </>}
  </div>
}
