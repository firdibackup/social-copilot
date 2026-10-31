'use server'

import { getUserLocale } from '@/i18n/locale'
import { getTranslations } from 'next-intl/server'

import { localizeLibraryMessage } from './localized-errors'
import { refresh } from 'next/cache'
import { aiErrorMessage } from '@/lib/ai'
import { listActiveWebsiteAssets } from '@/lib/assets'
import { requireAccount, type AccountScope } from '@/lib/auth'
import {
  addReference,
  deleteReference,
  loadLogoBytes,
  loadLogoImage,
  loadVisualReferences,
  ReferenceLimitError,
  getBrandContext,
  removeLogo,
  saveBrandKit,
  saveStrategy,
  setLogo,
  setReferenceImageLabel,
  updateReference,
  VISUAL_BODY_BUDGET,
  type ReferencePatch,
} from '@/lib/brand'
import { analyzeProfile, analyzeStrategy, analyzeVisual, type ProfileDraft, type ProfileSources } from '@/lib/brand-ai'
import {
  DESCRIPTION_MAX_LENGTH,
  lengthOf,
  MAX_GROUP_IMAGES,
  NOTE_MAX_LENGTH,
  parseBrandFields,
  parsePalette,
  REFERENCE_LABELS,
  type ReferenceLabel,
  type ReferenceSource,
} from '@/lib/brand-options'
import { getValidAccessToken, markNeedsReconnect, NeedsReconnectError } from '@/lib/connection'
import { describeError } from '@/lib/errors'
import { imageType, isJpeg, MAX_IMAGE_BYTES } from '@/lib/image'
import { paletteFromBytes } from '@/lib/image-palette'
import { toReferenceDataUrl } from '@/lib/slide-image'
import { FileTooLargeError, StorageFullError } from '@/lib/storage-quota'
import { storageFullMessage, fileTooLargeMessage } from '@/lib/storage-quota-options'
import { classifyDesigns } from '@/lib/template-ai'
import { fetchOwnProfile, fetchRecentMedia, InstagramApiError, type InstagramPost } from '@/lib/instagram'
import { isUuid } from '@/lib/params'
import { fetchImage, RemoteFetchError } from '@/lib/web-fetch'
import { readWebsite } from '@/lib/website'
import { parseStrategy, type ContentStrategy } from '@/lib/strategy-options'

/** Each action returns a message for the owner, or null when it worked. */
type ActionError = string | null

const POSTS_LIMIT = 24
const CAPTION_SAMPLES = 12
const MAX_IMPORT = 12
const URL_MAX_LENGTH = 2000
const LABEL_MAX_LENGTH = 200


type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

/** Owner-facing text for a failed call on the connected account. */
async function instagramErrorMessage(userId: string, error: unknown, context: string): Promise<string> {
  const t = await getTranslations('brand')
  if (error instanceof NeedsReconnectError) return t('shared.reconnect')
  if (error instanceof InstagramApiError && error.isInvalidToken) {
    await markNeedsReconnect(userId)
    return t('shared.reconnect')
  }
  console.error(`[brand] ${context}:`, describeError(error))
  return error instanceof InstagramApiError
    ? t('actions.text1', { v0: localizeLibraryMessage(error.message, await getUserLocale()) })
    : t('actions.text2')
}

export async function saveBrandAction(input: unknown): Promise<ActionError> {
  const t = await getTranslations('brand')
  const { userId, accountId } = await requireAccount()
  const parsed = parseBrandFields(input, await getUserLocale())
  if ('error' in parsed) return parsed.error
  try {
    await saveBrandKit(userId, accountId, parsed.fields)
  } catch (error) {
    console.error('[brand] brand kit gagal disimpan:', describeError(error))
    return t('actions.text3', { v0: t('shared.database') })
  }
  refresh()
  return null
}

/** The strategy card's save, apart from the brand form. */
export async function saveStrategyAction(input: unknown): Promise<ActionError> {
  const t = await getTranslations('brand')
  const { userId, accountId } = await requireAccount()
  const parsed = parseStrategy(input, await getUserLocale())
  if ('error' in parsed) return parsed.error
  try {
    await saveStrategy(userId, accountId, parsed.strategy)
  } catch (error) {
    console.error('[brand] strategi gagal disimpan:', describeError(error))
    return t('actions.text4', { v0: t('shared.database') })
  }
  refresh()
  return null
}

