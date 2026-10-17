'use server'

import { refresh } from 'next/cache'
import { aiErrorMessage } from '@/lib/ai'
import { requireAccount, type AccountScope } from '@/lib/auth'
import {
  addReference,
  deleteReference,
  loadVisualReferences,
  ReferenceLimitError,
  removeLogo,
  saveBrandKit,
  setLogo,
  updateReference,
  type ReferencePatch,
} from '@/lib/brand'
import { analyzeProfile, analyzeVisual, type ProfileDraft, type ProfileSources } from '@/lib/brand-ai'
import {
  DESCRIPTION_MAX_LENGTH,
  lengthOf,
  MAX_LOGO_BYTES,
  NOTE_MAX_LENGTH,
  parseBrandFields,
  parsePalette,
  type ReferenceSource,
} from '@/lib/brand-options'
import { getValidAccessToken, markNeedsReconnect, NeedsReconnectError } from '@/lib/connection'
import { describeError } from '@/lib/errors'
import { discoverAccount, parseInstagramUsername } from '@/lib/facebook'
import { FacebookReconnectError, getDiscoveryAccount, markFacebookNeedsReconnect } from '@/lib/facebook-connection'
import { imageType, isJpeg, MAX_IMAGE_BYTES } from '@/lib/image'
import { fetchOwnProfile, fetchRecentMedia, InstagramApiError, type InstagramPost } from '@/lib/instagram'
import { isUuid } from '@/lib/params'
import { fetchImage, RemoteFetchError } from '@/lib/web-fetch'
import { readWebsite } from '@/lib/website'

/** Each action returns a message for the owner, or null when it worked. */
type ActionError = string | null

const POSTS_LIMIT = 24
const CAPTION_SAMPLES = 12
const MAX_IMPORT = 12
const URL_MAX_LENGTH = 2000
const LABEL_MAX_LENGTH = 200

const DATABASE = 'Periksa koneksi Supabase dan migrasi terbaru.'
const IG_RECONNECT = 'Token Instagram kedaluwarsa atau dicabut. Hubungkan ulang di Pengaturan.'
const FB_RECONNECT = 'Business Discovery butuh Facebook. Hubungkan (atau hubungkan ulang) Facebook di Pengaturan.'

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

/** Owner-facing text for a failed call on the connected account. */
async function instagramErrorMessage(userId: string, error: unknown, context: string): Promise<string> {
  if (error instanceof NeedsReconnectError) return IG_RECONNECT
  if (error instanceof InstagramApiError && error.isInvalidToken) {
    await markNeedsReconnect(userId)
    return IG_RECONNECT
  }
  console.error(`[brand] ${context}:`, describeError(error))
  return error instanceof InstagramApiError
    ? `Instagram menolak: ${error.message}`
    : 'Instagram atau database tidak bisa dihubungi. Coba lagi.'
}

export async function saveBrandAction(input: unknown): Promise<ActionError> {
  const { userId, accountId } = await requireAccount()
  const parsed = parseBrandFields(input)
  if ('error' in parsed) return parsed.error
  try {
    await saveBrandKit(userId, accountId, parsed.fields)
  } catch (error) {
    console.error('[brand] brand kit gagal disimpan:', describeError(error))
    return `Brand kit gagal disimpan. ${DATABASE}`
  }
  refresh()
  return null
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
  try {
    return { value: await readWebsite(url) }
  } catch (error) {
    if (error instanceof RemoteFetchError) return { warning: `Website tidak terbaca: ${error.message}` }
    console.error('[brand] website gagal dibaca:', describeError(error))
    return { warning: 'Website tidak terbaca.' }
  }
}

async function readInstagram(userId: string): Promise<Read<NonNullable<ProfileSources['instagram']>>> {
  try {
    const token = await getValidAccessToken(userId)
    const [profile, posts] = await Promise.all([fetchOwnProfile(token), fetchRecentMedia(token, CAPTION_SAMPLES)])
    return { value: { ...profile, captions: posts.map((post) => post.caption).filter(Boolean) } }
  } catch (error) {
    return { warning: await instagramErrorMessage(userId, error, 'akun Instagram gagal dibaca') }
  }
}

