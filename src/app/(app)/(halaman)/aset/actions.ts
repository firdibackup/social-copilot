'use server'

import { refresh } from 'next/cache'
import { aiErrorMessage } from '@/lib/ai'
import { tagAssets } from '@/lib/asset-ai'
import { isAssetCategory, parseTagInput } from '@/lib/asset-options'
import { requireAccount } from '@/lib/auth'
import {
  AssetInUseError,
  createAsset,
  createAssetGroup,
  deleteAsset,
  deleteAssetGroup,
  InvalidImageError,
  moveAssetToGroup,
  setAssetsActive,
  setAssetTags,
  updateAssetGroup,
  type Asset,
} from '@/lib/assets'
import { describeError } from '@/lib/errors'
import { isUuid } from '@/lib/params'
import { RemoteFetchError } from '@/lib/web-fetch'
import { catalogWebsiteAssets } from '@/lib/website-ai'
import { importWebsiteAssets } from '@/lib/website-import'

export type UploadResult = { asset: Asset } | { error: string }
export type AssetActionState = { error: string | null; success: string | null }
export type WebsiteImportState = AssetActionState & {
  pages: number
  imported: number
  duplicates: number
  warnings: string[]
}

const EMPTY_STATE: AssetActionState = { error: null, success: null }
const NOTHING_SELECTED: AssetActionState = { error: 'Pilih foto dulu.', success: null }
/** One library's worth (LIBRARY_LIMIT in src/lib/assets.ts). */
const MAX_SELECTED = 100
const field = (formData: FormData, name: string) => String(formData.get(name) ?? '').trim()
/** The distinct photo ids a form sends as `id`. */
const selectedIds = (formData: FormData) => [...new Set(formData.getAll('id').filter(isUuid))].slice(0, MAX_SELECTED)

/** Receives a JPEG already cropped and resized in the browser (see toInstagramJpeg), and files it under `groupId`. */
export async function uploadAsset(formData: FormData): Promise<UploadResult> {
  const { userId, accountId } = await requireAccount()
  const file = formData.get('file')
  if (!(file instanceof Blob)) return { error: 'File tidak ditemukan.' }

  let asset: Asset
  try {
    asset = await createAsset(userId, file, Number(formData.get('width')), Number(formData.get('height')), { accountId })
  } catch (error) {
    if (error instanceof InvalidImageError) return { error: error.message }
    console.error('[aset] unggah gagal:', describeError(error))
    return { error: 'Foto gagal disimpan. Periksa koneksi Supabase.' }
  }

  const groupId = formData.get('groupId')
  if (!isUuid(groupId)) return { asset }
  try {
    if (await moveAssetToGroup(userId, accountId, asset.id, groupId)) return { asset: { ...asset, groupId } }
  } catch (error) {
    // The photo is saved; it only stays outside the product, where the owner sees it and can move it.
    console.error('[aset] foto gagal dimasukkan ke produk:', describeError(error))
  }
  return { asset }
}

export async function deleteAssetsAction(_previous: AssetActionState, formData: FormData): Promise<AssetActionState> {
  const { userId } = await requireAccount()
  const ids = selectedIds(formData)
  if (ids.length === 0) return NOTHING_SELECTED

  let deleted = 0
  let inUse = 0
  let failed = false
  for (const id of ids) {
    try {
      await deleteAsset(userId, id)
      deleted += 1
    } catch (error) {
      if (error instanceof AssetInUseError) {
        inUse += 1
        continue
      }
      console.error('[aset] hapus gagal:', describeError(error))
      failed = true
      break
    }
  }
  if (deleted > 0) refresh()
  const done = deleted > 0 ? `${deleted} foto dihapus. ` : ''
  if (failed) return { ...EMPTY_STATE, error: `${done}Foto lainnya gagal dihapus. Coba lagi.` }
  if (inUse > 0) return { ...EMPTY_STATE, error: `${done}${inUse} foto masih dipakai di post dan tidak dihapus.` }
  return { error: null, success: `${deleted} foto dihapus.` }
}

