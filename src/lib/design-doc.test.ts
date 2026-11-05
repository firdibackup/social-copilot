import { describe, expect, it } from 'vitest'
import { designAssetIds, hexColor, migrateLayerDoc, parseDesignDoc, type DesignDoc, type GroupNode, type TextNode } from './design-doc'
import type { LayerDoc } from './layer-doc'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const legacy: LayerDoc = { v: 1, width: 1080, height: 1350, layers: [
  { id: 't1', kind: 'text', text: 'Halo\ndunia', x: 80, y: 120, w: 800, h: 140, font: 'Inter', size: 56,
    weight: 700, color: '#abcdef', align: 'center', lineHeight: 1.25, italic: true, underline: true,
    uppercase: true, letterSpacing: 0.1, shadow: true, opacity: 0.5 },
  { id: 'l2', kind: 'image', assetId: id(7), role: 'logo', x: 100, y: 1100, w: 150, h: 75 },
] }
const identity = { id: id(1), pageId: id(2), nodeIds: [id(3), id(4), id(5)] }
const sample = () => migrateLayerDoc(legacy, identity, id(6), id(8), 'Contoh')

describe('design document migration', () => {
  it('migrates a full legacy page including astral characters without lowering its text budget', () => {
    const text = legacy.layers[0]
    const full = { ...legacy, layers: Array.from({ length: 30 }, (_, index) => ({ ...text, id: `t${index}`, text: '🙂'.repeat(500) })) }
    const doc = migrateLayerDoc(full, { id: id(1), pageId: id(2), nodeIds: Array.from({ length: 30 }, (_, n) => id(100 + n)) }, id(6))
    expect(doc.pages[0].children).toHaveLength(30)
    expect(parseDesignDoc(doc)).toHaveProperty('doc')
  })
  it('preserves legacy layout and actual shadow/spacing units, with stable identities', () => {
    const doc = sample()
    expect(sample()).toEqual(doc)
    expect(parseDesignDoc(JSON.parse(JSON.stringify(doc)))).toEqual({ doc })
    const [original, text, logo] = doc.pages[0].children
    expect(original).toMatchObject({ hidden: true, locked: true, name: 'Gambar asli', fill: { assetId: id(8) } })
    expect(text).toMatchObject({ transform: { x: 80, y: 120 }, opacity: 0.5, effects: [
      { dx: 0, dy: 56 * 0.04, blur: 56 * 0.08, opacity: 0.45 },
    ], content: [{ runs: [{ text: 'Halo\ndunia', style: {
      fontFamily: 'Inter', fontStyle: 'Italic', fontSize: 56, letterSpacing: 10, case: 'upper', underline: true,
      fill: { color: hexColor('#abcdef') },
    } }], style: { align: 'center', lineHeight: 1.25 } }] })
    expect(logo).toMatchObject({ size: { width: 150, height: 75 }, fill: { fit: 'stretch', assetId: id(7) } })
    expect(designAssetIds(doc).sort()).toEqual([id(6), id(7), id(8)].sort())
    expect(legacy.layers[0]).toHaveProperty('color', '#abcdef')
  })

  it('rejects invalid migration identities rather than dropping layers', () => {
    expect(() => migrateLayerDoc(legacy, { ...identity, nodeIds: [] }, id(6), id(8))).toThrow('invalid_legacy_design')
    expect(() => migrateLayerDoc(legacy, { ...identity, nodeIds: [id(3), id(3), id(5)] }, id(6), id(8))).toThrow('invalid_migrated_design')
  })
})

describe('design validation', () => {
  it('shares platform caption limits, counting emoji as code points', () => {
    const doc = sample()
    doc.meta.caption = { mode: 'static', value: '🙂'.repeat(2200) }
    expect(parseDesignDoc(doc)).toHaveProperty('doc')
    for (const value of ['🙂'.repeat(2201), '#tag '.repeat(31), '@user '.repeat(21)]) {
      doc.meta.caption = { mode: 'static', value }
      expect(parseDesignDoc(doc)).toHaveProperty('error')
    }
  })
  it('rejects unsupported versions, unknown properties and duplicate IDs', () => {
    expect(parseDesignDoc({ ...sample(), schemaVersion: 2 })).toEqual({ error: 'version' })
    expect(parseDesignDoc({ ...sample(), html: '<script>' })).toEqual({ error: 'invalid' })
    const doc = sample()
    doc.pages[0].children[1].id = doc.pages[0].id
    expect(parseDesignDoc(doc)).toEqual({ error: 'invalid' })
  })

  it('validates AI fields, finite geometry, text bounds and local hug references', () => {
    for (const alter of [
      (doc: DesignDoc) => { doc.pages[0].children[1].transform.x = Infinity },
      (doc: DesignDoc) => { (doc.pages[0].children[1] as TextNode).content[0].runs[0].text = 'x'.repeat(10_001) },
      (doc: DesignDoc) => { doc.pages[0].children[1].data = { carousely: { field: { kind: 'image', mode: 'static' } } } },
      (doc: DesignDoc) => { doc.pages[0].children[1].data = { carousely: { hug: { textId: id(99) } } } },
    ]) {
      const doc = sample()
      alter(doc)
      expect(parseDesignDoc(doc)).toEqual({ error: 'invalid' })
    }
    const doc = sample()
    doc.pages[0].children[1].data = { carousely: { field: { kind: 'text', mode: 'ai', prompt: '', length: 'auto' } } }
    expect(parseDesignDoc(doc)).toHaveProperty('doc')
  })

  it('bounds page count, recursive depth, and total node count per page', () => {
    const doc = sample()
    doc.pages = Array.from({ length: 11 }, (_, n) => ({ ...doc.pages[0], id: id(n + 20), children: [] }))
    expect(parseDesignDoc(doc)).toEqual({ error: 'invalid' })
    const group = (n: number): GroupNode => ({ id: id(n), name: 'Group', type: 'group',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }, size: { width: 100, height: 100 }, opacity: 1, children: [] })
    const deep = sample()
    let root = group(30)
    deep.pages[0].children = [root]
    for (let n = 31; n < 40; n++) { const child = group(n); root.children = [child]; root = child }
    expect(parseDesignDoc(deep)).toEqual({ error: 'invalid' })
    deep.pages[0].children = Array.from({ length: 201 }, (_, n) => group(n + 50))
    expect(parseDesignDoc(deep)).toEqual({ error: 'invalid' })
  })

  it('discovers nested masks, image fills, hidden originals, and fonts for ownership and cleanup', () => {
    const doc = sample()
    const image = doc.pages[0].children[0]
    if (image.type !== 'image') throw new Error('fixture')
    image.fill.maskAssetId = id(9)
    doc.pages[0].children = [{ ...image, id: id(10), type: 'group', children: [image] } as GroupNode]
    doc.assets = []
    doc.fonts = [{ family: 'Inter', assetId: id(11) }]
    expect(designAssetIds(doc).sort()).toEqual([id(6), id(8), id(9), id(11)].sort())
  })
})
