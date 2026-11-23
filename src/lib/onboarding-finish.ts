import 'server-only'
import type { Locale } from './ai-language'
import { getBrandFields, startBrandSync, updateBrandKit } from './brand'
import { syncProvisionalAccount } from './brand-sync'
import { ensureProvisionalConnection, getConnectedAccountId } from './connection'
import { describeError } from './errors'
import { getStoredLookup } from './instagram-lookup'
import { applyPostsPerWeek, getOnboardingExtras, kitColumnsOf, saveOnboarding } from './onboarding'
import type { CaptionLanguage, OnboardingAnswers } from './onboarding-options'

/** What the brand voice says about the caption language the user picked; Indonesian is the default and says nothing. */
const LANGUAGE_NOTES: Record<CaptionLanguage, string> = {
  id: '',
  en: 'Caption dan teks slide ditulis dalam bahasa Inggris.',
  mixed: 'Caption dan teks slide memakai campuran bahasa Indonesia dan Inggris.',
}

export interface Finished {
  /** The brand fill to run after the response; null when the user's account already has its kit. */
  fill: (() => Promise<void>) | null
}

/**
 * Ends the wizard. A user without an Instagram login gets the placeholder account, with a brand kit seeded from
 * the answers and then filled from the confirmed profile, the website and the picked logo, so they can make their
 * free carousels at once. A user who is already connected keeps the earlier behaviour: the answers go to that
 * account's kit.
 */
export async function finishOnboarding(userId: string, answers: OnboardingAnswers, language: Locale): Promise<Finished> {
  const connected = await getConnectedAccountId(userId)
  await saveOnboarding(userId, answers, true)
  if (connected) return { fill: null }

  const { avatarPath } = await getOnboardingExtras(userId)
  const lookup = answers.igUsername ? await getStoredLookup(answers.igUsername) : null
  const accountId = await ensureProvisionalConnection(userId, answers.igUsername)
  const seed = {
    ...kitColumnsOf(answers),
    ...(answers.name || lookup?.profile.name ? { name: answers.name || lookup!.profile.name } : {}),
    ...(answers.website || lookup?.profile.website ? { website_url: answers.website || lookup!.profile.website } : {}),
  }
  // False when a second tab finished first: that one runs the fill.
  if (!(await startBrandSync(userId, accountId, seed))) return { fill: null }
  if (answers.postsPerWeek) await applyPostsPerWeek(userId, accountId, answers.postsPerWeek)

  const note = answers.captionLanguage ? LANGUAGE_NOTES[answers.captionLanguage] : ''
  return {
    fill: async () => {
      await syncProvisionalAccount(
        userId,
        accountId,
        {
          instagram: lookup
            ? {
                username: lookup.profile.username,
                name: lookup.profile.name,
                biography: lookup.profile.bio,
                // A private account's captions were never read.
                captions: lookup.profile.captions ?? [],
              }
            // Without a profile to read, the brand is drafted from what the user wrote about it.
            : { username: answers.igUsername, name: answers.name, biography: answers.description, captions: [] },
          websiteUrl: answers.website || lookup?.profile.website || '',
          logoPath: answers.logoChoice === 'none' ? null : avatarPath,
        },
        answers.postsPerWeek || undefined,
        language,
      )
      if (!note) return
      try {
        const voice = (await getBrandFields(userId, accountId))?.voice ?? ''
        if (!voice.includes(note)) await updateBrandKit(userId, accountId, { voice: [voice, note].filter(Boolean).join(' ') })
      } catch (error) {
        console.error('[mulai] catatan bahasa caption gagal disimpan:', describeError(error))
      }
    },
  }
}
