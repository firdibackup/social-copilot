import 'server-only'
import { randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ReferenceLabel } from './brand-options'
import type { DesignStyleId } from './design-styles'
import { describeError } from './errors'
import { isUuid } from './params'
import { toReferenceDataUrl } from './slide-image'
import { db, unwrap } from './supabase'
import { cleanStyles, type DesignTemplate, type PoolTemplate, type TemplateStatus } from './template-options'

const BUCKET = 'templates'
const VIEW_URL_TTL_SECONDS = 60 * 60
/** The fixed example files from before Admin › Template; imported once with their key as source_key. */
const LEGACY_DIR = join(process.cwd(), 'assets', 'contoh-desain')
const LEGACY_KEY = /^[a-z0-9-]{1,60}$/

/** A refusal the admin can act on. */
export class TemplateError extends Error {
  override name = 'TemplateError'
}

interface TemplateRow {
  id: string
  storage_path: string
  source_key: string | null
  styles: string[]
  label: ReferenceLabel | null
  note: string
  status: TemplateStatus
  error: string | null
  active: boolean
  created_at: string
}

const COLUMNS = 'id, storage_path, source_key, styles, label, note, status, error, active, created_at'

const bucket = () => db().storage.from(BUCKET)

/** Signed URLs carry a token: never log them. */
async function signUrls(paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map()
  const { data, error } = await bucket().createSignedUrls(paths, VIEW_URL_TTL_SECONDS)
  if (error) throw new Error(`Supabase Storage: ${error.message}`)
  return new Map(data.map((item) => [item.path ?? '', item.signedUrl ?? '']))
}

/** Every template, newest first, with a URL to show it. */
export async function listTemplates(): Promise<DesignTemplate[]> {
  const rows: TemplateRow[] = unwrap(
    await db().from('design_templates').select(COLUMNS).order('created_at', { ascending: false }),
  )
  const urls = await signUrls(rows.map((row) => row.storage_path))
  return rows.map((row) => ({
    id: row.id,
    sourceKey: row.source_key,
    styles: cleanStyles(row.styles),
    label: row.label,
    note: row.note,
    status: row.status,
    error: row.error,
    active: row.active,
    createdAt: new Date(row.created_at),
    url: urls.get(row.storage_path) ?? '',
  }))
}

async function removeFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  const removal = await bucket().remove(paths)
  if (removal.error) console.error('[template] file tertinggal di Storage:', describeError(removal.error))
}

/** A new template waiting for its analysis. `bytes` is a JPEG. */
export async function addTemplate(adminId: string, bytes: Uint8Array, sourceKey: string | null = null): Promise<string> {
  const path = `${randomUUID()}.jpg`
  const uploaded = await bucket().upload(path, bytes, {
    contentType: 'image/jpeg',
  })
  if (uploaded.error) throw new Error(`Supabase Storage: ${uploaded.error.message}`)
  const inserted = await db()
    .from('design_templates')
    .insert({ storage_path: path, source_key: sourceKey, created_by: adminId })
    .select('id')
    .single()
  if (inserted.error) {
    await removeFiles([path])
    throw new Error(`Supabase: ${inserted.error.message}`)
  }
  return (inserted.data as { id: string }).id
}

/**
 * Imports the files of assets/contoh-desain that aren't templates yet, as pending templates keeping their key, so
 * slides planned with the old keys still find them. Returns how many were added.
 */
export async function importLegacyTemplates(adminId: string): Promise<number> {
  let files: string[]
  try {
    files = await readdir(LEGACY_DIR)
  } catch {
    throw new TemplateError('Folder assets/contoh-desain tidak ditemukan di server.')
  }
  const keys = files
    .filter((file) => file.endsWith('.jpg'))
    .map((file) => file.slice(0, -4))
    .filter((key) => LEGACY_KEY.test(key))
  if (keys.length === 0) return 0
  const existing: { source_key: string }[] = unwrap(
    await db().from('design_templates').select('source_key').in('source_key', keys),
  )
  const known = new Set(existing.map((row) => row.source_key))
  let added = 0
  for (const key of keys) {
    if (known.has(key)) continue
    await addTemplate(adminId, new Uint8Array(await readFile(join(LEGACY_DIR, `${key}.jpg`))), key)
    added += 1
  }
  return added
}