export type StrategyResult = { strategy: ContentStrategy; warnings: string[] } | { error: string }

/** A strategy draft from the saved brand profile and the account's newest captions. Nothing is saved. */
export async function generateStrategyAction(): Promise<StrategyResult> {
  const t = await getTranslations('brand')
  const { userId } = await requireAccount()
  try {
    const brand = await getBrandContext(userId)
    if (!brand || !(brand.name || brand.description)) {
      return { error: t('actions.text5') }
    }
    const instagram = await readInstagram(userId)
    const recent = 'value' in instagram ? instagram.value.captions : []
    const warnings = 'warning' in instagram ? [instagram.warning] : []
    return { strategy: await analyzeStrategy(userId, { brand, recent }, { language: await getUserLocale() }), warnings }
  } catch (error) {
    console.error('[brand] strategi gagal disusun:', describeError(error))
    return { error: localizeLibraryMessage(aiErrorMessage(error), await getUserLocale()) }
  }
}

/** Colours, fonts and images the website offers, shown next to the draft for the owner to pick from. */
export interface WebsiteSuggestions {
  url: string
  colors: string[]
  fonts: string[]
  logoUrls: string[]
  imageUrls: string[]
}

export type ProfileResult = { draft: ProfileDraft; website: WebsiteSuggestions | null; warnings: string[] } | { error: string }

type Read<T> = { value: T } | { warning: string }

async function readSite(url: string): Promise<Read<Awaited<ReturnType<typeof readWebsite>>>> {
  const t = await getTranslations('brand')
  try {
    return { value: await readWebsite(url) }
  } catch (error) {
    if (error instanceof RemoteFetchError) return { warning: t('actions.text6', { v0: localizeLibraryMessage(error.message, await getUserLocale()) }) }
    console.error('[brand] website gagal dibaca:', describeError(error))
    return { warning: t('actions.text7') }
  }
}

async function readInstagram(userId: string): Promise<Read<NonNullable<ProfileSources['instagram']>>> {
  try {
    const token = await getValidAccessToken(userId)
    const [profile, posts] = await Promise.all([fetchOwnProfile(token), fetchRecentMedia(token, CAPTION_SAMPLES)])
    // Named fields only: the sources are logged, and the picture URL is signed.
    const { username, name, biography } = profile
    return { value: { username, name, biography, captions: posts.map((post) => post.caption).filter(Boolean) } }
  } catch (error) {
    return { warning: await instagramErrorMessage(userId, error, 'akun Instagram gagal dibaca') }
  }
}

/** Reads the sources and asks the AI for a profile draft. Nothing is saved: the form shows the draft. */
export async function analyzeProfileAction(websiteUrl: unknown, includeInstagram: unknown): Promise<ProfileResult> {
  const t = await getTranslations('brand')
  const { userId } = await requireAccount()
  const url = text(websiteUrl)
  if (!url && includeInstagram !== true) return { error: t('actions.text8') }

  const [site, instagram] = await Promise.all([url ? readSite(url) : null, includeInstagram === true ? readInstagram(userId) : null])
  const warnings = [site, instagram].flatMap((read) => (read && 'warning' in read ? [read.warning] : []))
  const website = site && 'value' in site ? site.value : null
  const locale = await getUserLocale()
  if (website) warnings.push(...website.warnings.map((message) => localizeLibraryMessage(message, locale)))
  const sources: ProfileSources = {
    website: website && { url: website.url, pages: website.pages },
    instagram: instagram && 'value' in instagram ? instagram.value : null,
  }
  if (!sources.website && !sources.instagram) return { error: warnings.join(' ') }

  try {
    const draft = await analyzeProfile(userId, sources, { language: locale })
    const suggestions = website && {
      url: website.url,
      colors: website.colors,
      fonts: website.fonts,
      logoUrls: website.logoUrls,
      imageUrls: website.imageUrls,
    }
    return { draft, website: suggestions, warnings }
  } catch (error) {
    console.error('[brand] analisis profil gagal:', describeError(error))
    return { error: localizeLibraryMessage(aiErrorMessage(error), await getUserLocale()) }
  }
}

