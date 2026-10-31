import 'server-only'
import { createHash } from 'node:crypto'
import { createAsset, findWebsiteAsset, loadAssetBytes } from './assets'
import { describeError } from './errors'
import { StorageFullError } from './storage-quota'
import { fetchImage } from './web-fetch'
import { toReferenceDataUrl, toWebsiteJpeg } from './slide-image'
import { readWebsite, type WebsiteFacts, type WebsiteImageCandidate } from './website'

const MAX_IMPORTED_IMAGES = 40
const MAX_FETCH_CANDIDATES = 80
const MAX_REMOTE_IMAGE_BYTES = 12 * 1024 * 1024
const IMPORT_DEADLINE_MS = 90_000

export interface ImportedWebsiteAsset {
  id: string
  dataUrl: string
  alt: string
  context: string
}

export interface WebsiteImportResult {
  website: WebsiteFacts
  assets: ImportedWebsiteAsset[]
  imported: number
  duplicates: number
  skipped: number
  warnings: string[]
}

const normalizedSource = (value: string) => {
  const url = new URL(value)
  url.hash = ''
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key)
  }
  return url.toString()
}

const usefulCandidate = (image: WebsiteImageCandidate) => {
  if (image.logo) return false
  if (image.width !== null && image.height !== null) {
    if (image.width < 240 || image.height < 240) return false
    const ratio = image.width / image.height
    if (ratio < 0.25 || ratio > 4) return false
  }
  return true
}

export async function importWebsiteAssets(userId: string, accountId: string, input: string): Promise<WebsiteImportResult> {
  const website = await readWebsite(input)
  const useful = website.images.filter(usefulCandidate)
  const selected = useful.slice(0, MAX_FETCH_CANDIDATES)
  const assets: ImportedWebsiteAsset[] = []
  const warnings = [...website.warnings]
  const deadline = Date.now() + IMPORT_DEADLINE_MS
  let imported = 0
  let duplicates = 0
  let skipped = Math.max(0, useful.length - selected.length)

  for (const candidate of selected) {
    if (assets.length >= MAX_IMPORTED_IMAGES || Date.now() >= deadline) break
    const sourceUrl = normalizedSource(candidate.url)
    try {
      const existing = await findWebsiteAsset(userId, accountId, sourceUrl)
      if (existing) {
        duplicates++
        if (!existing.groupId) {
          const bytes = await loadAssetBytes(userId, existing.id)
          if (bytes) {
            assets.push({
              id: existing.id,
              dataUrl: await toReferenceDataUrl(bytes),
              alt: candidate.alt,
              context: candidate.context,
            })
          }
        }
        continue
      }
      const fetched = await fetchImage(candidate.url, MAX_REMOTE_IMAGE_BYTES)
      const prepared = await toWebsiteJpeg(fetched.bytes)
      const contentHash = createHash('sha256').update(prepared.bytes).digest('hex')
      const duplicate = await findWebsiteAsset(userId, accountId, sourceUrl, contentHash)
      if (duplicate) {
        duplicates++
        if (!duplicate.groupId) {
          assets.push({
            id: duplicate.id,
            dataUrl: await toReferenceDataUrl(prepared.bytes),
            alt: candidate.alt,
            context: candidate.context,
          })
        }
        continue
      }
      const asset = await createAsset(
        userId,
        new Blob([prepared.bytes.slice().buffer]),
        prepared.width,
        prepared.height,
        { accountId, origin: 'website', sourceUrl, contentHash },
      )
      assets.push({
        id: asset.id,
        dataUrl: await toReferenceDataUrl(prepared.bytes),
        alt: candidate.alt,
        context: candidate.context,
      })
      imported++
    } catch (error) {
      skipped++
      if (error instanceof StorageFullError) {
        warnings.push('Sebagian foto tidak disimpan karena penyimpanan penuh. Bersihkan Aset dulu.')
        break
      }
      console.error('[aset] gambar website dilewati:', describeError(error))
    }
  }

  if (Date.now() >= deadline) warnings.push('Impor gambar dihentikan karena batas waktu tercapai.')
  if (skipped > 0) warnings.push(`${skipped} gambar dilewati karena tidak bisa dipakai.`)
  return { website, assets, imported, duplicates, skipped, warnings: [...new Set(warnings)] }
}