/** The ids of templates to analyse: the given ones, or every pending one. */
export async function listTemplatesToAnalyze(ids: string[] | null): Promise<string[]> {
  let query = db().from('design_templates').select('id').order('created_at')
  query = ids ? query.in('id', ids) : query.eq('status', 'pending')
  const rows: { id: string }[] = unwrap(await query)
  return rows.map((row) => row.id)
}

/** A template's image, small enough for the 1 MB request, as a data URL. */
async function loadTemplateDataUrl(path: string): Promise<string> {
  const { data, error } = await bucket().download(path)
  if (error) throw new Error(`Supabase Storage: ${error.message}`)
  return toReferenceDataUrl(new Uint8Array(await data.arrayBuffer()))
}

/** The templates' images for an analysis. */
export async function loadTemplateImages(ids: string[]): Promise<{ id: string; dataUrl: string }[]> {
  if (ids.length === 0) return []
  const rows: { id: string; storage_path: string }[] = unwrap(
    await db().from('design_templates').select('id, storage_path').in('id', ids),
  )
  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      dataUrl: await loadTemplateDataUrl(row.storage_path),
    })),
  )
}

const now = () => new Date().toISOString()

export async function saveTemplateAnalysis(
  id: string,
  analysis: { styles: DesignStyleId[]; label: ReferenceLabel; note: string },
): Promise<void> {
  unwrap(
    await db()
      .from('design_templates')
      .update({
        ...analysis,
        status: 'ready',
        error: null,
        analyzed_at: now(),
        updated_at: now(),
      })
      .eq('id', id),
  )
}

export async function failTemplateAnalysis(ids: string[], message: string): Promise<void> {
  if (ids.length === 0) return
  unwrap(
    await db()
      .from('design_templates')
      .update({
        status: 'failed',
        error: message.slice(0, 300),
        analyzed_at: now(),
        updated_at: now(),
      })
      .in('id', ids),
  )
}

/** The admin's own styles and label: the template is ready whatever the AI said. */
export async function updateTemplate(id: string, fields: { styles: DesignStyleId[]; label: ReferenceLabel }): Promise<void> {
  unwrap(
    await db()
      .from('design_templates')
      .update({ ...fields, status: 'ready', error: null, updated_at: now() })
      .eq('id', id),
  )
}

export async function setTemplateActive(id: string, active: boolean): Promise<void> {
  unwrap(await db().from('design_templates').update({ active, updated_at: now() }).eq('id', id))
}

/** Slides that follow it later go without a template. */
export async function deleteTemplate(id: string): Promise<void> {
  const rows: { storage_path: string }[] = unwrap(
    await db().from('design_templates').delete().eq('id', id).select('storage_path'),
  )
  await removeFiles(rows.map((row) => row.storage_path))
}

/** The active, analysed templates of a design style. */
export async function listTemplatePool(style: DesignStyleId): Promise<PoolTemplate[]> {
  const rows: { id: string; label: ReferenceLabel }[] = unwrap(
    await db().from('design_templates').select('id, label').eq('status', 'ready').eq('active', true).contains('styles', [style]),
  )
  return rows.map(({ id, label }) => ({ id, label }))
}

/**
 * A slide's template as a small data URL, by its id, or by the key of an imported file for a slide planned before
 * the import. Null when it no longer exists; a deactivated template still serves the slides that chose it.
 */
export async function loadTemplateImage(idOrKey: string): Promise<string | null> {
  const column = isUuid(idOrKey) ? 'id' : LEGACY_KEY.test(idOrKey) ? 'source_key' : null
  if (!column) return null
  const row: { storage_path: string } | null = unwrap(
    await db().from('design_templates').select('storage_path').eq(column, idOrKey).maybeSingle(),
  )
  return row ? loadTemplateDataUrl(row.storage_path) : null
}