/**
 * Receives JPEGs prepared in the browser (see toReferenceJpeg; one upload, or every design cut from a grid, which
 * become one group in that order) and a palette; grid cut-outs bring one label each and the layout description
 * classifyGridTilesAction gave them.
 */
export async function uploadReferenceAction(formData: FormData): Promise<ActionError> {
  const t = await getTranslations('brand')
  const { userId, accountId } = await requireAccount()
  const files = formData.getAll('file')
  if (files.length === 0) return t('actions.text9')
  if (files.length > MAX_GROUP_IMAGES) return t('actions.text10', { v0: MAX_GROUP_IMAGES })
  const images: { bytes: Uint8Array; type: 'image/jpeg' }[] = []
  for (const file of files) {
    if (!(file instanceof Blob)) return t('actions.text9')
    if (file.size === 0 || file.size > MAX_IMAGE_BYTES) return t('actions.text11')
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (!isJpeg(bytes)) return t('actions.text12')
    images.push({ bytes, type: 'image/jpeg' })
  }
  let palette: string[] = []
  try {
    palette = parsePalette(JSON.parse(String(formData.get('palette') ?? '[]'))) ?? []
  } catch {
    // A missing palette is filled in by the page later.
  }
  const labels = formData.getAll('label')
  if (!labels.every((label) => typeof label === 'string' && LABELS.has(label))) return t('actions.text13')
  const description = text(formData.get('description'))
  if (lengthOf(description) > DESCRIPTION_MAX_LENGTH) return t('actions.text14', { v0: DESCRIPTION_MAX_LENGTH })
  const fromGrid = formData.get('source') === 'grid'

  try {
    const id = await addReference(userId, accountId, {
      images,
      labels: labels.length === images.length ? (labels as ReferenceLabel[]) : undefined,
      source: 'upload',
      sourceLabel: fromGrid ? 'Potongan grid' : 'Unggahan',
      permalink: null,
      palette,
    })
    // The image is saved; a description that fails is only missing until the next visual analysis.
    if (description) {
      await updateReference(userId, id, { description }).catch((error: unknown) =>
        console.error('[brand] deskripsi potongan gagal disimpan:', describeError(error)),
      )
    }
  } catch (error) {
    if (error instanceof StorageFullError) return storageFullMessage(await getUserLocale())
    if (error instanceof FileTooLargeError) return fileTooLargeMessage(await getUserLocale())
    if (error instanceof ReferenceLimitError) return localizeLibraryMessage(error.message, await getUserLocale())
    console.error('[brand] referensi gagal disimpan:', describeError(error))
    return t('actions.text15', { v0: t('shared.database') })
  }
  refresh()
  return null
}

/** At most this many designs are sorted per click; a bigger grid is sorted in several. */
const MAX_GRID_TILES = 20

export type GridTileLabels =
  | { tiles: ({ label: ReferenceLabel; description: string } | null)[] }
  | { error: string }

/**
 * The label (Cover/Isi/CTA/Umum) and a short layout description of each design cut from a grid, in the order sent
 * as `tile` files; null for one the AI could not read. Nothing is saved: the owner checks them first.
 */
export async function classifyGridTilesAction(formData: FormData): Promise<GridTileLabels> {
  const t = await getTranslations('brand')
  const { userId } = await requireAccount()
  const files = formData.getAll('tile')
  if (files.length === 0) return { error: t('actions.text16') }
  if (files.length > MAX_GRID_TILES) return { error: t('actions.text17', { v0: MAX_GRID_TILES }) }
  const images: { id: string; dataUrl: string }[] = []
  for (const [index, file] of files.entries()) {
    if (!(file instanceof Blob) || file.size === 0 || file.size > MAX_IMAGE_BYTES) return { error: t('actions.text18') }
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (!isJpeg(bytes)) return { error: t('actions.text19') }
    images.push({ id: `tile-${index + 1}`, dataUrl: await toReferenceDataUrl(bytes) })
  }
  try {
    const read = await classifyDesigns(userId, images, await getUserLocale())
    return {
      tiles: images.map(({ id }) => {
        const analysis = read.get(id)
        return analysis ? { label: analysis.label, description: analysis.note } : null
      }),
    }
  } catch (error) {
    return { error: localizeLibraryMessage(aiErrorMessage(error), await getUserLocale()) }
  }
}