export async function importWebsiteAction(
  _previous: WebsiteImportState,
  formData: FormData,
): Promise<WebsiteImportState> {
  const { userId, accountId } = await requireAccount()
  const url = field(formData, 'url')
  if (!url) return { error: 'Isi alamat website dulu.', success: null, pages: 0, imported: 0, duplicates: 0, warnings: [] }

  let imported
  try {
    imported = await importWebsiteAssets(userId, accountId, url)
  } catch (error) {
    if (error instanceof RemoteFetchError) {
      return { error: error.message, success: null, pages: 0, imported: 0, duplicates: 0, warnings: [] }
    }
    console.error('[aset] website gagal diimpor:', describeError(error))
    return { error: 'Website tidak bisa diimpor.', success: null, pages: 0, imported: 0, duplicates: 0, warnings: [] }
  }

  let catalogError: string | null = null
  if (imported.assets.length > 0) {
    try {
      await catalogWebsiteAssets(userId, accountId, imported.assets, imported.website.url)
    } catch (error) {
      console.error('[aset] katalog website gagal dibuat:', describeError(error))
      catalogError = aiErrorMessage(error)
    }
  }
  refresh()
  const summary = `${imported.website.pages.length} halaman dibaca, ${imported.imported} gambar baru disimpan${
    imported.duplicates > 0 ? `, ${imported.duplicates} duplikat dilewati` : ''
  }.`
  return {
    error: catalogError,
    success: summary,
    pages: imported.website.pages.length,
    imported: imported.imported,
    duplicates: imported.duplicates,
    warnings: imported.warnings,
  }
}

export async function createAssetGroupAction(
  _previous: AssetActionState,
  formData: FormData,
): Promise<AssetActionState> {
  const { userId, accountId } = await requireAccount()
  const category = formData.get('category')
  if (!isAssetCategory(category)) return { ...EMPTY_STATE, error: 'Pilih jenis produk.' }

  try {
    await createAssetGroup(userId, accountId, {
      category,
      title: field(formData, 'title'),
      description: field(formData, 'description'),
      origin: 'upload',
      assetIds: [],
    })
  } catch (error) {
    console.error('[aset] produk gagal dibuat:', describeError(error))
    return { ...EMPTY_STATE, error: error instanceof Error ? error.message : 'Produk gagal ditambahkan.' }
  }
  refresh()
  return { error: null, success: 'Produk ditambahkan.' }
}

export async function updateAssetGroupAction(
  _previous: AssetActionState,
  formData: FormData,
): Promise<AssetActionState> {
  const { userId } = await requireAccount()
  const id = formData.get('id')
  const category = formData.get('category')
  if (!isUuid(id)) return { ...EMPTY_STATE, error: 'Produk tidak ditemukan.' }
  if (!isAssetCategory(category)) return { ...EMPTY_STATE, error: 'Pilih jenis produk.' }

  try {
    const updated = await updateAssetGroup(userId, id, {
      category,
      title: field(formData, 'title'),
      description: field(formData, 'description'),
    })
    if (!updated) return { ...EMPTY_STATE, error: 'Produk tidak ditemukan.' }
  } catch (error) {
    console.error('[aset] produk gagal diubah:', describeError(error))
    return { ...EMPTY_STATE, error: error instanceof Error ? error.message : 'Produk gagal diubah.' }
  }
  refresh()
  return { error: null, success: 'Perubahan disimpan.' }
}

export async function deleteAssetGroupAction(
  _previous: AssetActionState,
  formData: FormData,
): Promise<AssetActionState> {
  const { userId } = await requireAccount()
  const id = formData.get('id')
  if (!isUuid(id)) return { ...EMPTY_STATE, error: 'Produk tidak ditemukan.' }
  try {
    if (!(await deleteAssetGroup(userId, id))) return { ...EMPTY_STATE, error: 'Produk tidak ditemukan.' }
  } catch (error) {
    console.error('[aset] produk gagal dihapus:', describeError(error))
    return { ...EMPTY_STATE, error: 'Produk gagal dihapus.' }
  }
  refresh()
  return { error: null, success: 'Produk dihapus. Fotonya tetap tersimpan.' }
}

