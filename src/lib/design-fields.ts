export type FieldConfig =
  | { kind: 'text'; mode: 'static' }
  | { kind: 'text'; mode: 'ai'; prompt: string; length: 'auto' | 'short' | 'medium' | 'long' }
  | { kind: 'image'; mode: 'static' }
  | { kind: 'image'; mode: 'ai_generate'; prompt: string }
  | { kind: 'image'; mode: 'stock'; stockQuery: string }
  | { kind: 'image'; mode: 'folder'; folderId: string }

export const FIELD_PROMPT_LIMIT = 2000
export function isFieldConfig(value: unknown, kind: string): value is FieldConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  if (v.kind !== kind || !['text', 'image'].includes(kind)) return false
  const keys = (...allowed: string[]) => Object.keys(v).every(key => ['kind', 'mode', ...allowed].includes(key))
  const text = (value: unknown, max: number) => typeof value === 'string' && value.length <= max
  if (v.mode === 'static') return keys()
  if (kind === 'text') return v.mode === 'ai' && keys('prompt', 'length') && text(v.prompt, FIELD_PROMPT_LIMIT)
    && typeof v.length === 'string' && ['auto', 'short', 'medium', 'long'].includes(v.length)
  if (v.mode === 'ai_generate') return keys('prompt') && text(v.prompt, FIELD_PROMPT_LIMIT)
  if (v.mode === 'stock') return keys('stockQuery') && text(v.stockQuery, 300)
  return v.mode === 'folder' && keys('folderId') && typeof v.folderId === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.folderId)
}

export function fieldReady(field: FieldConfig | undefined): boolean {
  if (!field || field.mode === 'static') return false
  if (field.mode === 'folder') return Boolean(field.folderId)
  return (field.mode === 'stock' ? field.stockQuery : field.prompt).trim().length > 0
}

/** Capacity estimate; rendering performs the final fit with actual font metrics. */
export function fieldMaxChars(width: number, height: number, size: number, lineHeight: number,
  length: 'auto' | 'short' | 'medium' | 'long'): number {
  if (![width, height, size, lineHeight].every(value => Number.isFinite(value) && value > 0)) return 0
  const lines = length === 'auto' ? Math.floor(height / (size * lineHeight)) : { short: 1, medium: 2, long: 3 }[length]
  return Math.max(0, lines * Math.floor(width / (size * 0.52)))
}
