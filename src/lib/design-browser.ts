import { drawDesignPage } from './design-canvas'
import { designAssetIds, walkNodes, type DesignDoc } from './design-doc'
import { loadFont } from './font-loader'
import { loadImage } from './layer-canvas'
import { layerImageUrl } from './layer-doc'

/** Render offscreen first so a failed or superseded load never clears the visible design. `scale` < 1 draws a thumbnail. */
export async function renderDesignCanvas(doc: DesignDoc, pageIndex: number, family: (name: string) => string, scale = 1): Promise<HTMLCanvasElement> {
  const page = doc.pages[pageIndex]
  if (!page) throw new Error('page_not_found')
  const styles = walkNodes(page.children).flatMap(node => node.type === 'text' ? node.content.flatMap(paragraph => paragraph.runs.map(run => run.style)) : [])
  const fonts = async () => {
    await Promise.all([...new Set(styles.map(style => style.fontFamily))].map(loadFont))
    await Promise.all(styles.map(style => document.fonts.load(`${style.fontStyle === 'Italic' ? 'italic ' : ''}${style.axes.wght} 32px ${family(style.fontFamily)}`)))
    await document.fonts.ready
  }
  const ids = designAssetIds({ ...doc, pages: [page], assets: [], fonts: [] })
  const [images] = await Promise.all([Promise.all(ids.map(async id => {
    const image = await loadImage(layerImageUrl(id))
    return [id, { image, width: image.naturalWidth, height: image.naturalHeight }] as const
  })), fonts()])
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(page.width * scale))
  canvas.height = Math.max(1, Math.round(page.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('canvas_unavailable')
  context.scale(scale, scale)
  drawDesignPage(context, page, new Map(images), family)
  return canvas
}