export interface PostsAccount {
  username: string
  name: string
  biography: string
  followersCount: number | null
}

export type PostsResult = { account: PostsAccount; posts: InstagramPost[] } | { error: string }

/** The connected account's newest posts, to pick references from. */
export async function listOwnPostsAction(): Promise<PostsResult> {
  const { userId } = await requireAccount()
  try {
    const token = await getValidAccessToken(userId)
    const [profile, posts] = await Promise.all([fetchOwnProfile(token), fetchRecentMedia(token, POSTS_LIMIT)])
    return { account: { ...profile, followersCount: null }, posts }
  } catch (error) {
    return { error: await instagramErrorMessage(userId, error, 'post sendiri gagal dimuat') }
  }
}

/** One post: its photo, or every slide of a carousel, becomes one reference group. */
interface ImportItem {
  imageUrls: string[]
  permalink: string | null
  source: Exclude<ReferenceSource, 'upload' | 'discovery'>
  sourceLabel: string
}

const IMPORT_SOURCES = new Set<string>(['website', 'instagram'])
const isHttpUrl = (value: string) => /^https?:\/\//i.test(value) && lengthOf(value) <= URL_MAX_LENGTH

function parseImportItem(value: unknown): ImportItem | null {
  if (!isObject(value) || !Array.isArray(value.imageUrls)) return null
  const imageUrls = value.imageUrls.map(text)
  const permalink = value.permalink === null ? null : text(value.permalink)
  const sourceLabel = text(value.sourceLabel)
  if (imageUrls.length === 0 || imageUrls.length > MAX_GROUP_IMAGES || !imageUrls.every(isHttpUrl)) return null
  if (permalink !== null && !isHttpUrl(permalink)) return null
  if (typeof value.source !== 'string' || !IMPORT_SOURCES.has(value.source)) return null
  if (lengthOf(sourceLabel) > LABEL_MAX_LENGTH || (permalink !== null && lengthOf(permalink) > 500)) return null
  return { imageUrls, permalink, source: value.source as ImportItem['source'], sourceLabel }
}

export type ImportResult = { imported: number; failed: string[] } | { error: string }

/** Downloads the chosen posts into the brand bucket, one group each. The page computes their palettes afterwards. */
export async function importReferencesAction(items: unknown): Promise<ImportResult> {
  const t = await getTranslations('brand')
  const { userId, accountId } = await requireAccount()
  const parsed = Array.isArray(items) ? items.map(parseImportItem) : []
  if (parsed.length === 0 || parsed.length > MAX_IMPORT || parsed.some((item) => item === null)) {
    return { error: t('actions.text20', { v0: MAX_IMPORT }) }
  }

  let imported = 0
  const failed: string[] = []
  for (const [index, item] of (parsed as ImportItem[]).entries()) {
    try {
      const images = []
      for (const url of item.imageUrls) images.push(await fetchImage(url))
      await addReference(userId, accountId, {
        images,
        source: item.source,
        sourceLabel: item.sourceLabel,
        permalink: item.permalink,
        palette: [],
      })
      imported += 1
    } catch (error) {
      if (error instanceof StorageFullError) return { error: storageFullMessage(await getUserLocale()) }
      if (error instanceof FileTooLargeError) failed.push(`Post ${index + 1}: ${localizeLibraryMessage(error.message, await getUserLocale())}`)
      else if (error instanceof ReferenceLimitError) {
        failed.push(localizeLibraryMessage(error.message, await getUserLocale()))
        break
      } else if (error instanceof RemoteFetchError) failed.push(`Post ${index + 1}: ${localizeLibraryMessage(error.message, await getUserLocale())}`)
      else {
        console.error('[brand] impor referensi gagal:', describeError(error))
        failed.push(t('actions.text21', { v0: index + 1, v1: t('shared.database') }))
      }
    }
  }
  if (imported > 0) refresh()
  return { imported, failed }
}

