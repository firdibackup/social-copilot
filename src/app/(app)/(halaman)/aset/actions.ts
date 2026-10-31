'use server'

import { getUserLocale } from '@/i18n/locale'
import { getTranslations } from 'next-intl/server'

import { localizeLibraryMessage } from '../brand/localized-errors'
import { refresh } from 'next/cache'
import { aiErrorMessage } from '@/lib/ai'
import { tagAssets } from '@/lib/asset-ai'
import { isAssetCategory, parseTagInput, MAX_ASSET_TAGS, TAG_MAX_LENGTH } from '@/lib/asset-options'
import { requireAccount } from '@/lib/auth'
import {
  AssetInUseError,
  createAsset,
  createAssetGroup,
  deleteAsset,
  deleteAssetGroup,
  InvalidImageError,
  loadAssetsByIds,
  moveAssetToGroup,
  setAssetsActive,
  setAssetTags,
  updateAssetGroup,
  type Asset,
} from '@/lib/assets'
import { describeError } from '@/lib/errors'
import { isUuid } from '@/lib/params'
import { FileTooLargeError, listCleanupCandidates, StorageFullError } from '@/lib/storage-quota'
import { storageFullMessage, fileTooLargeMessage } from '@/lib/storage-quota-options'
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
/** One library's worth (LIBRARY_LIMIT in src/lib/assets.ts). */
const MAX_SELECTED = 100
const field = (formData: FormData, name: string) => String(formData.get(name) ?? '').trim()
/** The distinct photo ids a form sends as `id`. */
const selectedIds = (formData: FormData) => [...new Set(formData.getAll('id').filter(isUuid))].slice(0, MAX_SELECTED)

