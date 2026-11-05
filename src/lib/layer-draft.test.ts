import { expect, it } from 'vitest'
import { emptyDoc } from './layer-doc'
import { parseLayerDraft, serializeLayerDraft } from './layer-draft'

it('retains the source version and still recognizes legacy recovery drafts', () => {
  const doc = emptyDoc(1080, 1350)
  expect(parseLayerDraft(serializeLayerDraft(doc, 'v1'))).toEqual({ doc, version: 'v1' })
  expect(parseLayerDraft(serializeLayerDraft(doc, null))).toEqual({ doc, version: '' })
  expect(parseLayerDraft(JSON.stringify(doc))).toEqual({ doc, version: null })
  for (const raw of ['{broken', 'null', JSON.stringify({ doc, version: 1 }), JSON.stringify({ doc: {}, version: '' })]) {
    expect(parseLayerDraft(raw)).toBeNull()
  }
})
