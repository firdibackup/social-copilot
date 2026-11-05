import { designAssetIds, DESIGN_LIMITS, parseDesignDoc, walkNodes, type DesignDoc } from './design-doc'

/** Copies pages with new identities, including references between nodes, without changing the sources. */
export function combineTemplateDocuments(documents: readonly DesignDoc[], title: string, caption: string,
  newId: () => string = () => crypto.randomUUID()): DesignDoc {
  if (!documents.length || documents.some(doc => 'error' in parseDesignDoc(doc))) throw new Error('invalid_document')
  const pages = documents.flatMap(doc => doc.pages)
  if (pages.length > DESIGN_LIMITS.pages) throw new Error('too_many_pages')
  const doc: DesignDoc = {
    format: 'carousely.design', schemaVersion: 1, id: newId(), title, unit: 'px', dpi: 96,
    pages: pages.map((source, index) => {
      const page = structuredClone(source)
      const nodes = walkNodes(page.children)
      const ids = new Map(nodes.map(node => [node.id, newId()]))
      page.id = newId()
      page.name = `Slide ${index + 1}`
      for (const node of nodes) {
        node.id = ids.get(node.id)!
        const hug = node.data?.carousely?.hug
        if (hug) hug.textId = ids.get(hug.textId)!
      }
      return page
    }),
    assets: [],
    fonts: [...new Map(documents.flatMap(doc => doc.fonts).map(font => [`${font.family}:${font.assetId ?? ''}`, structuredClone(font)])).values()],
    meta: { caption: { mode: 'static', value: caption } },
  }
  const fontIds = new Set(doc.fonts.flatMap(font => font.assetId ? [font.assetId] : []))
  doc.assets = designAssetIds(doc).map(id => ({ id, kind: fontIds.has(id) ? 'font' : 'image' }))
  if ('error' in parseDesignDoc(doc)) throw new Error('invalid_document')
  return doc
}
