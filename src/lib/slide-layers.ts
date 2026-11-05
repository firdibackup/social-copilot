import 'server-only'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { deleteAsset } from './assets'
import { migrateLayerDoc, parseDesignDoc, type DesignDoc } from './design-doc'
import { describeError } from './errors'
import { parseLayerDoc, type LayerDoc } from './layer-doc'
import { db, unwrap } from './supabase'

/** The raise codes of the slide_layers SQL functions. */
export type LayerErrorCode =
  | 'post_locked'
  | 'invalid_media'
  | 'slide_not_found'
  | 'layers_not_found'
  | 'original_missing'
  | 'layers_exist'
  | 'generation_cancelled'
  | 'conflict'
  | 'invalid_document'

const CODES: ReadonlySet<string> = new Set<LayerErrorCode>([
  'post_locked', 'invalid_media', 'slide_not_found', 'layers_not_found', 'original_missing', 'layers_exist',
  'generation_cancelled',
  'conflict', 'invalid_document',
])

/** A refusal from the slide_layers functions; the action turns `code` into a message for the owner. */
export class LayerError extends Error {
  override name = 'LayerError'
  constructor(readonly code: LayerErrorCode) { super(code) }
}

/** Turns a `raise exception` code into a LayerError; anything else stays a database error. */
function check(error: { message: string } | null): void {
  if (!error) return
  throw CODES.has(error.message) ? new LayerError(error.message as LayerErrorCode) : new Error(`Supabase: ${error.message}`)
}

const idList = (data: unknown): string[] => (Array.isArray(data) ? data.filter((id): id is string => typeof id === 'string') : [])

export interface SlideLayers {
  /** Null when invalid: callers must refuse editing rather than replace it with an empty document. */
  doc: LayerDoc | null
  design: DesignDoc | null
  version: string
  baseAssetId: string
  originalAssetId: string | null
}

/** The layer document of one of the user's slide images, or null for a flat slide. */
export async function getSlideLayers(userId: string, assetId: string): Promise<SlideLayers | null> {
  const row = unwrap(
    await db().from('slide_layers').select('doc, design_doc, base_asset_id, original_asset_id, updated_at')
      .eq('asset_id', assetId).eq('user_id', userId).maybeSingle(),
  ) as { doc: unknown; design_doc: unknown; base_asset_id: string; original_asset_id: string | null; updated_at: string } | null
  if (!row) return null
  const parsed = parseLayerDoc(row.doc)
  const doc = 'doc' in parsed ? parsed.doc : null
  const design = row.design_doc == null ? null : parseDesignDoc(row.design_doc)
  // Until the node editor owns saves, a richer document must never be overwritten from its legacy projection.
  const compatible = !design || ('doc' in design && doc !== null
    && isDeepStrictEqual(design.doc, slideDesign(doc, row.original_asset_id ?? row.base_asset_id, row.base_asset_id, row.original_asset_id)))
  return { doc: compatible ? doc : null,
    design: design && 'doc' in design ? design.doc : null,
    version: row.updated_at, baseAssetId: row.base_asset_id, originalAssetId: row.original_asset_id }
}

/** Reproducible v4-shaped identifiers keep migration reads and later saves attached to the same nodes. */
function designId(seed: string): string {
  const hex = createHash('sha256').update(seed).digest('hex').slice(0, 32).split('')
  hex[12] = '4'
  hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16)
  const value = hex.join('')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

export function slideDesign(doc: LayerDoc, sourceAssetId: string, baseAssetId: string, originalAssetId: string | null): DesignDoc {
  const seed = `carousely:${sourceAssetId}`
  return migrateLayerDoc(doc, { id: designId(`${seed}:doc`), pageId: designId(`${seed}:page`),
    nodeIds: [...doc.layers.map((layer) => designId(`${seed}:layer:${layer.id}`)),
      ...(originalAssetId ? [designId(`${seed}:original`)] : [])] }, baseAssetId, originalAssetId)
}

/** Natural sizes of the account's images among `ids`; others drop out. */
export async function assetSizes(
  userId: string,
  accountId: string,
  ids: string[],
): Promise<Record<string, { width: number; height: number }>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return {}
  const rows: { id: string; width: number; height: number }[] = unwrap(
    await db().from('assets').select('id, width, height').in('id', unique).eq('user_id', userId).eq('account_id', accountId),
  )
  return Object.fromEntries(rows.map((row) => [row.id, { width: row.width, height: row.height }]))
}

/** Whether every one of `ids` is the user's image. */
export async function ownsAssets(userId: string, accountId: string, ids: string[]): Promise<boolean> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return true
  const rows: { id: string }[] = unwrap(await db().from('assets').select('id').in('id', unique).eq('user_id', userId).eq('account_id', accountId))
  return rows.length === unique.length
}

/** Simpan: the slide shows `newAssetId` with `doc`. Returns the images nothing uses any more. */
export async function saveSlideLayers(
  userId: string,
  input: { postId: string; oldAssetId: string; newAssetId: string; doc: LayerDoc; design: DesignDoc; expectedVersion: string | null },
): Promise<string[]> {
  const { data, error } = await db().rpc('save_slide_design', {
    p_user_id: userId, p_post_id: input.postId, p_old_asset_id: input.oldAssetId, p_new_asset_id: input.newAssetId,
    p_doc: input.doc, p_design: input.design, p_expected_version: input.expectedVersion,
  })
  check(error)
  return idList(data)
}

/** Kembalikan ke asli. Returns the images nothing uses any more. */
export async function resetSlideLayers(userId: string, postId: string, assetId: string): Promise<string[]> {
  const { data, error } = await db().rpc('reset_slide_layers', { p_user_id: userId, p_post_id: postId, p_asset_id: assetId })
  check(error)
  return idList(data)
}

/** Lapisan ajaib's result: `doc` over `baseAssetId` for the slide image `assetId`, closing edit job `id`. */
export async function finishMagicLayers(
  userId: string,
  input: { id: string; postId: string; assetId: string; baseAssetId: string; doc: LayerDoc },
): Promise<void> {
  const { error } = await db().rpc('finish_magic_layers', {
    p_user_id: userId, p_id: input.id, p_post_id: input.postId, p_asset_id: input.assetId,
    p_base_asset_id: input.baseAssetId, p_doc: input.doc,
  })
  check(error)
}

/** Deletes images nothing uses; one that fails (or is in use after all) stays for storage cleanup. */
export async function deleteUnused(userId: string, ids: string[]): Promise<void> {
  for (const id of new Set(ids)) {
    try {
      await deleteAsset(userId, id)
    } catch (error) {
      console.error('[lapisan] gambar tak terpakai gagal dihapus:', describeError(error))
    }
  }
}