/** Files the selected photos under `groupId`, or outside every product when it is empty. */
export async function moveAssetsAction(_previous: AssetActionState, formData: FormData): Promise<AssetActionState> {
  const { userId, accountId } = await requireAccount()
  const ids = selectedIds(formData)
  const rawGroupId = formData.get('groupId')
  if (ids.length === 0) return NOTHING_SELECTED
  if (typeof rawGroupId !== 'string' || (rawGroupId !== '' && !isUuid(rawGroupId))) {
    return { ...EMPTY_STATE, error: 'Produk tidak ditemukan.' }
  }
  const groupId = rawGroupId === '' ? null : rawGroupId

  let moved = 0
  let failed = false
  try {
    // ponytail: one call per photo keeps move_asset_to_group's locking; a set-based function if bulk moves get slow.
    for (const id of ids) if (await moveAssetToGroup(userId, accountId, id, groupId)) moved += 1
  } catch (error) {
    console.error('[aset] foto gagal dipindahkan:', describeError(error))
    failed = true
  }
  if (moved > 0) refresh()
  if (failed) return { ...EMPTY_STATE, error: moved > 0 ? `${moved} foto dipindahkan, sisanya gagal.` : 'Foto gagal dipindahkan.' }
  if (moved === 0) return { ...EMPTY_STATE, error: 'Foto atau produk tidak ditemukan.' }
  return { error: null, success: groupId ? `${moved} foto dimasukkan ke produk.` : `${moved} foto dikeluarkan dari produk.` }
}

export async function setAssetActiveAction(
  _previous: AssetActionState,
  formData: FormData,
): Promise<AssetActionState> {
  const { userId } = await requireAccount()
  const ids = selectedIds(formData)
  if (ids.length === 0) return NOTHING_SELECTED
  const active = formData.get('active') === 'true'

  try {
    if ((await setAssetsActive(userId, ids, active)) === 0) return { ...EMPTY_STATE, error: 'Foto tidak ditemukan.' }
  } catch (error) {
    console.error('[aset] status foto gagal diubah:', describeError(error))
    return { ...EMPTY_STATE, error: 'Status foto gagal diubah.' }
  }
  refresh()
  return { error: null, success: active ? 'Foto diaktifkan.' : 'Foto dijeda.' }
}

export async function updateAssetTagsAction(
  _previous: AssetActionState,
  formData: FormData,
): Promise<AssetActionState> {
  const { userId } = await requireAccount()
  const id = formData.get('id')
  if (!isUuid(id)) return { ...EMPTY_STATE, error: 'Foto tidak ditemukan.' }
  const parsed = parseTagInput(field(formData, 'tags'))
  if ('error' in parsed) return { ...EMPTY_STATE, error: parsed.error }

  try {
    if (!(await setAssetTags(userId, id, parsed.tags))) return { ...EMPTY_STATE, error: 'Foto tidak ditemukan.' }
  } catch (error) {
    console.error('[aset] tag gagal disimpan:', describeError(error))
    return { ...EMPTY_STATE, error: 'Tag gagal disimpan.' }
  }
  refresh()
  return { error: null, success: 'Tag disimpan.' }
}

/** AI tags for the selected photos, charged per photo; the earlier batches stay saved when a later one fails. */
export async function tagAssetsAction(_previous: AssetActionState, formData: FormData): Promise<AssetActionState> {
  const { userId, accountId } = await requireAccount()
  const ids = selectedIds(formData)
  if (ids.length === 0) return NOTHING_SELECTED

  let tagged: number
  try {
    tagged = await tagAssets(userId, accountId, ids)
  } catch (error) {
    console.error('[aset] tag AI gagal:', describeError(error))
    refresh()
    return { ...EMPTY_STATE, error: aiErrorMessage(error) }
  }
  refresh()
  if (tagged === 0) return { ...EMPTY_STATE, error: 'Foto tidak ditemukan. Hasil AI tidak diberi tag.' }
  return { error: null, success: `Tag dibuat untuk ${tagged} foto.` }
}
