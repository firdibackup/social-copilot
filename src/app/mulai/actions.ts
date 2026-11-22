'use server'

import { getTranslations, getLocale } from 'next-intl/server'
import { after } from 'next/server'
import { getUserLocale } from '@/i18n/locale'
import { requireUser } from '@/lib/auth'
import { getBrandKit } from '@/lib/brand'
import { MAX_LOGO_BYTES } from '@/lib/brand-options'
import { getConnectedAccountId } from '@/lib/connection'
import { describeError } from '@/lib/errors'
import { logFunnel } from '@/lib/funnel'
import { imageType } from '@/lib/image'
import { parseInstagramUsername } from '@/lib/instagram'
import { avatarUrl, getStoredLookup, lookupInstagram, type StoredProfile } from '@/lib/instagram-lookup'
import { confirmInstagram, getOnboarding, saveOnboarding, setOnboardingLogo } from '@/lib/onboarding'
import { finishOnboarding } from '@/lib/onboarding-finish'
import { isOnboardingStep, parseAnswers } from '@/lib/onboarding-options'
import { db } from '@/lib/supabase'

export type OnboardingResult = { error: string } | { next: string }

/** Where a user goes after the wizard: straight to making the first free carousel. */
const AFTER_ONBOARDING = '/buat?baru=1'

/**
 * Saves the wizard's answers and the step the user reached, so a closed tab loses nothing and Admin › Onboarding
 * sees where people stop. `complete` ends the wizard and starts the brand fill.
 */
export async function saveOnboardingAction(input: unknown, complete: unknown, step?: unknown): Promise<OnboardingResult> {
  const t = await getTranslations('onboarding.page')
  const userId = await requireUser()
  const parsed = parseAnswers(input, await getLocale())
  if ('error' in parsed) return parsed
  try {
    if (complete !== true) {
      const reached = isOnboardingStep(step) ? step : undefined
      await saveOnboarding(userId, parsed.answers, false, reached)
      if (reached) await logFunnel(userId, 'onboarding_step', reached)
      return { next: '' }
    }
    // The confirmed username is the server's: the client never sends it.
    const { igUsername } = await getOnboarding(userId)
    const finished = await finishOnboarding(userId, { ...parsed.answers, igUsername }, await getUserLocale())
    await logFunnel(userId, 'onboarding_step', 'done')
    if (finished.fill) after(finished.fill)
    return { next: AFTER_ONBOARDING }
  } catch (error) {
    console.error('[mulai] jawaban gagal disimpan:', describeError(error))
    return { error: t('saveFailed') }
  }
}

/** What "Ini akun kamu?" shows. */
export type LookupAnswer =
  | { status: 'ok' | 'private'; profile: Pick<StoredProfile, 'username' | 'name' | 'bio' | 'followers' | 'postsCount' | 'verified' | 'business'>; avatarUrl: string | null }
  | { status: 'not_found' | 'invalid' | 'limited' | 'failed' }

/** Looks up the public profile of the username the user typed. */
export async function lookupInstagramAction(input: unknown): Promise<LookupAnswer> {
  const userId = await requireUser()
  if (typeof input !== 'string') return { status: 'invalid' }
  try {
    const result = await lookupInstagram(userId, input)
    if (result.status !== 'ok' && result.status !== 'private') return result
    const { username, name, bio, followers, postsCount, verified, business } = result.profile
    return { status: result.status, profile: { username, name, bio, followers, postsCount, verified, business }, avatarUrl: result.avatarUrl }
  } catch (error) {
    console.error('[mulai] pencarian akun gagal:', describeError(error))
    return { status: 'failed' }
  }
}

/**
 * "Ya, benar" with the username just looked up, or null for "Bukan, ganti" and "Saya tidak punya Instagram".
 * The profile saved is the server's own lookup of that username. `unchecked` keeps a username the lookup could not
 * read (Apify down or the day's lookups used up) without a profile: the user then names the brand themselves.
 */
export async function confirmInstagramAction(input: unknown, unchecked?: unknown): Promise<{ error: string } | { ok: true }> {
  const t = await getTranslations('onboarding.page')
  const userId = await requireUser()
  try {
    if (input === null) {
      await confirmInstagram(userId, null)
      return { ok: true }
    }
    const username = typeof input === 'string' ? parseInstagramUsername(input) : null
    if (!username) return { error: t('saveFailed') }
    const lookup = await getStoredLookup(username)
    if (!lookup) {
      if (unchecked !== true) return { error: t('saveFailed') }
      await confirmInstagram(userId, { username, profile: {}, avatarPath: null })
      return { ok: true }
    }
    // The captions stay in the lookup: the onboarding row keeps the profile's facts only.
    const profile: Record<string, unknown> = { ...lookup.profile }
    delete profile.captions
    await confirmInstagram(userId, { username, profile, avatarPath: lookup.avatarPath })
    return { ok: true }
  } catch (error) {
    console.error('[mulai] konfirmasi akun gagal:', describeError(error))
    return { error: t('saveFailed') }
  }
}

/** "Upload punyaku": the user's own logo instead of the profile picture. Returns a link to show it. */
export async function uploadLogoAction(form: FormData): Promise<{ error: string } | { url: string }> {
  const t = await getTranslations('onboarding.page')
  const userId = await requireUser()
  const file = form.get('logo')
  if (!(file instanceof File) || file.size === 0) return { error: t('logoInvalid') }
  if (file.size > MAX_LOGO_BYTES) return { error: t('logoTooLarge') }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const type = imageType(bytes)
    if (!type) return { error: t('logoInvalid') }
    const path = `${userId}/onboarding-logo-${crypto.randomUUID()}.${type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'}`
    const stored = await db().storage.from('brand').upload(path, bytes, { contentType: type })
    if (stored.error) throw new Error(stored.error.message)
    await setOnboardingLogo(userId, path)
    return { url: (await avatarUrl(path)) ?? '' }
  } catch (error) {
    console.error('[mulai] logo gagal diunggah:', describeError(error))
    return { error: t('saveFailed') }
  }
}

/** Whether the brand fill that started when the wizard ended is done, so the last screen can move on. */
export async function brandReadyAction(): Promise<boolean> {
  const userId = await requireUser()
  try {
    const accountId = await getConnectedAccountId(userId)
    if (!accountId) return true
    return (await getBrandKit(userId, accountId)).syncStatus !== 'running'
  } catch {
    return true
  }
}
