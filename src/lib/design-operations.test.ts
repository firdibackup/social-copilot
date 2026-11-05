import { expect, it } from 'vitest'
import { migrateLayerDoc, parseDesignDoc } from './design-doc'
import { applyDesignOperation, templatePageCounts } from './design-operations'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const source = () => migrateLayerDoc({ v: 1, width: 1080, height: 1350, layers: [{ id: 'i', kind: 'image',
  x: 0, y: 0, w: 100, h: 100, assetId: id(8), role: 'logo', locked: true }] },
{ id: id(1), pageId: id(2), nodeIds: [id(3)] }, id(4))

it('preserves locked nodes and source documents while validating every change', () => {
  const doc = source()
  expect(() => applyDesignOperation(doc, { type: 'node', pageId: id(2), nodeId: id(3), changes: { name: 'Changed' } })).toThrow('node_locked')
  const unlocked = applyDesignOperation(doc, { type: 'node', pageId: id(2), nodeId: id(3), changes: { locked: false } })
  expect(doc.pages[0].children[0].locked).toBe(true)
  expect(unlocked.pages[0].children[0].locked).toBe(false)
  expect(() => applyDesignOperation(unlocked, { type: 'node', pageId: id(2), nodeId: id(3), changes: { opacity: 2 } })).toThrow('invalid_document')
})

it('duplicates, reorders and deletes pages without permitting an empty document', () => {
  let n = 20
  const doc = applyDesignOperation(source(), { type: 'duplicatePage', pageId: id(2) }, () => id(n++))
  expect(parseDesignDoc(doc)).toHaveProperty('doc')
  expect(doc.pages[1].children[0].id).not.toBe(doc.pages[0].children[0].id)
  const moved = applyDesignOperation(doc, { type: 'movePage', pageId: id(2), direction: 1 })
  expect(moved.pages[1].id).toBe(id(2))
  const single = applyDesignOperation(moved, { type: 'removePage', pageId: id(2) })
  expect(() => applyDesignOperation(single, { type: 'removePage', pageId: single.pages[0].id })).toThrow('last_page')
})

it('protects nested children of locked groups, including attempts to unlock a child', () => {
  const doc = source()
  const child = { ...doc.pages[0].children[0], locked: false }
  doc.pages[0].children = [{ ...child, id: id(9), type: 'group', locked: true, children: [child] } as never]
  // A group has no image fill.
  delete (doc.pages[0].children[0] as unknown as Record<string, unknown>).fill
  expect(parseDesignDoc(doc)).toHaveProperty('doc')
  for (const changes of [{ name: 'Changed' }, { locked: false }]) {
    expect(() => applyDesignOperation(doc, { type: 'node', pageId: id(2), nodeId: child.id, changes })).toThrow('node_locked')
  }
  const unlocked = applyDesignOperation(doc, { type: 'node', pageId: id(2), nodeId: id(9), changes: { locked: false } })
  expect(() => applyDesignOperation(unlocked, { type: 'node', pageId: id(2), nodeId: child.id, changes: { name: 'Changed' } })).not.toThrow()
})

it('bounds repeat expansion to ten slides and retains every source page', () => {
  const page = source().pages[0]
  expect(templatePageCounts([{ ...page, repeat: { mode: 'fixed', count: 8 } }, { ...page, id: id(5), repeat: { mode: 'fixed', count: 6 } }, { ...page, id: id(6) }])).toEqual([4, 5, 1])
  expect(templatePageCounts([{ ...page, repeat: { mode: 'ai' } }], { [page.id]: 10 })).toEqual([6])
  expect(templatePageCounts(Array.from({ length: 10 }, (_, index) => ({ ...page, id: id(index + 20), repeat: { mode: 'ai' as const } })))).toEqual(Array(10).fill(1))
  expect(() => templatePageCounts([{ ...page, repeat: { mode: 'fixed', count: NaN } }])).toThrow('invalid_repeat')
})