/** Reads the sources and asks the AI for a profile draft. Nothing is saved: the form shows the draft. */
export async function analyzeProfileAction(websiteUrl: unknown, includeInstagram: unknown): Promise<ProfileResult> {
  const { userId } = await requireAccount()
  const url = text(websiteUrl)
  if (!url && includeInstagram !== true) return { error: 'Isi alamat website atau centang akun Instagram dulu.' }

  const [site, instagram] = await Promise.all([url ? readSite(url) : null, includeInstagram === true ? readInstagram(userId) : null])
  const warnings = [site, instagram].flatMap((read) => (read && 'warning' in read ? [read.warning] : []))
  const website = site && 'value' in site ? site.value : null
  const sources: ProfileSources = {
    website: website && { url: website.url, title: website.title, description: website.description, text: website.text },
    instagram: instagram && 'value' in instagram ? instagram.value : null,
  }
  if (!sources.website && !sources.instagram) return { error: warnings.join(' ') }

  try {
    const draft = await analyzeProfile(userId, sources)
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
    return { error: aiErrorMessage(error) }
  }
}

/** Receives a JPEG prepared in the browser (see toReferenceJpeg) and its palette. */
export async function uploadReferenceAction(formData: FormData): Promise<ActionError> {
  const { userId } = await requireAccount()
  const file = formData.get('file')
  if (!(file instanceof Blob)) return 'File tidak ditemukan.'
  if (file.size === 0 || file.size > MAX_IMAGE_BYTES) return 'Ukuran gambar harus di bawah 8 MB.'
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!isJpeg(bytes)) return 'File bukan JPEG.'
  let palette: string[] = []
  try {
    palette = parsePalette(JSON.parse(String(formData.get('palette') ?? '[]'))) ?? []
  } catch {
    // A missing palette is filled in by the page later.
  }

  try {
    await addReference(userId, { bytes, type: 'image/jpeg', source: 'upload', sourceLabel: 'Unggahan', permalink: null, palette })
  } catch (error) {
    if (error instanceof ReferenceLimitError) return error.message
    console.error('[brand] referensi gagal disimpan:', describeError(error))
    return `Gambar gagal disimpan. ${DATABASE}`
  }
  refresh()
  return null
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

/** Graph codes for missing users (110) and bad requests (100), and for missing permissions (10, 200). */
async function discoveryErrorMessage(scope: AccountScope, error: unknown, username: string): Promise<string> {
  if (error instanceof FacebookReconnectError) return FB_RECONNECT
  if (error instanceof InstagramApiError) {
    if (error.isInvalidToken) {
      await markFacebookNeedsReconnect(scope.userId, scope.accountId).catch(() => {})
      return FB_RECONNECT
    }
    if (error.code === 110 || error.code === 100) {
      return `Akun @${username} tidak bisa dibaca: tidak ada, akun personal, atau dibatasi umur. Business Discovery hanya membaca akun Business atau Creator. (Meta: ${error.message})`
    }
    if (error.code === 10 || error.code === 200) return `Izin Facebook kurang. (Meta: ${error.message})`
  }
  console.error('[brand] business discovery gagal:', describeError(error))
  return error instanceof InstagramApiError
    ? `Meta menolak: ${error.message}`
    : 'Meta atau database tidak bisa dihubungi. Coba lagi.'
}

/** Another Business or Creator account's newest posts, through Business Discovery. */
export async function discoverPostsAction(input: unknown): Promise<PostsResult> {
  const scope = await requireAccount()
  const username = parseInstagramUsername(text(input))
  if (!username) return { error: 'Tulis username Instagram, mis. @namaakun, atau tempel link profilnya.' }
  try {
    const account = await getDiscoveryAccount(scope.userId, scope.accountId)
    const found = await discoverAccount(account.accessToken, account.instagramUserId, username)
    const { posts, ...profile } = found
    return { account: profile, posts }
  } catch (error) {
    return { error: await discoveryErrorMessage(scope, error, username) }
  }
}

