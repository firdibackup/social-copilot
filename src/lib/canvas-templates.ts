import 'server-only'
import { designAssetIds, parseDesignDoc, type DesignDoc } from './design-doc'
import { ownsAssets } from './slide-layers'
import { db, unwrap } from './supabase'

export interface CanvasTemplateSummary {
  id: string
  name: string
  previewAssetId: string | null
  version: string
  pages: number
}
export class CanvasTemplateError extends Error {
  constructor(readonly code: 'invalid_document' | 'invalid_media' | 'conflict') { super(code) }
}
type Row = { id: string; name: string; preview_asset_id: string | null; updated_at: string; page_count: number }
const summary = (row: Row): CanvasTemplateSummary => ({ id: row.id, name: row.name,
  previewAssetId: row.preview_asset_id, version: row.updated_at, pages: row.page_count })

export async function listCanvasTemplates(userId: string, accountId: string): Promise<CanvasTemplateSummary[]> {
  const rows: Row[] = unwrap(await db().from('canvas_templates').select('id, name, preview_asset_id, updated_at, page_count')
    .eq('user_id', userId).eq('account_id', accountId).is('archived_at', null).order('updated_at', { ascending: false }))
  return rows.map(summary)
}

export async function getCanvasTemplate(userId: string, accountId: string, id: string): Promise<(CanvasTemplateSummary & { doc: DesignDoc }) | null> {
  const row: (Row & { doc: unknown }) | null = unwrap(await db().from('canvas_templates')
    .select('id, name, preview_asset_id, updated_at, page_count, doc').eq('id', id).eq('user_id', userId)
    .eq('account_id', accountId).is('archived_at', null).maybeSingle())
  if (!row) return null
  const parsed = parseDesignDoc(row.doc)
  if ('error' in parsed) throw new CanvasTemplateError('invalid_document')
  return { ...summary(row), doc: parsed.doc }
}

export async function saveCanvasTemplate(userId: string, accountId: string, input: {
  id: string; name: string; doc: DesignDoc; previewAssetId: string | null; expectedVersion: string | null
}): Promise<CanvasTemplateSummary> {
  const parsed = parseDesignDoc(input.doc)
  const name = input.name.trim()
  if ('error' in parsed || !name || name.length > 120) throw new CanvasTemplateError('invalid_document')
  const ids = [...designAssetIds(parsed.doc), ...(input.previewAssetId ? [input.previewAssetId] : [])]
  if (!await ownsAssets(userId, accountId, ids)) throw new CanvasTemplateError('invalid_media')
  const { data, error } = await db().rpc('save_canvas_template', { p_user_id: userId, p_account_id: accountId,
    p_id: input.id, p_name: name, p_doc: parsed.doc, p_preview_asset_id: input.previewAssetId,
    p_expected_version: input.expectedVersion })
  if (error?.message === 'conflict' || error?.message === 'invalid_media') throw new CanvasTemplateError(error.message)
  return summary(unwrap({ data, error }) as Row)
}

export async function archiveCanvasTemplate(userId: string, accountId: string, id: string, expectedVersion: string): Promise<void> {
  const rows: { id: string }[] = unwrap(await db().from('canvas_templates').update({ archived_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', userId).eq('account_id', accountId).eq('updated_at', expectedVersion)
    .is('archived_at', null).select('id'))
  if (rows.length !== 1) throw new CanvasTemplateError('conflict')
}