function parsePatch(value: unknown, t: Awaited<ReturnType<typeof getTranslations<'brand'>>>): ReferencePatch | string {
  if (!isObject(value)) return t('actions.text22')
  const patch: ReferencePatch = {}
  if (value.note !== undefined) {
    patch.note = text(value.note)
    if (lengthOf(patch.note) > NOTE_MAX_LENGTH) return t('actions.text23', { v0: NOTE_MAX_LENGTH })
  }
  if (value.description !== undefined) {
    patch.description = text(value.description)
    if (lengthOf(patch.description) > DESCRIPTION_MAX_LENGTH) return t('actions.text14', { v0: DESCRIPTION_MAX_LENGTH })
  }
  if (value.palette !== undefined) {
    const palette = parsePalette(value.palette)
    if (!palette) return t('actions.text24')
    patch.palette = palette
  }
  return Object.keys(patch).length > 0 ? patch : t('actions.text22')
}

/** No refresh: the card already shows what was typed, and palettes arrive in a batch the page refreshes once. */
export async function updateReferenceAction(id: unknown, changes: unknown): Promise<ActionError> {
  const t = await getTranslations('brand')
  const { userId } = await requireAccount()
  if (!isUuid(id)) return t('actions.text25')
  const patch = parsePatch(changes, t)
  if (typeof patch === 'string') return patch
  try {
    return (await updateReference(userId, id, patch)) ? null : t('actions.text25')
  } catch (error) {
    console.error('[brand] referensi gagal diubah:', describeError(error))
    return t('actions.text26', { v0: t('shared.database') })
  }
}

const LABELS = new Set<string>(Object.keys(REFERENCE_LABELS))

/** The owner's label for one slide. No refresh: the select already shows it. */
export async function setReferenceLabelAction(imageId: unknown, label: unknown): Promise<ActionError> {
  const t = await getTranslations('brand')
  const { userId } = await requireAccount()
  if (!isUuid(imageId)) return t('actions.text27')
  if (typeof label !== 'string' || !LABELS.has(label)) return t('actions.text13')
  try {
    return (await setReferenceImageLabel(userId, imageId, label as ReferenceLabel)) ? null : t('actions.text27')
  } catch (error) {
    console.error('[brand] label referensi gagal diubah:', describeError(error))
    return t('actions.text28', { v0: t('shared.database') })
  }
}

export async function deleteReferenceAction(id: unknown): Promise<ActionError> {
  const t = await getTranslations('brand')
  const { userId } = await requireAccount()
  if (!isUuid(id)) return t('actions.text25')
  try {
    await deleteReference(userId, id)
  } catch (error) {
    console.error('[brand] referensi gagal dihapus:', describeError(error))
    return t('actions.text29')
  }
  refresh()
  return null
}

export type VisualResult = { visualStyle: string; colors: string[]; used: number; skipped: number } | { error: string }

