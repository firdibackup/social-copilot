'use client'

import { useState } from 'react'
import { useEditorScope } from './editor-provider'

export function Thumbnail({ id, src, size, className }: { id: string; src: string; size: 96 | 256; className: string }) {
  const scope = useEditorScope()
  const [failed, setFailed] = useState(false)
  const url = `/api/content/thumbnail?${new URLSearchParams({ id, scope, w: String(size) })}`
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={failed ? src : url} alt="" loading="lazy" decoding="async" className={className} onError={() => setFailed(true)} />
}
