import { expect, it } from 'vitest'
import { hexColor, migrateLayerDoc, parseDesignDoc } from './design-doc'
import { combineTemplateDocuments } from './design-template'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
function source() {
  const doc = migrateLayerDoc({ v: 1, width: 1080, height: 1350, layers: [{ id: 't', kind: 'text', text: 'Contoh',
    x: 10, y: 20, w: 900, h: 80, font: 'Inter', size: 56, weight: 700, color: '#FFFFFF', align: 'left', lineHeight: 1.2,
    field: { kind: 'text', mode: 'ai', prompt: 'Tips usaha', length: 'short' } }] },
  { id: id(1), pageId: id(2), nodeIds: [id(3)] }, id(4))
  doc.pages[0].children.push({ id: id(5), type: 'shape', name: 'Panel', transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    size: { width: 950, height: 100 }, opacity: 1, kind: 'rect', cornerRadius: 0, fill: { type: 'solid', color: hexColor('#000000') },
    data: { carousely: { hug: { textId: id(3) } } } })
  return doc
}
it('copies repeated source documents with unique node identities and local hug references', () => {
  const original = source()
  const before = structuredClone(original)
  let n = 100
  const result = combineTemplateDocuments([original, original], 'Carousel', 'Caption', () => id(n++))
  expect(parseDesignDoc(result)).toHaveProperty('doc')
  expect(result.pages).toHaveLength(2)
  for (const page of result.pages) {
    expect(page.children[1].data?.carousely?.hug?.textId).toBe(page.children[0].id)
    expect(page.children[0].data?.carousely?.field).toEqual(original.pages[0].children[0].data?.carousely?.field)
  }
  expect(result.assets).toEqual([{ id: id(4), kind: 'image' }])
  expect(result.meta.caption).toEqual({ mode: 'static', value: 'Caption' })
  expect(original).toEqual(before)
})
it('refuses empty, oversized and unreadable templates', () => {
  expect(() => combineTemplateDocuments([], '', '')).toThrow('invalid_document')
  expect(() => combineTemplateDocuments(Array.from({ length: 11 }, source), '', '')).toThrow('too_many_pages')
  expect(() => combineTemplateDocuments([{ ...source(), schemaVersion: 2 } as never], '', '')).toThrow('invalid_document')
})
