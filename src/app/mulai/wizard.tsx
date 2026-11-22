'use client'

import { useLocale, useTranslations } from 'next-intl'
import { ArrowLeft, ArrowRight, AtSign, BadgeCheck, Check, ImageUp, Lock } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { CarouselyLogo } from '@/components/brand-mark'
import { InstagramIcon } from '@/components/instagram-icon'
import { LocaleToggle } from '@/components/locale-toggle'
import { Notice } from '@/components/notice'
import { BRAND_TEXT_LIMITS } from '@/lib/brand-options'
import { TRIAL_CHAT_MESSAGES, TRIAL_CONTENTS, TRIAL_CONTENTS_CONNECTED } from '@/lib/billing-options'
import {
  CAPTION_LANGUAGES,
  GOALS,
  HANDLERS,
  POSTS_LAST_MONTH,
  POSTS_PER_WEEK_CHOICES,
  REFERRAL_MAX_LENGTH,
  REFERRAL_SOURCES,
  SKILL_LEVELS,
  WEBSITE_MAX_LENGTH,
  parseWebsite,
  type OnboardingAnswers,
  type OnboardingStep,
} from '@/lib/onboarding-options'
import {
  brandReadyAction,
  confirmInstagramAction,
  lookupInstagramAction,
  saveOnboardingAction,
  uploadLogoAction,
  type LookupAnswer,
} from './actions'
import { HANDLE_STORAGE_KEY } from './handle'

const FIELD =
  'block w-full rounded-xl border border-hairline bg-white px-4 py-3 text-base text-ink placeholder:text-ink-soft focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent'
const PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50'
const SECONDARY =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-hairline bg-white px-5 py-3 text-sm font-medium text-ink transition-colors hover:border-zinc-300 disabled:opacity-50'
const GHOST =
  'inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-ink-muted transition-colors hover:bg-zinc-100 hover:text-ink disabled:opacity-50'

const INSTAGRAM_LOGIN_HREF = '/api/auth/instagram/start'
/** How long the last screen waits for the brand fill before it moves on anyway. */
const READY_WAIT_MS = 45_000
const READY_POLL_MS = 3_000

export interface WizardExtras {
  /** The confirmed profile's picture or the uploaded logo. */
  avatarUrl: string | null
  /** The Instagram account the user logged in with, when they did. */
  connected: string | null
  /** The Instagram login was tried and failed. */
  loginFailed: boolean
  /** The confirmed username came without a profile (the lookup could not read it), so the brand needs a name. */
  unchecked: boolean
}

/** The steps this user walks: Instagram's two when not logged in with it, or the brand's own for one without Instagram. */
function stepsFor(answers: OnboardingAnswers, connected: boolean, unchecked: boolean): OnboardingStep[] {
  const first: OnboardingStep[] = connected ? [] : answers.noInstagram ? ['instagram', 'brand'] : unchecked ? ['instagram', 'confirm', 'brand'] : ['instagram', 'confirm']
  // After the Instagram login the brand fill takes the logo from the account itself.
  return [...first, 'goal', 'website', 'language', 'posts', 'frequency', 'handler', 'skill', 'referral', ...(connected ? [] : ['logo' as const]), 'done']
}

/** Whether a step has what it needs to move on. Website and logo may be skipped. */
function isAnswered(step: OnboardingStep, answers: OnboardingAnswers, handle: string): boolean {
  switch (step) {
    case 'instagram': return handle.trim() !== ''
    case 'confirm': return answers.igUsername !== ''
    case 'brand': return answers.name.trim() !== ''
    case 'goal': return answers.goal !== ''
    case 'language': return answers.captionLanguage !== ''
    case 'posts': return answers.postsPerWeek > 0
    case 'frequency': return answers.postsLastMonth !== ''
    case 'handler': return answers.handler !== ''
    case 'skill': return answers.skillLevel !== ''
    case 'referral': return answers.referralSource.trim() !== ''
    default: return true
  }
}

/** A returning user continues at the first question they have not answered. */
function firstOpenStep(answers: OnboardingAnswers, connected: boolean, unchecked: boolean): OnboardingStep {
  const named = answers.name.trim() !== ''
  const identified = connected || (answers.igUsername !== '' && (!unchecked || named)) || (answers.noInstagram && named)
  if (!identified) return answers.igUsername !== '' ? 'brand' : 'instagram'
  const open = stepsFor(answers, connected, unchecked).find(
    (step) => !['instagram', 'confirm', 'brand', 'website'].includes(step) && !isAnswered(step, answers, ''),
  )
  return open ?? (connected ? 'referral' : 'logo')
}