/** Receives a JPEG already cropped and resized in the browser (see toInstagramJpeg), and files it under `groupId`. */
export async function uploadAsset(formData: FormData): Promise<UploadResult> {
  const t = await getTranslations('assets')
  const { userId, accountId } = await requireAccount()
  const file = formData.get('file')
  if (!(file instanceof Blob)) return { error: t('actions.text1') }

  let asset: Asset
  try {
    asset = await createAsset(userId, file, Number(formData.get('width')), Number(formData.get('height')), { accountId, locale: await getUserLocale() })
  } catch (error) {
    if (error instanceof StorageFullError) return { error: storageFullMessage(await getUserLocale()) }
    if (error instanceof FileTooLargeError) return { error: fileTooLargeMessage(await getUserLocale()) }
    if (error instanceof InvalidImageError) return { error: localizeLibraryMessage(error.message, await getUserLocale()) }
    console.error('[aset] unggah gagal:', describeError(error))
    return { error: t('actions.text2') }
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

/**
 * AI images no post, thread or slide uses, oldest first, loaded here because the library only holds the newest ones.
 * Across all the user's accounts: the quota is per user.
 */
export async function storageCleanupAction(): Promise<{ assets: Asset[] } | { error: string }> {
  const t = await getTranslations('assets')
  const { userId } = await requireAccount()
  try {
    return { assets: await loadAssetsByIds(userId, await listCleanupCandidates(userId)) }
  } catch (error) {
    console.error('[aset] saran pembersihan gagal:', describeError(error))
    return { error: t('actions.text3') }
  }
}

export async function deleteAssetsAction(_previous: AssetActionState, formData: FormData): Promise<AssetActionState> {
  const t = await getTranslations('assets')
  const { userId } = await requireAccount()
  const ids = selectedIds(formData)
  if (ids.length === 0) return { error: t('actions.nothingSelected'), success: null }

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
  const done = deleted > 0 ? t('actions.text4', { v0: deleted }) : ''
  if (failed) return { ...EMPTY_STATE, error: t('actions.text5', { v0: done }) }
  if (inUse > 0) return { ...EMPTY_STATE, error: t('actions.text6', { v0: done, v1: inUse }) }
  return { error: null, success: t('actions.text7', { v0: deleted }) }
}

export async function importWebsiteAction(
  _previous: WebsiteImportState,
  formData: FormData,
): Promise<WebsiteImportState> {
  const t = await getTranslations('assets')
  const { userId, accountId } = await requireAccount()
  const url = field(formData, 'url')
  if (!url) return { error: t('actions.text8'), success: null, pages: 0, imported: 0, duplicates: 0, warnings: [] }

  let imported
  try {
    imported = await importWebsiteAssets(userId, accountId, url)
  } catch (error) {
    if (error instanceof RemoteFetchError) {
      return { error: localizeLibraryMessage(error.message, await getUserLocale()), success: null, pages: 0, imported: 0, duplicates: 0, warnings: [] }
    }
    console.error('[aset] website gagal diimpor:', describeError(error))
    return { error: t('actions.text9'), success: null, pages: 0, imported: 0, duplicates: 0, warnings: [] }
  }

  let catalogError: string | null = null
  if (imported.assets.length > 0) {
    try {
      await catalogWebsiteAssets(userId, accountId, imported.assets, imported.website.url, await getUserLocale())
    } catch (error) {
      console.error('[aset] katalog website gagal dibuat:', describeError(error))
      catalogError = localizeLibraryMessage(aiErrorMessage(error), await getUserLocale())
    }
  }
  refresh()
  const locale = await getUserLocale()
  const summary = t('actions.text10', { v0: imported.website.pages.length, v1: imported.imported, v2: imported.duplicates > 0 ? t('actions.duplicates', { count: imported.duplicates }) : '' })
  return {
    error: catalogError,
    success: summary,
    pages: imported.website.pages.length,
    imported: imported.imported,
    duplicates: imported.duplicates,
    warnings: imported.warnings.map((message) => localizeLibraryMessage(message, locale)),
  }
}

export async function createAssetGroupAction(
  _previous: AssetActionState,
  formData: FormData,
): Promise<AssetActionState> {
  const t = await getTranslations('assets')
  const { userId, accountId } = await requireAccount()
  const category = formData.get('category')
  if (!isAssetCategory(category)) return { ...EMPTY_STATE, error: t('actions.text11') }

  try {
    await createAssetGroup(userId, accountId, {
      category,
      title: field(formData, 'title'),
      description: field(formData, 'description'),
      origin: 'upload',
      assetIds: [],
    }, await getUserLocale())
  } catch (error) {
    console.error('[aset] produk gagal dibuat:', describeError(error))
    return { ...EMPTY_STATE, error: error instanceof Error ? localizeLibraryMessage(error.message, await getUserLocale()) : t('actions.text12') }
  }
  refresh()
  return { error: null, success: t('actions.text13') }
}

export async function updateAssetGroupAction(
  _previous: AssetActionState,
  formData: FormData,
): Promise<AssetActionState> {
  const t = await getTranslations('assets')
  const { userId } = await requireAccount()
  const id = formData.get('id')
  const category = formData.get('category')
  if (!isUuid(id)) return { ...EMPTY_STATE, error: t('actions.text14') }
  if (!isAssetCategory(category)) return { ...EMPTY_STATE, error: t('actions.text11') }

  try {
    const updated = await updateAssetGroup(userId, id, {
      category,
      title: field(formData, 'title'),
      description: field(formData, 'description'),
    }, await getUserLocale())
    if (!updated) return { ...EMPTY_STATE, error: t('actions.text14') }
  } catch (error) {
    console.error('[aset] produk gagal diubah:', describeError(error))
    return { ...EMPTY_STATE, error: error instanceof Error ? localizeLibraryMessage(error.message, await getUserLocale()) : t('actions.text15') }
  }
  refresh()
  return { error: null, success: t('actions.text16') }
}

export async function deleteAssetGroupAction(
  _previous: AssetActionState,
  formData: FormData,
): Promise<AssetActionState> {
  const t = await getTranslations('assets')
  const { userId } = await requireAccount()
  const id = formData.get('id')
  if (!isUuid(id)) return { ...EMPTY_STATE, error: t('actions.text14') }
  try {
    if (!(await deleteAssetGroup(userId, id))) return { ...EMPTY_STATE, error: t('actions.text14') }
  } catch (error) {
    console.error('[aset] produk gagal dihapus:', describeError(error))
    return { ...EMPTY_STATE, error: t('actions.text17') }
  }
  refresh()
  return { error: null, success: t('actions.text18') }
}

/** Files the selected photos under `groupId`, or outside every product when it is empty. */
export async function moveAssetsAction(_previous: AssetActionState, formData: FormData): Promise<AssetActionState> {
  const t = await getTranslations('assets')
  const { userId, accountId } = await requireAccount()
  const ids = selectedIds(formData)
  const rawGroupId = formData.get('groupId')
  if (ids.length === 0) return { error: t('actions.nothingSelected'), success: null }
  if (typeof rawGroupId !== 'string' || (rawGroupId !== '' && !isUuid(rawGroupId))) {
    return { ...EMPTY_STATE, error: t('actions.text14') }
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
  if (failed) return { ...EMPTY_STATE, error: moved > 0 ? t('actions.text19', { v0: moved }) : t('actions.text20') }
  if (moved === 0) return { ...EMPTY_STATE, error: t('actions.text21') }
  return { error: null, success: groupId ? t('actions.text22', { v0: moved }) : t('actions.text23', { v0: moved }) }
}

export async function setAssetActiveAction(
  _previous: AssetActionState,
  formData: FormData,
): Promise<AssetActionState> {
  const t = await getTranslations('assets')
  const { userId } = await requireAccount()
  const ids = selectedIds(formData)
  if (ids.length === 0) return { error: t('actions.nothingSelected'), success: null }
  const active = formData.get('active') === 'true'

  try {
    if ((await setAssetsActive(userId, ids, active)) === 0) return { ...EMPTY_STATE, error: t('actions.text24') }
  } catch (error) {
    console.error('[aset] status foto gagal diubah:', describeError(error))
    return { ...EMPTY_STATE, error: t('actions.text25') }
  }
  refresh()
  return { error: null, success: active ? t('actions.text26') : t('actions.text27') }
}

export async function updateAssetTagsAction(
  _previous: AssetActionState,
  formData: FormData,
): Promise<AssetActionState> {
  const t = await getTranslations('assets')
  const { userId } = await requireAccount()
  const id = formData.get('id')
  if (!isUuid(id)) return { ...EMPTY_STATE, error: t('actions.text24') }
  const parsed = parseTagInput(field(formData, 'tags'))
  if ('error' in parsed) return { ...EMPTY_STATE, error: parsed.error.startsWith('Satu tag') ? t('actions.tagLength', { limit: TAG_MAX_LENGTH }) : t('actions.tagCount', { limit: MAX_ASSET_TAGS }) }

  try {
    if (!(await setAssetTags(userId, id, parsed.tags))) return { ...EMPTY_STATE, error: t('actions.text24') }
  } catch (error) {
    console.error('[aset] tag gagal disimpan:', describeError(error))
    return { ...EMPTY_STATE, error: t('actions.text28') }
  }
  refresh()
  return { error: null, success: t('actions.text29') }
}

/** AI tags for the selected photos, charged per photo; the earlier batches stay saved when a later one fails. */
export async function tagAssetsAction(_previous: AssetActionState, formData: FormData): Promise<AssetActionState> {
  const t = await getTranslations('assets')
  const { userId, accountId } = await requireAccount()
  const ids = selectedIds(formData)
  if (ids.length === 0) return { error: t('actions.nothingSelected'), success: null }

  let tagged: number
  try {
    tagged = await tagAssets(userId, accountId, ids, await getUserLocale())
  } catch (error) {
    console.error('[aset] tag AI gagal:', describeError(error))
    refresh()
    return { ...EMPTY_STATE, error: localizeLibraryMessage(aiErrorMessage(error), await getUserLocale()) }
  }
  refresh()
  if (tagged === 0) return { ...EMPTY_STATE, error: t('actions.text30') }
  return { error: null, success: t('actions.text31', { v0: tagged }) }
}
