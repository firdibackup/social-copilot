'use client'

import { useEffect, useRef } from 'react'
import { fontFamilyOf } from '@/components/font-previews'
import type { DesignDoc, DesignPage } from '@/lib/design-doc'
import { renderDesignCanvas } from '@/lib/design-browser'

const familyOf = (name: string) => fontFamilyOf(name) ?? 'sans-serif'

/** A starter page drawn with the editor's own renderer, so the gallery shows exactly what opens. */
export function StarterThumb({ page }: { page: DesignPage }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let live = true
    const doc: DesignDoc = { format: 'carousely.design', schemaVersion: 1, id: page.id, title: '', unit: 'px', dpi: 96, pages: [page], assets: [], fonts: [], meta: {} }
    void renderDesignCanvas(doc, 0, familyOf, 320 / page.width).then(image => {
      const target = ref.current
      if (!live || !target) return
      target.width = image.width
      target.height = image.height
      target.getContext('2d')?.drawImage(image, 0, 0)
    }).catch(() => undefined)
    return () => { live = false }
  }, [page])
  return <canvas ref={ref} aria-hidden="true" className="w-full rounded-xl bg-zinc-100 ring-accent group-hover:ring-2"
    style={{ aspectRatio: `${page.width} / ${page.height}` }} />
}