const isProfile = (lookup: LookupAnswer | null): lookup is Extract<LookupAnswer, { status: 'ok' | 'private' }> =>
  lookup?.status === 'ok' || lookup?.status === 'private'

export function Wizard({ initial, extras }: { initial: OnboardingAnswers; extras: WizardExtras }) {
  const t = useTranslations('onboarding')
  const router = useRouter()
  const connected = extras.connected !== null
  const [answers, setAnswers] = useState<OnboardingAnswers>(initial)
  const [unchecked, setUnchecked] = useState(extras.unchecked)
  const [step, setStep] = useState<OnboardingStep>(() => firstOpenStep(initial, connected, extras.unchecked))
  const [handle, setHandle] = useState(initial.igUsername)
  const [lookup, setLookup] = useState<LookupAnswer | null>(null)
  const [avatarUrl, setAvatarUrl] = useState(extras.avatarUrl)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  const steps = stepsFor(answers, connected, unchecked)
  const index = Math.max(0, steps.indexOf(step))
  const answered = isAnswered(step, answers, handle)
  /** Why the lookup found no profile to confirm, when it did not: the step then offers another try instead. */
  const missed = step === 'confirm' && lookup && !isProfile(lookup) ? lookup.status : null

  /** The username typed on the landing page, once: the first step's field asks for it when it gets the focus. */
  function recallHandle() {
    try {
      const remembered = window.localStorage.getItem(HANDLE_STORAGE_KEY)
      window.localStorage.removeItem(HANDLE_STORAGE_KEY)
      if (remembered) setHandle((current) => current || remembered)
    } catch {
      // Storage is blocked: the user types it.
    }
  }

  function go(next: OnboardingStep) {
    setStep(next)
    setError(null)
    // The new question is announced and Enter keeps working from it.
    requestAnimationFrame(() => heading.current?.focus())
  }

  /** Kept as the user goes, so a closed tab loses nothing; a failure here only matters at the end. */
  function keep(next: OnboardingAnswers, reached: OnboardingStep) {
    void saveOnboardingAction(next, false, reached).catch(() => undefined)
  }

  function advance(next: OnboardingAnswers = answers, withoutProfile = unchecked) {
    const list = stepsFor(next, connected, withoutProfile)
    const target = list[Math.min(list.length - 1, list.indexOf(step) + 1)]
    setAnswers(next)
    keep(next, target)
    go(target)
  }

  /** A tapped choice is the answer: it moves on by itself. */
  function choose<K extends keyof OnboardingAnswers>(field: K, value: OnboardingAnswers[K]) {
    const next = { ...answers, [field]: value }
    setAnswers(next)
    window.setTimeout(() => advance(next), 160)
  }

  async function findAccount() {
    setPending(true)
    setError(null)
    const result = await lookupInstagramAction(handle).catch((): LookupAnswer => ({ status: 'failed' }))
    setPending(false)
    setLookup(result)
    setAnswers({ ...answers, noInstagram: false })
    go('confirm')
  }

  async function confirmAccount() {
    if (!isProfile(lookup)) return
    setPending(true)
    const result = await confirmInstagramAction(lookup.profile.username).catch(() => ({ error: t('wizard.failed') }))
    setPending(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setAvatarUrl(lookup.avatarUrl)
    setUnchecked(false)
    advance({ ...answers, igUsername: lookup.profile.username, noInstagram: false }, false)
  }

  /** The lookup could not read Instagram: the typed username is kept as it is, and the user names the brand. */
  async function keepUsername() {
    setPending(true)
    const result = await confirmInstagramAction(handle, true).catch(() => ({ error: t('wizard.failed') }))
    setPending(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setAvatarUrl(null)
    setUnchecked(true)
    advance({ ...answers, igUsername: handle.trim().toLowerCase().replace(/^@+/, ''), noInstagram: false }, true)
  }

  async function withoutInstagram() {
    setPending(true)
    await confirmInstagramAction(null).catch(() => undefined)
    setPending(false)
    const next = { ...answers, igUsername: '', noInstagram: true }
    setAnswers(next)
    setAvatarUrl(null)
    setLookup(null)
    setUnchecked(false)
    keep(next, 'brand')
    go('brand')
  }

  function forward(event?: FormEvent) {
    event?.preventDefault()
    if (pending || !answered) return
    if (step === 'instagram') {
      void findAccount()
      return
    }
    if (step === 'confirm') {
      if (missed) return
      // Without a lookup the step was reached again with Kembali: the account is confirmed already.
      if (lookup) void confirmAccount()
      else advance()
      return
    }
    if (step === 'website') {
      const website = parseWebsite(answers.website)
      if (website === null) {
        setError(t('errors.website'))
        return
      }
      advance({ ...answers, website })
      return
    }
    advance()
  }

  const title = missed ? t(`flow.confirm.${missed}.title`) : t(`flow.${step}.title`)
  const hint = missed
    ? t(`flow.confirm.${missed}.hint`)
    : t(`flow.${step}.hint`, { contents: TRIAL_CONTENTS, chats: TRIAL_CHAT_MESSAGES })

  if (step === 'done') {
    return (
      <Shell index={index} total={steps.length}>
        <Finishing answers={answers} avatarUrl={avatarUrl} onBack={() => go(steps[Math.max(0, steps.length - 2)])} onDone={(href) => router.push(href)} />
      </Shell>
    )
  }

  return (
    <Shell index={index} total={steps.length}>
      <form onSubmit={forward} className="flex flex-1 flex-col">
        <div key={step} className="mx-auto w-full max-w-xl flex-1 animate-fade-in px-5 py-10 sm:py-16">
          <p className="text-sm font-medium text-accent">
            {index + 1} / {steps.length}
          </p>
          <h1 ref={heading} tabIndex={-1} className="mt-2 text-2xl font-semibold tracking-tight text-balance text-ink outline-none sm:text-3xl">
            {title}
          </h1>
          <p className="mt-2 text-pretty text-ink-muted">{hint}</p>

          <div className="mt-8 space-y-5">
            {step === 'instagram' && (
              <>
                {extras.loginFailed && <Notice tone="warning">{t('flow.instagram.loginFailed')}</Notice>}
                <label className="block">
                  <span className="sr-only">{t('flow.instagram.label')}</span>
                  <span className="relative block">
                    <AtSign size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-soft" aria-hidden="true" />
                    <input
                      autoFocus
                      onFocus={recallHandle}
                      value={handle}
                      onChange={(event) => { setHandle(event.target.value.replace(/^@+/, '')); setError(null) }}
                      maxLength={200}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder={t('flow.instagram.placeholder')}
                      className={`${FIELD} pl-11`}
                    />
                  </span>
                </label>
                <p className="flex items-start gap-2 text-sm text-ink-muted">
                  <Lock size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                  {t('flow.instagram.privacy')}
                </p>
                <InstagramCallout />
                <button type="button" onClick={() => void withoutInstagram()} disabled={pending} className="text-sm font-medium text-ink-muted underline underline-offset-4 hover:text-ink">
                  {t('flow.instagram.none')}
                </button>
              </>
            )}

            {step === 'confirm' && (
              <ConfirmAccount lookup={lookup} confirmed={answers.igUsername} avatarUrl={avatarUrl} pending={pending} handle={handle}
                onYes={() => void confirmAccount()} onChange={() => go('instagram')} onNone={() => void withoutInstagram()} onKeep={() => void keepUsername()} />
            )}

            {step === 'brand' && (
              <>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-ink">{t('wizard.name')}</span>
                  <input autoFocus value={answers.name} onChange={(event) => setAnswers({ ...answers, name: event.target.value })}
                    maxLength={BRAND_TEXT_LIMITS.name} placeholder={t('wizard.namePlaceholder')} className={FIELD} />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-ink">{t('flow.brand.about')}</span>
                  <textarea value={answers.description} onChange={(event) => setAnswers({ ...answers, description: event.target.value })}
                    maxLength={BRAND_TEXT_LIMITS.description} rows={3} placeholder={t('wizard.descriptionPlaceholder')} className={FIELD} />
                </label>
              </>
            )}

            {step === 'goal' && (
              <Choices label={title} options={GOALS} value={answers.goal} text={(id) => t(`flow.goal.options.${id}`)} onPick={(id) => choose('goal', id)} />
            )}
            {step === 'website' && (
              <input autoFocus value={answers.website} onChange={(event) => { setAnswers({ ...answers, website: event.target.value }); setError(null) }}
                maxLength={WEBSITE_MAX_LENGTH} inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                placeholder={t('flow.website.placeholder')} aria-label={title} className={FIELD} />
            )}
            {step === 'language' && (
              <Choices label={title} options={CAPTION_LANGUAGES} value={answers.captionLanguage} columns={3}
                text={(id) => t(`flow.language.options.${id}`)} onPick={(id) => choose('captionLanguage', id)} />
            )}
            {step === 'posts' && (
              <Choices label={title} options={POSTS_PER_WEEK_CHOICES} value={answers.postsPerWeek}
                text={(count) => t('wizard.posts', { count })} onPick={(count) => choose('postsPerWeek', count)} />
            )}
            {step === 'frequency' && (
              <Choices label={title} options={POSTS_LAST_MONTH} value={answers.postsLastMonth}
                text={(id) => t(`flow.frequency.options.${id}`)} onPick={(id) => choose('postsLastMonth', id)} />
            )}
            {step === 'handler' && (
              <Choices label={title} options={HANDLERS} value={answers.handler} text={(id) => t(`flow.handler.options.${id}`)} onPick={(id) => choose('handler', id)} />
            )}
            {step === 'skill' && (
              <Choices label={title} options={SKILL_LEVELS} value={answers.skillLevel} text={(id) => t(`flow.skill.options.${id}`)} onPick={(id) => choose('skillLevel', id)} />
            )}
            {step === 'referral' && (
              <ReferralStep value={answers.referralSource} onChange={(referralSource) => setAnswers({ ...answers, referralSource })} />
            )}
            {step === 'logo' && (
              <LogoStep avatarUrl={avatarUrl} fromInstagram={answers.igUsername !== '' && answers.logoChoice !== 'upload'}
                onUploaded={(url) => { setAvatarUrl(url); setAnswers({ ...answers, logoChoice: 'upload' }) }}
                onUse={() => advance({ ...answers, logoChoice: answers.logoChoice === 'upload' ? 'upload' : 'instagram' })}
                onSkip={() => advance({ ...answers, logoChoice: 'none' })} onError={setError} />
            )}
          </div>

          {error && (
            <div className="mt-6">
              <Notice tone="error">{error}</Notice>
            </div>
          )}
        </div>

        <footer className="sticky bottom-0 border-t border-hairline bg-bg/90 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-3">
            <button type="button" onClick={() => index > 0 && go(steps[index - 1])} disabled={index === 0 || pending} className={GHOST}>
              <ArrowLeft size={16} aria-hidden="true" />
              {t('wizard.back')}
            </button>
            <div className="flex items-center gap-3">
              {step === 'website' && (
                <button type="button" onClick={() => advance({ ...answers, website: '' })} className={GHOST}>
                  {t('wizard.skip')}
                </button>
              )}
              {step !== 'logo' && !(step === 'confirm' && lookup) && (
                <button type="submit" disabled={!answered || pending} aria-busy={pending} className={PRIMARY}>
                  {step === 'instagram' && pending ? t('flow.instagram.searching') : t('wizard.next')}
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </footer>
      </form>
    </Shell>
  )
}

function Shell({ index, total, children }: { index: number; total: number; children: ReactNode }) {
  const t = useTranslations('onboarding')
  return (
    <div className="fixed inset-0 flex flex-col overflow-y-auto bg-bg">
      <header className="sticky top-0 z-10 border-b border-hairline bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-5">
          <CarouselyLogo />
          <LocaleToggle variant="landing" className="ml-auto" />
        </div>
        <div className="h-0.5 bg-hairline" role="progressbar" aria-label={t('wizard.progress')} aria-valuemin={1} aria-valuemax={total} aria-valuenow={index + 1}>
          <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${((index + 1) / total) * 100}%` }} />
        </div>
      </header>
      {children}
    </div>
  )
}

/** Why and how to log in with Instagram: what it opens, and how to tell a business or creator account. */
function InstagramCallout() {
  const t = useTranslations('onboarding')
  return (
    <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4">
      <p className="font-medium text-ink">{t('flow.instagram.calloutTitle')}</p>
      <ul className="mt-2 space-y-1.5 text-sm text-ink">
        {(['bonusContent', 'bonusPublish', 'bonusBrand'] as const).map((key) => (
          <li key={key} className="flex gap-2">
            <Check size={16} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
            {t(`flow.instagram.${key}`, { count: TRIAL_CONTENTS_CONNECTED })}
          </li>
        ))}
      </ul>
      <a href={INSTAGRAM_LOGIN_HREF} className={`${SECONDARY} mt-3 w-full sm:w-auto`}>
        <InstagramIcon width={16} height={16} aria-hidden="true" />
        {t('flow.instagram.login')}
      </a>
      <p className="mt-3 text-xs text-pretty text-ink-muted">
        {t.rich('flow.instagram.check', { b: (chunks) => <strong className="font-semibold text-ink">{chunks}</strong> })}
      </p>
    </div>
  )
}

interface ConfirmProps {
  lookup: LookupAnswer | null
  confirmed: string
  avatarUrl: string | null
  pending: boolean
  onYes: () => void
  onChange: () => void
  onNone: () => void
  /** What the user typed, and the way on with it when Instagram could not be read. */
  handle: string
  onKeep: () => void
}

function ConfirmAccount({ lookup, confirmed, avatarUrl, pending, handle, onYes, onChange, onNone, onKeep }: ConfirmProps) {
  const t = useTranslations('onboarding')
  const locale = useLocale()
  if (!lookup) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-hairline bg-white p-4">
        <Avatar url={avatarUrl} name={confirmed} />
        <p className="font-medium text-ink">@{confirmed}</p>
        <button type="button" onClick={onChange} className={`${GHOST} ml-auto`}>{t('flow.confirm.change')}</button>
      </div>
    )
  }
  if (!isProfile(lookup)) {
    return (
      <div className="flex flex-col gap-3 sm:flex-row">
        {/* Instagram could not be read, which says nothing about the username: the user may go on with it. */}
        {(lookup.status === 'failed' || lookup.status === 'limited') && (
          <button type="button" onClick={onKeep} disabled={pending} aria-busy={pending} className={PRIMARY}>
            {t('flow.confirm.keep', { username: handle.trim().replace(/^@+/, '') })}
          </button>
        )}
        <button type="button" onClick={onChange} disabled={pending} className={lookup.status === 'failed' || lookup.status === 'limited' ? SECONDARY : PRIMARY}>{t('flow.confirm.retry')}</button>
        <button type="button" onClick={onNone} disabled={pending} className={SECONDARY}>{t('flow.confirm.without')}</button>
      </div>
    )
  }
  const { profile } = lookup
  const compact = new Intl.NumberFormat(locale === 'en' ? 'en' : 'id', { notation: 'compact', maximumFractionDigits: 1 })
  return (
    <>
      <div className="rounded-2xl border border-hairline bg-white p-5">
        <div className="flex items-center gap-4">
          <Avatar url={lookup.avatarUrl} name={profile.name || profile.username} large />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-lg font-semibold text-ink">
              {profile.name || `@${profile.username}`}
              {profile.verified && <BadgeCheck size={18} className="shrink-0 text-accent" aria-label={t('flow.confirm.verified')} />}
            </p>
            <p className="truncate text-sm text-ink-muted">@{profile.username}</p>
            {(profile.followers !== null || profile.postsCount !== null) && (
              <p className="mt-1 text-sm text-ink-muted">
                {[
                  profile.followers !== null && t('flow.confirm.followers', { count: compact.format(profile.followers) }),
                  profile.postsCount !== null && t('flow.confirm.posts', { count: compact.format(profile.postsCount) }),
                ].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>
        {profile.bio && <p className="mt-4 line-clamp-4 text-sm whitespace-pre-line text-ink">{profile.bio}</p>}
        {lookup.status === 'private' && <p className="mt-4 rounded-xl bg-zinc-100 px-3 py-2 text-sm text-ink-muted">{t('flow.confirm.privateNote')}</p>}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={onYes} disabled={pending} aria-busy={pending} className={`${PRIMARY} sm:flex-1`}>
          <Check size={16} aria-hidden="true" />
          {t('flow.confirm.yes')}
        </button>
        <button type="button" onClick={onChange} disabled={pending} className={`${SECONDARY} sm:flex-1`}>{t('flow.confirm.no')}</button>
      </div>
    </>
  )
}

function Avatar({ url, name, large = false }: { url: string | null; name: string; large?: boolean }) {
  const size = large ? 'size-20 text-2xl' : 'size-12 text-lg'
  if (!url) {
    return (
      <span className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-accent/10 font-semibold text-accent`} aria-hidden="true">
        {name.replace(/^@/, '').charAt(0).toUpperCase() || '?'}
      </span>
    )
  }
  // A signed link to our own storage, shown once: next/image would need that host configured.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className={`${size} shrink-0 rounded-full border border-hairline object-cover`} />
}

interface ChoicesProps<T extends string | number> {
  label: string
  options: readonly T[]
  value: string | number
  text: (option: T) => string
  onPick: (option: T) => void
  columns?: 2 | 3
}

/** The answers of a one-tap question, as large cards. */
function Choices<T extends string | number>({ label, options, value, text, onPick, columns = 2 }: ChoicesProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={`grid grid-cols-1 gap-3 ${columns === 3 ? 'sm:grid-cols-3' : 'min-[360px]:grid-cols-2'}`}>
      {options.map((option) => (
        <OptionCard key={option} selected={value === option} onSelect={() => onPick(option)} label={text(option)} />
      ))}
    </div>
  )
}

const isReadySource = (value: string) => (REFERRAL_SOURCES as readonly string[]).includes(value)

function ReferralStep({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const t = useTranslations('onboarding')
  // "Lainnya" stays chosen even while its text is still empty.
  const [other, setOther] = useState(value !== '' && !isReadySource(value))
  const [otherText, setOtherText] = useState(other ? value : '')

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label={t('wizard.source')} className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:grid-cols-3">
        {REFERRAL_SOURCES.map((source) => (
          <OptionCard
            key={source}
            selected={!other && value === source}
            onSelect={() => {
              setOther(false)
              onChange(source)
            }}
            label={t(`sources.${source}`)}
          />
        ))}
        <OptionCard
          selected={other}
          onSelect={() => {
            setOther(true)
            onChange(otherText)
          }}
          label={t('wizard.other')}
        />
      </div>
      {other && (
        <label className="block animate-fade-in space-y-1.5">
          <span className="text-sm font-medium text-ink">{t('wizard.where')}</span>
          <input
            autoFocus
            value={otherText}
            onChange={(event) => {
              setOtherText(event.target.value)
              onChange(event.target.value)
            }}
            maxLength={REFERRAL_MAX_LENGTH}
            placeholder={t('wizard.sourcePlaceholder')}
            className={FIELD}
          />
        </label>
      )}
    </div>
  )
}

function OptionCard({ selected, onSelect, label }: { selected: boolean; onSelect: () => void; label: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`relative flex min-h-20 items-center justify-center rounded-xl border bg-white px-4 py-5 text-center font-medium text-balance text-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        selected ? 'border-accent ring-1 ring-accent' : 'border-hairline hover:border-zinc-300'
      }`}
    >
      {label}
      {selected && <Check size={16} className="absolute top-3 right-3 text-accent" aria-hidden="true" />}
    </button>
  )
}

