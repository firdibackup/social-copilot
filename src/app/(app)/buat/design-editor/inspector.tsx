'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown, Sparkles, TriangleAlert } from 'lucide-react'
import { inspectCaption } from '@/lib/caption'
import { walkNodes, type DesignDoc, type DesignNode, type DesignPage, type TextNode } from '@/lib/design-doc'
import { FIELD_PROMPT_LIMIT, fieldMaxChars, type FieldConfig } from '@/lib/design-fields'
import { plainText, withText } from '@/lib/design-nodes'

const INPUT = 'mt-1 w-full rounded-lg border border-hairline bg-white px-2.5 py-2 text-sm focus:border-accent focus:outline-none'
const LABEL = 'block text-xs font-medium text-ink'

function Section({ title, badge, children, open: initial = true }: { title: string; badge?: ReactNode; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initial)
  return <section className="border-b border-hairline">
    <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}
      className="flex w-full items-center gap-2 px-4 py-3 text-left text-[11px] font-semibold tracking-wider text-ink-muted uppercase">
      <span className="flex-1">{title}</span>{badge}<ChevronDown size={14} className={open ? 'rotate-180' : ''} />
    </button>
    {open && <div className="space-y-3 px-4 pb-4">{children}</div>}
  </section>
}

/** Bleam's right panel: What the AI fills on top, then Field / Panel / Page / Card depending on the selection. */
export function Inspector({ doc, page, node, fields, editingText, onDoneEditing, onEdit, onSelect, onPage, onCaption }: {
  doc: DesignDoc; page: DesignPage; node: DesignNode | null
  fields: { node: DesignNode; page: DesignPage; ready: boolean }[]
  editingText: string | null; onDoneEditing: () => void
  onEdit: (nodeId: string, changes: Partial<DesignNode>) => void
  onSelect: (pageId: string, nodeId: string) => void
  onPage: (changes: Partial<Pick<DesignPage, 'name' | 'repeat'>>) => void
  onCaption: (caption: DesignDoc['meta']['caption']) => void
}) {
  const t = useTranslations('editor.designEditor')
  const ready = fields.filter(item => item.ready).length
  return <div className="text-sm">
    <Section title={t('aiFills')} badge={<span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold text-accent">{fields.length}</span>}>
      {fields.length === 0 ? <p className="text-xs leading-relaxed text-ink-muted">{t('aiEmpty')}</p> : <>
        <p className="text-xs text-ink-muted">{t('aiReady', { ready, total: fields.length })}</p>
        <ul className="space-y-1.5">{fields.map(item => {
          const field = item.node.data!.carousely!.field!
          return <li key={item.node.id}><button type="button" onClick={() => onSelect(item.page.id, item.node.id)}
            className={`w-full rounded-lg border px-2.5 py-2 text-left ${item.ready ? 'border-hairline hover:bg-zinc-50' : 'border-red-200 bg-accent-soft/50'}`}>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
              {item.ready ? <Sparkles size={12} className="text-accent" /> : <TriangleAlert size={12} className="text-red-600" />}
              <span className="truncate">{item.node.name}</span></span>
            <span className="mt-0.5 line-clamp-2 block text-[11px] text-ink-muted">
              {item.ready ? ('prompt' in field ? field.prompt : field.mode === 'stock' ? field.stockQuery : '') : t('needsPrompt')}</span>
          </button></li>
        })}</ul>
      </>}
    </Section>

    {node && (node.type === 'text' || node.type === 'image') && <FieldSection node={node} editingText={editingText} onDoneEditing={onDoneEditing} onEdit={onEdit} />}

    {node && <Section title={t('name')}>
      <input aria-label={t('name')} className={INPUT} maxLength={120} value={node.name} disabled={!!node.locked}
        onChange={event => onEdit(node.id, { name: event.target.value })} />
      {node.type === 'shape' && <label className={LABEL}>{t('hug')}
        <select className={INPUT} disabled={!!node.locked} value={node.data?.carousely?.hug?.textId ?? ''} onChange={event => {
          const data = { ...node.data?.carousely }
          if (event.target.value) data.hug = { textId: event.target.value }; else delete data.hug
          onEdit(node.id, { data: { carousely: data } })
        }}>
          <option value="">{t('fixed')}</option>
          {walkNodes(page.children).filter(item => item.type === 'text' && item.data?.carousely?.field?.mode === 'ai')
            .map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>}
    </Section>}

    {doc.pages.length > 1 && <Section title={t('slideSection')} open={!node}>
      <label className={LABEL}>{t('repeat')}
        <select className={INPUT} value={page.repeat?.mode ?? 'once'} onChange={event => onPage({ repeat: event.target.value === 'once' ? null
          : event.target.value === 'ai' ? { mode: 'ai' } : { mode: 'fixed', count: 2 } })}>
          <option value="once">{t('once')}</option><option value="ai">{t('repeatAi')}</option><option value="fixed">{t('repeatFixed')}</option>
        </select></label>
      {page.repeat?.mode === 'fixed' && <label className={LABEL}>{t('repeatCount')}
        <input className={INPUT} type="number" min={1} max={10} value={page.repeat.count} onChange={event => {
          const count = Number(event.target.value)
          if (Number.isInteger(count) && count >= 1 && count <= 10) onPage({ repeat: { mode: 'fixed', count } })
        }} /></label>}
    </Section>}

    {!node && <CaptionSection doc={doc} onCaption={onCaption} />}
  </div>
}

function FieldSection({ node, editingText, onDoneEditing, onEdit }: { node: DesignNode & { type: 'text' | 'image' }; editingText: string | null
  onDoneEditing: () => void; onEdit: (nodeId: string, changes: Partial<DesignNode>) => void }) {
  const t = useTranslations('editor.designEditor')
  const area = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (editingText === node.id) { area.current?.focus(); area.current?.select(); onDoneEditing() } }, [editingText, node.id, onDoneEditing])
  const field = node.data?.carousely?.field
  const setField = (next: FieldConfig) => onEdit(node.id, { data: { carousely: { ...node.data?.carousely, field: next } } })
  const ai = field && field.mode !== 'static'
  const prompt = field && 'prompt' in field ? field.prompt : ''
  const text = node.type === 'text' ? node as TextNode : null
  const style = text?.content[0].runs[0].style
  const capacity = text && field?.mode === 'ai'
    ? fieldMaxChars(text.box.width, text.box.height, style!.fontSize, text.content[0].style.lineHeight, field.length) : 0
  return <Section title={t('field')}>
    {text && <label className={LABEL}>{t('content')}
      <textarea ref={area} className={INPUT} rows={3} maxLength={10_000} disabled={!!node.locked} value={plainText(text)}
        onChange={event => onEdit(node.id, withText(text, event.target.value))} /></label>}
    <label className={LABEL}>{node.type === 'text' ? t('thisText') : t('thisImage')}
      <select className={INPUT} disabled={!!node.locked} value={ai ? 'ai' : 'static'} onChange={event => setField(event.target.value === 'static'
        ? { kind: node.type, mode: 'static' } as FieldConfig
        : node.type === 'text' ? { kind: 'text', mode: 'ai', prompt: '', length: 'auto' } : { kind: 'image', mode: 'ai_generate', prompt: '' })}>
        <option value="static">{t('same')}</option><option value="ai">{node.type === 'text' ? t('aiText') : t('aiImage')}</option>
      </select></label>
    {ai && field && 'prompt' in field && <label className={LABEL}>{node.type === 'text' ? t('promptText') : t('promptImage')}
      <textarea className={`${INPUT} ${prompt.trim() ? '' : 'border-red-300'}`} rows={3} maxLength={FIELD_PROMPT_LIMIT} disabled={!!node.locked}
        placeholder={t('promptPlaceholder')} value={prompt} onChange={event => setField({ ...field, prompt: event.target.value })} /></label>}
    {field?.mode === 'ai' && <>
      <label className={LABEL}>{t('length')}
        <select className={INPUT} disabled={!!node.locked} value={field.length} onChange={event => setField({ ...field, length: event.target.value as typeof field.length })}>
          {(['auto', 'short', 'medium', 'long'] as const).map(value => <option key={value} value={value}>{t(`lengths.${value}`)}</option>)}
        </select></label>
      <p className="text-xs text-ink-muted">{t('capacity', { count: capacity })}</p>
      <p className="text-xs leading-relaxed text-ink-muted">{t('exampleHint')}</p>
    </>}
  </Section>
}

