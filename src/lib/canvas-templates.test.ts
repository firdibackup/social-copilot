import { beforeEach, expect, it, vi } from 'vitest'
import { queryMock, filtered } from '@/test/query-mock'
import { archiveCanvasTemplate, getCanvasTemplate, listCanvasTemplates, saveCanvasTemplate } from './canvas-templates'
import { migrateLayerDoc } from './design-doc'
import { ownsAssets } from './slide-layers'
import { db } from './supabase'

vi.mock('./supabase', () => ({ db: vi.fn(), unwrap: (result: { data: unknown; error: { message: string } | null }) => {
  if (result.error) throw new Error(result.error.message)
  return result.data
} }))
vi.mock('./slide-layers', () => ({ ownsAssets: vi.fn() }))
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const doc = migrateLayerDoc({ v: 1, width: 1080, height: 1350, layers: [] }, { id: id(1), pageId: id(2), nodeIds: [] }, id(3))
const row = { id: id(1), name: 'Contoh', preview_asset_id: id(4), updated_at: '2026-11-05T00:00:00Z', page_count: 1 }
beforeEach(() => { vi.clearAllMocks(); vi.mocked(ownsAssets).mockResolvedValue(true) })

it('scopes listing and loading to the active account, omitting archives', async () => {
  const list = queryMock({ data: [row], error: null })
  vi.mocked(db).mockReturnValue(list.query as never)
  expect(await listCanvasTemplates('user', 'account')).toEqual([{ id: id(1), name: 'Contoh', previewAssetId: id(4), version: row.updated_at, pages: 1 }])
  expect(filtered(list.calls, 'user_id', 'user')).toBe(true)
  expect(filtered(list.calls, 'account_id', 'account')).toBe(true)
  expect(list.calls).toContainEqual(['is', 'archived_at', null])
  const load = queryMock({ data: { ...row, doc: { invalid: true } }, error: null })
  vi.mocked(db).mockReturnValue(load.query as never)
  await expect(getCanvasTemplate('user', 'account', id(1))).rejects.toMatchObject({ code: 'invalid_document' })
  expect(filtered(load.calls, 'account_id', 'account')).toBe(true)
})

it('checks all document and preview assets, then forwards the exact version to the atomic save', async () => {
  const mock = queryMock({ data: row, error: null })
  vi.mocked(db).mockReturnValue(mock.query as never)
  const input = { id: id(1), name: ' Contoh ', doc, previewAssetId: id(4), expectedVersion: row.updated_at }
  await saveCanvasTemplate('user', 'account', input)
  expect(ownsAssets).toHaveBeenCalledWith('user', 'account', [id(3), id(4)])
  expect(mock.calls).toContainEqual(['rpc', 'save_canvas_template', expect.objectContaining({ p_name: 'Contoh', p_expected_version: row.updated_at })])
  vi.mocked(ownsAssets).mockResolvedValue(false)
  await expect(saveCanvasTemplate('user', 'account', input)).rejects.toMatchObject({ code: 'invalid_media' })
  expect(mock.query.rpc).toHaveBeenCalledTimes(1)
})

it('returns version conflicts without retrying over another edit', async () => {
  const mock = queryMock({ data: null, error: { message: 'conflict' } })
  vi.mocked(db).mockReturnValue(mock.query as never)
  await expect(saveCanvasTemplate('user', 'account', { id: id(1), name: 'Contoh', doc, previewAssetId: null, expectedVersion: row.updated_at }))
    .rejects.toMatchObject({ code: 'conflict' })
  expect(mock.query.rpc).toHaveBeenCalledTimes(1)
})

it('archives only the active account and expected version, reporting a stale or missing row', async () => {
  const mock = queryMock({ data: [], error: null })
  vi.mocked(db).mockReturnValue(mock.query as never)
  await expect(archiveCanvasTemplate('user', 'account', id(1), row.updated_at)).rejects.toMatchObject({ code: 'conflict' })
  expect(filtered(mock.calls, 'user_id', 'user')).toBe(true)
  expect(filtered(mock.calls, 'account_id', 'account')).toBe(true)
  expect(filtered(mock.calls, 'updated_at', row.updated_at)).toBe(true)
})