interface LogoProps {
  avatarUrl: string | null
  /** Whether the picture shown is the Instagram profile picture, not an upload. */
  fromInstagram: boolean
  onUploaded: (url: string) => void
  onUse: () => void
  onSkip: () => void
  onError: (message: string | null) => void
}

function LogoStep({ avatarUrl, fromInstagram, onUploaded, onUse, onSkip, onError }: LogoProps) {
  const t = useTranslations('onboarding')
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function upload(file: File | undefined) {
    if (!file) return
    setUploading(true)
    onError(null)
    const form = new FormData()
    form.set('logo', file)
    const result = await uploadLogoAction(form).catch(() => ({ error: t('wizard.failed') }))
    setUploading(false)
    if ('error' in result) onError(result.error)
    else onUploaded(result.url)
  }

  return (
    <>
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-hairline bg-white p-6">
        {avatarUrl ? (
          // A signed link to our own storage, shown once.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt={t('flow.logo.alt')} className="size-32 rounded-2xl border border-hairline object-cover" />
        ) : (
          <span className="flex size-32 items-center justify-center rounded-2xl bg-zinc-100 text-ink-soft"><ImageUp size={32} aria-hidden="true" /></span>
        )}
        <p className="text-sm text-ink-muted">{avatarUrl ? (fromInstagram ? t('flow.logo.fromInstagram') : t('flow.logo.uploaded')) : t('flow.logo.empty')}</p>
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1}
        onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = '' }} />
      <div className="flex flex-col gap-3 sm:flex-row">
        {avatarUrl && (
          <button type="button" onClick={onUse} disabled={uploading} className={`${PRIMARY} sm:flex-1`}>
            <Check size={16} aria-hidden="true" />
            {t('flow.logo.use')}
          </button>
        )}
        <button type="button" onClick={() => input.current?.click()} disabled={uploading} aria-busy={uploading} className={`${avatarUrl ? SECONDARY : PRIMARY} sm:flex-1`}>
          <ImageUp size={16} aria-hidden="true" />
          {uploading ? t('flow.logo.uploading') : t('flow.logo.upload')}
        </button>
      </div>
      <button type="button" onClick={onSkip} disabled={uploading} className="text-sm font-medium text-ink-muted underline underline-offset-4 hover:text-ink">
        {t('flow.logo.skip')}
      </button>
    </>
  )
}

