import 'server-only'
import type { Locale } from './ai-language'
import {
  addReference,
  getAccountStrategy,
  getBrandFields,
  loadVisualReferences,
  saveStrategy,
  setLogo,
  updateBrandKit,
  updateReference,
} from './brand'
import { analyzeProfile, analyzeStrategy, analyzeVisual } from './brand-ai'
import { colorsFromPalettes, MAX_LOGO_BYTES, PROFILE_FIELDS, type BrandFields, type ProfileText } from './brand-options'
import { getValidAccessToken } from './connection'
import { describeError } from './errors'
import { imageType } from './image'
import { paletteFromBytes } from './image-palette'
import { fetchOwnProfile, fetchRecentMedia, type InstagramPost } from './instagram'
import { fetchImage } from './web-fetch'

/** Posts read for the profile's captions; the newest IMPORTED of them become references. */
const POSTS_READ = 12
const IMPORTED = 3

/**
 * Fills a newly connected account's brand kit from Instagram: profile text, content strategy, logo, up to 3
 * reference groups, brand colours from their covers and the visual style. What the owner answered in the onboarding
 * is already in the kit and stays: only empty fields are filled. Free: the AI requests are logged at 0 credits. Each step that
 * fails is logged and the rest still run; the kit ends with sync_status null, or 'failed' when a step failed, so
 * Brand can say so. Never throws: it runs after the callback's redirect, where nobody would see an error.
 * `postsPerWeek`, answered in the onboarding, wins over the drafted strategy's rhythm.
 */
export async function syncNewAccount(userId: string, accountId: string, postsPerWeek?: number, language: Locale = 'id'): Promise<void> {
  let failed = false
  async function step<T>(name: string, run: () => Promise<T>): Promise<T | null> {
    try {
      return await run()
    } catch (error) {
      failed = true
      console.error(`[brand] isi otomatis ${name} gagal:`, describeError(error))
      return null
    }
  }

  const source = await step('baca Instagram', async () => {
    const token = await getValidAccessToken(userId)
    const [profile, posts] = await Promise.all([fetchOwnProfile(token), fetchRecentMedia(token, POSTS_READ)])
    return { profile, posts }
  })

  if (source) {
    const { profile, posts } = source
    const kit = await step('baca brand kit', () => getBrandFields(userId, accountId))
    const isEmpty = (field: keyof BrandFields) => {
      const value = kit?.[field]
      return Array.isArray(value) ? value.length === 0 : !value
    }

    const captions = posts.map((post) => post.caption).filter(Boolean)
    const profileText = await step('profil', async () => {
      // Named fields only: the sources are logged, and the picture URL is signed.
      const { username, name, biography } = profile
      const instagram = { username, name, biography, captions }
      const draft = await analyzeProfile(userId, { website: null, instagram }, { cost: 0, ...(language === 'en' ? { language } : {}) })
      const fields = PROFILE_FIELDS.filter((field) => draft[field] && isEmpty(field))
      if (fields.length > 0) {
        await updateBrandKit(userId, accountId, Object.fromEntries(fields.map((field) => [field, draft[field]])))
      }
      // What the kit holds now: the owner's onboarding answers win over the draft.
      return Object.fromEntries(PROFILE_FIELDS.map((field) => [field, kit?.[field] || draft[field]])) as ProfileText
    })

    if (profileText) {
      await step('strategi', async () => {
        if (await getAccountStrategy(userId, accountId)) return
        const strategy = await analyzeStrategy(userId, { brand: profileText, recent: captions }, { cost: 0, ...(language === 'en' ? { language } : {}) })
        await saveStrategy(userId, accountId, postsPerWeek ? { ...strategy, postsPerWeek } : strategy)
      })
    }

    if (profile.profilePictureUrl) {
      const url = profile.profilePictureUrl
      await step('logo', async () => {
        const { bytes } = await fetchImage(url, MAX_LOGO_BYTES)
        const type = imageType(bytes)
        if (!type) throw new Error('Foto profil bukan PNG, JPEG, atau WebP')
        await setLogo(userId, accountId, bytes, type)
      })
    }

    const palettes: string[][] = []
    for (const post of posts.slice(0, IMPORTED)) {
      const palette = await step('referensi', () => importPost(userId, accountId, post, `@${profile.username}`))
      if (palette && palette.length > 0) palettes.push(palette)
    }
    const colors = colorsFromPalettes(palettes)
    if (colors.length > 0 && isEmpty('colors')) await step('warna', () => updateBrandKit(userId, accountId, { colors }))

    await step('gaya visual', async () => {
      const { references } = await loadVisualReferences(userId, accountId)
      if (references.length === 0) return
      const analysis = await analyzeVisual(userId, references, { cost: 0, ...(language === 'en' ? { language } : {}) })
      if (isEmpty('visualStyle')) await updateBrandKit(userId, accountId, { visualStyle: analysis.visualStyle })
      const described = new Set<string>()
      for (const [index, reference] of references.entries()) {
        const description = analysis.descriptions[index]
        if (!description || described.has(reference.id)) continue
        described.add(reference.id)
        await updateReference(userId, reference.id, { description })
      }
    })
  }

  try {
    await updateBrandKit(userId, accountId, { syncStatus: failed ? 'failed' : null })
  } catch (error) {
    console.error('[brand] status isi otomatis gagal disimpan:', describeError(error))
  }
}

/** One post as a reference group, with its cover's palette saved. Returns the palette. */
async function importPost(userId: string, accountId: string, post: InstagramPost, sourceLabel: string): Promise<string[]> {
  const images = []
  for (const url of post.images) images.push(await fetchImage(url))
  const id = await addReference(userId, accountId, {
    images,
    source: 'instagram',
    sourceLabel,
    permalink: post.permalink,
    palette: [],
  })
  const palette = await paletteFromBytes(images[0].bytes)
  if (palette.length > 0) await updateReference(userId, id, { palette })
  return palette
}