function CaptionSection({ doc, onCaption }: { doc: DesignDoc; onCaption: (caption: DesignDoc['meta']['caption']) => void }) {
  const t = useTranslations('editor.designEditor')
  const caption = doc.meta.caption ?? { mode: 'static' as const, value: '' }
  const value = caption.mode === 'ai' ? caption.prompt : caption.value
  const errors = caption.mode === 'static' ? inspectCaption(caption.value).errors : []
  return <Section title={t('card')}>
    <label className={LABEL}>{t('caption')}
      <select className={INPUT} value={caption.mode} onChange={event => onCaption(event.target.value === 'ai' ? { mode: 'ai', prompt: '' } : { mode: 'static', value: '' })}>
        <option value="static">{t('captionStatic')}</option><option value="ai">{t('captionAi')}</option>
      </select></label>
    <label className={LABEL}>{caption.mode === 'ai' ? t('promptText') : t('caption')}
      <textarea className={INPUT} rows={4} maxLength={caption.mode === 'ai' ? FIELD_PROMPT_LIMIT : 2200} placeholder={t('captionPlaceholder')} value={value}
        onChange={event => onCaption(caption.mode === 'ai' ? { mode: 'ai', prompt: event.target.value } : { mode: 'static', value: event.target.value })} /></label>
    {caption.mode === 'static' && <p className="text-right text-[11px] text-ink-muted tabular-nums">{value.length}/2200</p>}
    {errors.map(error => <p key={error} className="text-xs text-red-600">{error}</p>)}
    <p className="text-xs leading-relaxed text-ink-muted">{t('captionHint')}</p>
  </Section>
}