interface FinishingProps {
  answers: OnboardingAnswers
  avatarUrl: string | null
  onBack: () => void
  onDone: (href: string) => void
}

/** The last screen: saves, lets Mimo read the brand, and moves on to the first free carousel. */
function Finishing({ answers, avatarUrl, onBack, onDone }: FinishingProps) {
  const t = useTranslations('onboarding')
  const [next, setNext] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [shown, setShown] = useState(1)
  const lines = (['profile', answers.website ? 'website' : null, 'strategy', 'ready'] as const).filter((line) => line !== null)

  useEffect(() => {
    let live = true
    void (async () => {
      const result = await saveOnboardingAction(answers, true).catch(() => ({ error: t('wizard.failed') }))
      if (!live) return
      if ('error' in result) {
        setError(result.error)
        return
      }
      setNext(result.next)
      const until = Date.now() + READY_WAIT_MS
      while (live && Date.now() < until) {
        await new Promise((resolve) => window.setTimeout(resolve, READY_POLL_MS))
        if (await brandReadyAction().catch(() => true)) break
      }
      if (live) onDone(result.next)
    })()
    return () => {
      live = false
    }
    // Once per try, for the answers the user finished with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt])

  useEffect(() => {
    const timer = window.setInterval(() => setShown((count) => Math.min(lines.length, count + 1)), 4_000)
    return () => window.clearInterval(timer)
  }, [lines.length])

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 animate-fade-in flex-col items-center px-5 py-12 text-center sm:py-20">
      <Avatar url={avatarUrl} name={answers.name || answers.igUsername || 'C'} large />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight text-balance text-ink sm:text-3xl">{t('flow.done.title')}</h1>
      <p className="mt-2 text-pretty text-ink-muted">{t('flow.done.hint', { contents: TRIAL_CONTENTS, chats: TRIAL_CHAT_MESSAGES })}</p>
      {error ? (
        <div className="mt-8 w-full space-y-4 text-left">
          <Notice tone="error">{error}</Notice>
          <div className="flex justify-center gap-3">
            <button type="button" onClick={onBack} className={SECONDARY}>{t('wizard.back')}</button>
            <button type="button" onClick={() => { setError(null); setAttempt((count) => count + 1) }} className={PRIMARY}>{t('flow.done.retry')}</button>
          </div>
        </div>
      ) : (
        <>
          <ul className="mt-8 w-full max-w-sm space-y-3 text-left" aria-live="polite">
            {lines.slice(0, shown).map((line, position) => (
              <li key={line} className="flex animate-fade-in items-center gap-3 text-ink">
                {position < shown - 1
                  ? <Check size={18} className="shrink-0 text-emerald-600" aria-hidden="true" />
                  : <span className="size-[18px] shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden="true" />}
                {t(`flow.done.lines.${line}`)}
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => next && onDone(next)} disabled={!next} className={`${PRIMARY} mt-10`}>
            {t('flow.done.start')}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  )
}