interface ImportItem {
  imageUrl: string
  permalink: string | null
  source: Exclude<ReferenceSource, 'upload'>
  sourceLabel: string
}

const IMPORT_SOURCES = new Set<string>(['website', 'instagram', 'discovery'])
const isHttpUrl = (value: string) => /^https?:\/\//i.test(value) && lengthOf(value) <= URL_MAX_LENGTH

function parseImportItem(value: unknown): ImportItem | null {
  if (!isObject(value)) return null
  const imageUrl = text(value.imageUrl)
  const permalink = value.permalink === null ? null : text(value.permalink)
  const sourceLabel = text(value.sourceLabel)
  if (!isHttpUrl(imageUrl) || (permalink !== null && !isHttpUrl(permalink))) return null
  if (typeof value.source !== 'string' || !IMPORT_SOURCES.has(value.source)) return null
  if (lengthOf(sourceLabel) > LABEL_MAX_LENGTH || (permalink !== null && lengthOf(permalink) > 500)) return null
  return { imageUrl, permalink, source: value.source as ImportItem['source'], sourceLabel }
}

export type ImportResult = { imported: number; failed: string[] } | { error: string }

/** Downloads the chosen images into the brand bucket. The page computes their palettes afterwards. */
export async function importReferencesAction(items: unknown): Promise<ImportResult> {
  const { userId } = await requireAccount()
  const parsed = Array.isArray(items) ? items.map(parseImportItem) : []
  if (parsed.length === 0 || parsed.length > MAX_IMPORT || parsed.some((item) => item === null)) {
    return { error: `Pilih 1–${MAX_IMPORT} gambar.` }
  }

  let imported = 0
  const failed: string[] = []
  for (const [index, item] of (parsed as ImportItem[]).entries()) {
    try {
      const image = await fetchImage(item.imageUrl)
      await addReference(userId, { ...image, source: item.source, sourceLabel: item.sourceLabel, permalink: item.permalink, palette: [] })
      imported += 1
    } catch (error) {
      if (error instanceof ReferenceLimitError) {
        failed.push(error.message)
        break
      }
      if (error instanceof RemoteFetchError) failed.push(`Gambar ${index + 1}: ${error.message}`)
      else {
        console.error('[brand] impor referensi gagal:', describeError(error))
        failed.push(`Gambar ${index + 1}: gagal disimpan. ${DATABASE}`)
      }
    }
  }
  if (imported > 0) refresh()
  return { imported, failed }
}

function parsePatch(value: unknown): ReferencePatch | string {
  if (!isObject(value)) return 'Perubahan tidak valid.'
  const patch: ReferencePatch = {}
  if (value.note !== undefined) {
    patch.note = text(value.note)
    if (lengthOf(patch.note) > NOTE_MAX_LENGTH) return `Catatan maksimal ${NOTE_MAX_LENGTH} karakter.`
  }
  if (value.description !== undefined) {
    patch.description = text(value.description)
    if (lengthOf(patch.description) > DESCRIPTION_MAX_LENGTH) return `Deskripsi maksimal ${DESCRIPTION_MAX_LENGTH} karakter.`
  }
  if (value.palette !== undefined) {
    const palette = parsePalette(value.palette)
    if (!palette) return 'Palet tidak valid.'
    patch.palette = palette
  }
  return Object.keys(patch).length > 0 ? patch : 'Perubahan tidak valid.'
}

/** No refresh: the card already shows what was typed, and palettes arrive in a batch the page refreshes once. */
export async function updateReferenceAction(id: unknown, changes: unknown): Promise<ActionError> {
  const { userId } = await requireAccount()
  if (!isUuid(id)) return 'Referensi tidak ditemukan.'
  const patch = parsePatch(changes)
  if (typeof patch === 'string') return patch
  try {
    return (await updateReference(userId, id, patch)) ? null : 'Referensi tidak ditemukan.'
  } catch (error) {
    console.error('[brand] referensi gagal diubah:', describeError(error))
    return `Perubahan gagal disimpan. ${DATABASE}`
  }
}

