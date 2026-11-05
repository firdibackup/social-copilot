import { parseLayerDoc, type LayerDoc } from './layer-doc'

export interface LayerDraft { doc: LayerDoc; version: string }

/** Old drafts remain recoverable manually; carousel copying requires a known source version. */
export function parseLayerDraft(raw: string): { doc: LayerDoc; version: string | null } | null {
  try {
    const value = JSON.parse(raw)
    const wrapped = value && typeof value === 'object' && 'doc' in value
    if (wrapped && typeof value.version !== 'string') return null
    const parsed = parseLayerDoc(wrapped ? value.doc : value)
    return 'error' in parsed ? null : { doc: parsed.doc, version: wrapped ? value.version : null }
  } catch { return null }
}

export function serializeLayerDraft(doc: LayerDoc, version: string | null): string {
  return JSON.stringify({ doc, version: version ?? '' } satisfies LayerDraft)
}
