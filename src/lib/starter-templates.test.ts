import { describe, expect, it } from 'vitest'
import { parseDesignDoc, walkNodes, type DesignDoc, type DesignPage, type TextNode } from './design-doc'
import { applyDesignOperation, clonePage } from './design-operations'
import { STARTER_TEMPLATES, starterPage, type StarterFormat } from './starter-templates'

const docOf = (page: DesignPage): DesignDoc => ({ format: 'carousely.design', schemaVersion: 1,
  id: '00000000-0000-4000-8000-000000000001', title: 'Uji', unit: 'px', dpi: 96, pages: [page], assets: [], fonts: [], meta: {} })

describe('starter templates', () => {
  it('ships at least 20 valid, editable templates in both formats', () => {
    expect(STARTER_TEMPLATES.length).toBeGreaterThanOrEqual(20)
    expect(new Set(STARTER_TEMPLATES.map(item => item.id)).size).toBe(STARTER_TEMPLATES.length)
    for (const item of STARTER_TEMPLATES) for (const format of ['4:5', '1:1'] as StarterFormat[]) {
      const page = starterPage(item.id, format)
      expect(parseDesignDoc(docOf(page)), `${item.id} ${format}`).toHaveProperty('doc')
      expect(page.height).toBe(format === '1:1' ? 1080 : 1350)
      // Every template has at least one AI text field with a prompt, so it can produce many cards.
      const fields = walkNodes(page.children).filter((node): node is TextNode => node.type === 'text' && node.data?.carousely?.field?.mode === 'ai')
      expect(fields.length, item.id).toBeGreaterThan(0)
    }
  })
  it('covers every category', () => {
    expect(new Set(STARTER_TEMPLATES.map(item => item.category))).toEqual(new Set(['cover', 'content', 'data', 'quote', 'cta', 'promo']))
  })
})

describe('node and page operations', () => {
  let n = 100
  const fresh = () => `00000000-0000-4000-8000-${String(n++).padStart(12, '0')}`
  const base = () => docOf(clonePage(starterPage('cover-bold', '4:5'), fresh))

  it('inserts copies of starter pages with fresh identities and a bounded page count', () => {
    const doc = base()
    const twice = applyDesignOperation(doc, { type: 'insertPages', index: 1,
      pages: [clonePage(starterPage('content-numbered', '4:5'), fresh), clonePage(starterPage('content-numbered', '4:5'), fresh)] })
    expect(twice.pages).toHaveLength(3)
    expect(parseDesignDoc(twice)).toHaveProperty('doc')
    expect(() => applyDesignOperation(twice, { type: 'insertPages', index: 0,
      pages: Array.from({ length: 8 }, () => clonePage(starterPage('quote-statement', '4:5'), fresh)) })).toThrow('too_many_pages')
  })

  it('adds, reorders and removes nodes, rejecting duplicate ids', () => {
    const doc = base()
    const page = doc.pages[0]
    const [first, second] = page.children
    const front = applyDesignOperation(doc, { type: 'reorderNode', pageId: page.id, nodeId: first.id, to: 'front' })
    expect(front.pages[0].children.at(-1)!.id).toBe(first.id)
    const back = applyDesignOperation(front, { type: 'reorderNode', pageId: page.id, nodeId: first.id, to: 'back' })
    expect(back.pages[0].children[0].id).toBe(first.id)
    const removed = applyDesignOperation(doc, { type: 'removeNode', pageId: page.id, nodeId: second.id })
    expect(removed.pages[0].children.map(node => node.id)).not.toContain(second.id)
    expect(() => applyDesignOperation(doc, { type: 'insertNode', pageId: page.id, node: first })).toThrow('invalid_document')
    const added = applyDesignOperation(doc, { type: 'insertNode', pageId: page.id, node: { ...structuredClone(first), id: fresh() } })
    expect(added.pages[0].children).toHaveLength(page.children.length + 1)
  })

  it('drops a panel hug when its text is removed, so the document stays valid', () => {
    const doc = base()
    const page = doc.pages[0]
    const label = page.children.find(node => node.type === 'text')!
    const accent = page.children.find(node => node.type === 'shape')!
    const hugged = applyDesignOperation(doc, { type: 'node', pageId: page.id, nodeId: accent.id,
      changes: { data: { carousely: { hug: { textId: label.id } } } } })
    const removed = applyDesignOperation(hugged, { type: 'removeNode', pageId: page.id, nodeId: label.id })
    expect(removed.pages[0].children.find(node => node.id === accent.id)!.data?.carousely?.hug).toBeUndefined()
  })
})
