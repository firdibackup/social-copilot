'use client'

import { useTranslations } from 'next-intl'
import { FIELD_PROMPT_LIMIT } from '@/lib/design-fields'
import { walkNodes, type DesignDoc, type DesignNode } from '@/lib/design-doc'
import { ancestorLocked, type DesignOperation } from '@/lib/design-operations'

const INPUT = 'mt-1 w-full rounded-lg border border-hairline bg-white px-2 py-2 text-base md:text-sm disabled:opacity-50'

/** Edits the actual node document, including individual rich-text runs, without a legacy projection. */
export function DesignNodePanel({ doc, pageIndex, onChange, selectedId }: { doc: DesignDoc; pageIndex: number; onChange: (op: DesignOperation) => void; selectedId?: string | null }) {
  const t = useTranslations('editor.templateGallery')
  const field = useTranslations('editor.layerEditor')
  const page = doc.pages[pageIndex]
  const update = (node: DesignNode, changes: Partial<DesignNode>) => onChange({ type: 'node', pageId: page.id, nodeId: node.id, changes })
  return <div className="space-y-4 text-sm">
    <label className="block">{t('pageName')}<input className={INPUT} maxLength={120} value={page.name}
      onChange={event => onChange({ type: 'page', pageId: page.id, changes: { name: event.target.value } })} /></label>
    <label className="block">{t('repeat')}<select className={INPUT} value={page.repeat?.mode ?? 'once'}
      onChange={event => onChange({ type: 'page', pageId: page.id, changes: { repeat: event.target.value === 'once' ? null
        : event.target.value === 'ai' ? { mode: 'ai' } : { mode: 'fixed', count: 2 } } })}>
      <option value="once">{t('once')}</option><option value="ai">{t('repeatAi')}</option><option value="fixed">{t('repeatFixed')}</option>
    </select></label>
    {page.repeat?.mode === 'fixed' && <label className="block">{t('repeatCount')}<input className={INPUT} type="number" min={1} max={10}
      value={page.repeat.count} onChange={event => { const count = Number(event.target.value); if (Number.isInteger(count) && count >= 1 && count <= 10)
        onChange({ type: 'page', pageId: page.id, changes: { repeat: { mode: 'fixed', count } } }) }} /></label>}
    <label className="block">{t('captionMode')}<select className={INPUT} value={doc.meta.caption?.mode ?? 'static'} onChange={event => onChange({ type: 'caption',
      caption: event.target.value === 'ai' ? { mode: 'ai', prompt: '' } : { mode: 'static', value: '' } })}>
      <option value="static">{field('fieldStatic')}</option><option value="ai">{field('fieldAiText')}</option>
    </select></label>
    <label className="block">{doc.meta.caption?.mode === 'ai' ? field('fieldPrompt') : t('caption')}
      <textarea className={INPUT} rows={3} maxLength={doc.meta.caption?.mode === 'ai' ? FIELD_PROMPT_LIMIT : 4400}
        value={doc.meta.caption?.mode === 'ai' ? doc.meta.caption.prompt : doc.meta.caption?.value ?? ''}
        onChange={event => onChange({ type: 'caption', caption: doc.meta.caption?.mode === 'ai'
          ? { mode: 'ai', prompt: event.target.value } : { mode: 'static', value: event.target.value } })} /></label>
    {walkNodes(page.children).map(node => <details key={node.id} open={selectedId === node.id || undefined} className="rounded-lg border border-hairline p-3">
      <summary className="cursor-pointer break-words font-medium">{node.name || node.type}</summary>
      <div className="mt-3 space-y-3">
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" disabled={ancestorLocked(page.children, node.id)} checked={!!node.locked} onChange={event => update(node, { locked: event.target.checked })} />{field('lockedLayer')}</label>
        <fieldset disabled={node.locked || ancestorLocked(page.children, node.id)} className="space-y-3 disabled:opacity-50">
          <label className="block">{field('layerName')}<input className={INPUT} maxLength={120} value={node.name} onChange={event => update(node, { name: event.target.value })} /></label>
          <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={!!node.hidden} onChange={event => update(node, { hidden: event.target.checked })} />{field('hiddenLayer')}</label>
          {node.type === 'text' && node.content.map((paragraph, p) => paragraph.runs.map((run, r) => <label className="block" key={`${p}:${r}`}>
            {t('textRun', { paragraph: p + 1, run: r + 1 })}<textarea className={INPUT} rows={2} value={run.text} maxLength={10000} onChange={event => {
              const content = structuredClone(node.content)
              content[p].runs[r].text = event.target.value
              update(node, { content })
            }} /></label>))}
          {(node.type === 'text' || node.type === 'image') && <>
            <label className="block">{field('fieldMode')}<select className={INPUT} value={node.data?.carousely?.field?.mode ?? 'static'} onChange={event => update(node, {
              data: { carousely: { ...node.data?.carousely, field: event.target.value === 'static' ? { kind: node.type, mode: 'static' }
                : node.type === 'text' ? { kind: 'text', mode: 'ai', prompt: '', length: 'auto' } : { kind: 'image', mode: 'ai_generate', prompt: '' } } },
            })}>
              <option value="static">{field('fieldStatic')}</option><option value={node.type === 'text' ? 'ai' : 'ai_generate'}>{field(node.type === 'text' ? 'fieldAiText' : 'fieldAiImage')}</option>
              {node.data?.carousely?.field?.mode === 'stock' && <option value="stock">{t('stock')}</option>}
              {node.data?.carousely?.field?.mode === 'folder' && <option value="folder">{t('folder')}</option>}
            </select></label>
            {node.data?.carousely?.field && 'prompt' in node.data.carousely.field && <label className="block">{field('fieldPrompt')}
              <textarea className={INPUT} rows={3} maxLength={FIELD_PROMPT_LIMIT} value={node.data.carousely.field.prompt} onChange={event => {
                const config = node.data?.carousely?.field
                if (config && 'prompt' in config) update(node, { data: { carousely: { ...node.data?.carousely, field: { ...config, prompt: event.target.value } } } })
              }} /></label>}
            {node.data?.carousely?.field?.mode === 'ai' && <label className="block">{field('fieldLength')}<select className={INPUT}
              value={node.data.carousely.field.length} onChange={event => {
                const config = node.data?.carousely?.field
                if (config?.mode === 'ai') update(node, { data: { carousely: { ...node.data?.carousely, field: { ...config, length: event.target.value as 'auto' | 'short' | 'medium' | 'long' } } } })
              }}>
              {(['auto', 'short', 'medium', 'long'] as const).map(length => <option key={length} value={length}>{field(`fieldLengths.${length}`)}</option>)}
            </select></label>}
          </>}
          <div className="grid grid-cols-2 gap-2">{(['x', 'y', 'rotation'] as const).map(key => <label key={key}>{field(`coordinates.${key}`)}
            <input className={INPUT} type="number" value={node.transform[key]} min={key === 'rotation' ? -360 : -8000} max={key === 'rotation' ? 360 : 8000}
              onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) update(node, { transform: { ...node.transform, [key]: value } }) }} />
          </label>)}</div>
          {node.type === 'shape' && <label className="block">{t('hug')}<select className={INPUT} value={node.data?.carousely?.hug?.textId ?? ''} onChange={event => {
            const data = { ...node.data?.carousely }
            if (event.target.value) data.hug = { textId: event.target.value }; else delete data.hug
            update(node, { data: { carousely: data } })
          }}><option value="">{t('fixedSize')}</option>{walkNodes(page.children).filter(item => item.type === 'text').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        </fieldset>
      </div>
    </details>)}
  </div>
}