export async function deleteReferenceAction(id: unknown): Promise<ActionError> {
  const { userId } = await requireAccount()
  if (!isUuid(id)) return 'Referensi tidak ditemukan.'
  try {
    await deleteReference(userId, id)
  } catch (error) {
    console.error('[brand] referensi gagal dihapus:', describeError(error))
    return 'Referensi gagal dihapus. Coba lagi.'
  }
  refresh()
  return null
}

export type VisualResult = { visualStyle: string; used: number; skipped: number } | { error: string }

/** Vision analysis of the newest references. Descriptions are saved; the style guide only fills the form. */
export async function analyzeVisualAction(): Promise<VisualResult> {
  const { userId } = await requireAccount()
  let selection
  try {
    selection = await loadVisualReferences(userId)
  } catch (error) {
    console.error('[brand] referensi gagal dibaca:', describeError(error))
    return { error: `Referensi gagal dibaca. ${DATABASE}` }
  }
  const { references, skipped } = selection
  if (references.length === 0) {
    return {
      error:
        skipped > 0
          ? 'Referensi terbaru terlalu besar untuk dikirim ke 9Router (batas 1 MB per permintaan). Unggah versi yang lebih kecil.'
          : 'Tambahkan referensi desain dulu.',
    }
  }

  let analysis
  try {
    analysis = await analyzeVisual(userId, references)
  } catch (error) {
    console.error('[brand] analisis visual gagal:', describeError(error))
    return { error: aiErrorMessage(error) }
  }
  await Promise.all(
    references.map(async (reference, index) => {
      const description = analysis.descriptions[index]
      if (!description) return
      // The style guide is the main result; a description that fails to save is only logged.
      await updateReference(userId, reference.id, { description }).catch((error: unknown) =>
        console.error('[brand] deskripsi referensi gagal disimpan:', describeError(error)),
      )
    }),
  )
  refresh()
  return { visualStyle: analysis.visualStyle, used: references.length, skipped }
}

async function storeLogo({ userId, accountId }: AccountScope, bytes: Uint8Array): Promise<ActionError> {
  const type = imageType(bytes)
  if (!type) return 'Logo harus PNG, JPEG, atau WebP.'
  try {
    await setLogo(userId, accountId, bytes, type)
  } catch (error) {
    console.error('[brand] logo gagal disimpan:', describeError(error))
    return `Logo gagal disimpan. ${DATABASE}`
  }
  refresh()
  return null
}

export async function uploadLogoAction(formData: FormData): Promise<ActionError> {
  const scope = await requireAccount()
  const file = formData.get('file')
  if (!(file instanceof Blob)) return 'File tidak ditemukan.'
  if (file.size === 0 || file.size > MAX_LOGO_BYTES) return 'Ukuran logo harus di bawah 2 MB.'
  return storeLogo(scope, new Uint8Array(await file.arrayBuffer()))
}

/** One of the logo candidates the website analysis offered. */
export async function logoFromUrlAction(url: unknown): Promise<ActionError> {
  const scope = await requireAccount()
  const address = text(url)
  if (!isHttpUrl(address)) return 'Alamat logo tidak valid.'
  try {
    const { bytes } = await fetchImage(address, MAX_LOGO_BYTES)
    return await storeLogo(scope, bytes)
  } catch (error) {
    if (error instanceof RemoteFetchError) return `Logo tidak bisa diambil: ${error.message}`
    console.error('[brand] logo dari website gagal:', describeError(error))
    return 'Logo tidak bisa diambil. Coba unggah manual.'
  }
}

export async function removeLogoAction(): Promise<ActionError> {
  const { userId, accountId } = await requireAccount()
  try {
    await removeLogo(userId, accountId)
  } catch (error) {
    console.error('[brand] logo gagal dihapus:', describeError(error))
    return 'Logo gagal dihapus. Coba lagi.'
  }
  refresh()
  return null
}