/** Vision analysis of the newest references. Descriptions are saved; the style guide only fills the form. */
export async function analyzeVisualAction(): Promise<VisualResult> {
  const t = await getTranslations('brand')
  const { userId, accountId } = await requireAccount()
  let selection
  try {
    selection = await loadVisualReferences(userId, accountId)
  } catch (error) {
    console.error('[brand] referensi gagal dibaca:', describeError(error))
    return { error: t('actions.text30', { v0: t('shared.database') }) }
  }
  let { references, skipped } = selection
  let colors: string[] = []
  const explicitIds = new Set(references.map((reference) => reference.id))
  if (references.length < 2) {
    try {
      const [logo, logoBytes, assets] = await Promise.all([
        loadLogoImage(userId),
        loadLogoBytes(userId),
        listActiveWebsiteAssets(userId),
      ])
      if (logoBytes) colors = await paletteFromBytes(logoBytes)
      const fallback = [
        ...(logo ? [{ id: 'logo', note: 'Logo brand; analisis warna, bentuk, dan tipografinya tanpa mengarang gaya foto.', dataUrl: logo }] : []),
        ...(await Promise.all(
          assets.map(async (asset) => ({ id: `asset:${asset.id}`, note: 'Foto aktif dari website brand.', dataUrl: await toReferenceDataUrl(asset.bytes) })),
        )),
      ].filter((reference) => !references.some((item) => item.dataUrl === reference.dataUrl))
      let used = references.reduce((total, reference) => total + reference.dataUrl.length, 0)
      references = [...references, ...fallback.filter((reference) => {
        if (used + reference.dataUrl.length > VISUAL_BODY_BUDGET) {
          skipped += 1
          return false
        }
        used += reference.dataUrl.length
        return true
      })]
    } catch (error) {
      console.error('[brand] fallback visual gagal dibaca:', describeError(error))
    }
  }
  if (references.length === 0) {
    return {
      error:
        skipped > 0
          ? t('actions.text31')
          : t('actions.text32'),
    }
  }

  let analysis
  try {
    analysis = await analyzeVisual(userId, references, { language: await getUserLocale() })
  } catch (error) {
    console.error('[brand] analisis visual gagal:', describeError(error))
    return { error: localizeLibraryMessage(aiErrorMessage(error), await getUserLocale()) }
  }
  // A group can send several images; its first description is the one saved.
  const described = new Set<string>()
  await Promise.all(
    references.map(async (reference, index) => {
      const description = analysis.descriptions[index]
       if (!description || !explicitIds.has(reference.id) || described.has(reference.id)) return

      described.add(reference.id)
      // The style guide is the main result; a description that fails to save is only logged.
      await updateReference(userId, reference.id, { description }).catch((error: unknown) =>
        console.error('[brand] deskripsi referensi gagal disimpan:', describeError(error)),
      )
    }),
  )
  refresh()
  return { visualStyle: analysis.visualStyle, colors, used: references.length, skipped }
}

async function storeLogo({ userId, accountId }: AccountScope, bytes: Uint8Array): Promise<ActionError> {
  const t = await getTranslations('brand')
  const type = imageType(bytes)
  if (!type) return t('actions.text33')
  try {
    await setLogo(userId, accountId, bytes, type)
  } catch (error) {
    if (error instanceof StorageFullError) return storageFullMessage(await getUserLocale())
    if (error instanceof FileTooLargeError) return fileTooLargeMessage(await getUserLocale())
    console.error('[brand] logo gagal disimpan:', describeError(error))
    return t('actions.text34', { v0: t('shared.database') })
  }
  refresh()
  return null
}

export async function uploadLogoAction(formData: FormData): Promise<ActionError> {
  const t = await getTranslations('brand')
  const scope = await requireAccount()
  const file = formData.get('file')
  if (!(file instanceof Blob)) return t('actions.text9')
  if (file.size === 0 || file.size > MAX_IMAGE_BYTES) return t('actions.text35')
  return storeLogo(scope, new Uint8Array(await file.arrayBuffer()))
}

/** One of the logo candidates the website analysis offered. */
export async function logoFromUrlAction(url: unknown): Promise<ActionError> {
  const t = await getTranslations('brand')
  const scope = await requireAccount()
  const address = text(url)
  if (!isHttpUrl(address)) return t('actions.text36')
  try {
    const { bytes } = await fetchImage(address, MAX_IMAGE_BYTES)
    return await storeLogo(scope, bytes)
  } catch (error) {
    if (error instanceof StorageFullError) return storageFullMessage(await getUserLocale())
    if (error instanceof FileTooLargeError) return localizeLibraryMessage(error.message, await getUserLocale())
    if (error instanceof RemoteFetchError) return t('actions.text37', { v0: localizeLibraryMessage(error.message, await getUserLocale()) })
    console.error('[brand] logo dari website gagal:', describeError(error))
    return t('actions.text38')
  }
}

export async function removeLogoAction(): Promise<ActionError> {
  const t = await getTranslations('brand')
  const { userId, accountId } = await requireAccount()
  try {
    await removeLogo(userId, accountId)
  } catch (error) {
    console.error('[brand] logo gagal dihapus:', describeError(error))
    return t('actions.text39')
  }
  refresh()
  return null
}
