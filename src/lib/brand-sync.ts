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
import { analyzeProfile, analyzeStrategy, analyzeVisual, type ProfileSources } from './brand-ai'
import { colorsFromPalettes, MAX_LOGO_BYTES, PROFILE_FIELDS, type BrandFields, type ProfileText } from './brand-options'
import { getPublishingAccount } from './connection'
import { describeError } from './errors'
import { imageType } from './image'
import { paletteFromBytes } from './image-palette'
import { fetchOwnProfile, fetchRecentMedia, type InstagramPost } from './instagram'
import { readAvatar } from './instagram-lookup'
import { fetchImage } from './web-fetch'
import { readWebsite } from './website'

/** Posts read for the profile's captions; the newest IMPORTED of them become references. */
const POSTS_READ = 12
const IMPORTED = 3

/** What a brand kit is filled from: the Instagram API after the login, or the username lookup before it. */
interface FillSource {
  profile: { username: string; name: string; biography: string }
  captions: string[]
  website: ProfileSources['website']
  /** The profile picture, to become the logo; null leaves the logo as it is. */
  logo: (() => Promise<Uint8Array>) | null
  /** Posts whose images become reference groups. Only the Instagram API gives them. */
  posts: InstagramPost[]
}

interface SyncOptions {
  /** A kit that came from the username lookup keeps the logo the owner picked there. */
  keepLogo?: boolean
}

/**
 * Fills a newly connected account's brand kit from Instagram: profile text, content strategy, logo, up to 3
 * reference groups, brand colours from their covers and the visual style. What the owner answered in the onboarding
 * is already in the kit and stays: only empty fields are filled. Free: the AI requests are logged at 0 credits. Each step that
 * fails is logged and the rest still run; the kit ends with sync_status null, or 'failed' when a step failed, so
 * Brand can say so. Never throws: it runs after the callback's redirect, where nobody would see an error.
 * `postsPerWeek`, answered in the onboarding, wins over the drafted strategy's rhythm.
 */
export async function syncNewAccount(
  userId: string,
  accountId: string,
  postsPerWeek?: number,
  language: Locale = 'id',
  options: SyncOptions = {},
): Promise<void> {
  await fillBrandKit(userId, accountId, postsPerWeek, language, async () => {
    // This runs after the redirect: if the owner has switched again since, the connection is another account's.
    const account = await getPublishingAccount(userId)
    if (account.instagramUserId !== accountId) throw new Error('akun Instagram sudah berganti')
    const token = account.accessToken
    const [profile, posts] = await Promise.all([fetchOwnProfile(token), fetchRecentMedia(token, POSTS_READ)])
    const url = profile.profilePictureUrl
    return {
      // Named fields only: the sources are logged, and the picture URL is signed.
      profile: { username: profile.username, name: profile.name, biography: profile.biography },
      captions: posts.map((post) => post.caption).filter(Boolean),
      website: null,
      logo: url && !options.keepLogo ? async () => (await fetchImage(url, MAX_LOGO_BYTES)).bytes : null,
      posts,
    }
  })
}

/** What the onboarding knows of a user who has not logged in with Instagram: the lookup, a website, a picked logo. */
export interface ProvisionalSource {
  /** The confirmed profile, or for a user without one what they wrote about the brand as its name and biography. */
  instagram: { username: string; name: string; biography: string; captions: string[] } | null
  websiteUrl: string
  /** Our stored copy of the picture the user picked as the logo. */
  logoPath: string | null
}

/**
 * The same fill for the placeholder account of a user who has not logged in with Instagram yet, from what the
 * onboarding read: the public profile, the website, and the picture the user picked as the logo, whose colours
 * become the brand colours. References and the visual style wait for the login.
 */
export async function syncProvisionalAccount(
  userId: string,
  accountId: string,
  source: ProvisionalSource,
  postsPerWeek?: number,
  language: Locale = 'id',
): Promise<void> {
  const { logoPath } = source
  await fillBrandKit(userId, accountId, postsPerWeek, language, async () => {
    let website: ProfileSources['website'] = null
    if (source.websiteUrl) {
      try {
        const facts = await readWebsite(source.websiteUrl)
        website = { url: facts.url, pages: facts.pages.map(({ url, title, description, text }) => ({ url, title, description, text })) }
      } catch (error) {
        console.error('[brand] website onboarding gagal dibaca:', describeError(error))
      }
    }
    const { username = '', name = '', biography = '', captions = [] } = source.instagram ?? {}
    return { profile: { username, name, biography }, captions, website, logo: logoPath ? () => readAvatar(logoPath) : null, posts: [] }
  })
}

async function fillBrandKit(
  userId: string,
  accountId: string,
  postsPerWeek: number | undefined,
  language: Locale,
  load: () => Promise<FillSource>,
): Promise<void> {
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

  const source = await step('baca sumber', load)

  if (source) {
    const { profile, posts, captions } = source
    const kit = await step('baca brand kit', () => getBrandFields(userId, accountId))
    const isEmpty = (field: keyof BrandFields) => {
      const value = kit?.[field]
      return Array.isArray(value) ? value.length === 0 : !value
    }

    const hasText = Boolean(source.website || profile.biography || profile.name || captions.length > 0)
    const profileText = !hasText ? null : await step('profil', async () => {
      const instagram = profile.username || profile.name || profile.biography ? { ...profile, captions } : null
      const draft = await analyzeProfile(userId, { website: source.website, instagram }, { cost: 0, ...(language === 'en' ? { language } : {}) })
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

    const palettes: string[][] = []
    if (source.logo) {
      const readLogo = source.logo
      await step('logo', async () => {
        const bytes = await readLogo()
        const type = imageType(bytes)
        if (!type) throw new Error('Foto profil bukan PNG, JPEG, atau WebP')
        await setLogo(userId, accountId, bytes, type)
        // Without posts to read, the logo's colours are the only ones known.
        if (posts.length === 0) palettes.push(await paletteFromBytes(bytes))
      })
    }

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
