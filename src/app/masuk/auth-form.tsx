'use client'

import { useTranslations } from 'next-intl'
import { LocaleToggle } from '@/components/locale-toggle'
import Link from 'next/link'
import { useActionState, type ReactNode } from 'react'
import { CarouselyLogo } from '@/components/brand-mark'
import { Notice } from '@/components/notice'
import { signIn, signInWithGoogle, signUp } from './actions'

const LABEL = 'block space-y-1 text-sm font-medium text-zinc-900'
const FIELD =
  'block w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-normal text-zinc-900 focus:outline-none'
const PRIMARY_BUTTON =
  'flex w-full justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-50'



export function AuthCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-end"><LocaleToggle variant="landing" /></div>
        <header className="space-y-2 text-center">
          <CarouselyLogo size={36} className="justify-center" />
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{title}</h1>
          <p className="text-sm text-zinc-500">{description}</p>
        </header>
        <div className="rounded-2xl border border-hairline bg-paper p-6">{children}</div>
      </div>
    </main>
  )
}

export function AuthForm({ mode, next, oauthError }: { mode: 'masuk' | 'daftar'; next?: string; oauthError?: string }) {
  const t = useTranslations('auth.form')
  const MODES = {
    masuk: {
      action: signIn,
      submit: t('login'),
      question: t('noAccount'),
      other: { href: '/daftar', label: t('signup') },
    },
    daftar: {
      action: signUp,
      submit: t('signup'),
      question: t('haveAccount'),
      other: { href: '/masuk', label: t('login') },
    },
  } as const
  const { action, submit, question, other } = MODES[mode]
  const [state, formAction, pending] = useActionState(action, { error: null })
  const [googleState, googleAction, googlePending] = useActionState(signInWithGoogle, { error: null })
  const isSignUp = mode === 'daftar'

  return (
    <div className="space-y-4">
      <form action={googleAction} className="space-y-3">
        {next && <input type="hidden" name="next" value={next} />}
        {(googleState.error || oauthError) && <Notice tone="error">{googleState.error || oauthError}</Notice>}
        <button type="submit" disabled={pending || googlePending} aria-busy={googlePending}
          className="flex min-h-11 w-full items-center justify-center gap-3 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50">
          <svg viewBox="0 0 48 48" className="size-5 shrink-0" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.02 46.98 31.86 46.98 24.55Z" />
            <path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
          </svg>
          {googlePending ? t('googleConnecting') : isSignUp ? t('googleSignup') : t('googleLogin')}
        </button>
      </form>
      <div className="flex items-center gap-3 text-xs text-zinc-500">
        <span className="h-px flex-1 bg-hairline" />
        <span>{t('emailAlternative')}</span>
        <span className="h-px flex-1 bg-hairline" />
      </div>
    <form action={formAction} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <label className={LABEL}>
        <span>{t('email')}</span>
        <input name="email" type="email" required autoComplete="email" defaultValue={state.email} className={FIELD} />
      </label>
      <label className={LABEL}>
        <span>{t('password')}</span>
        <input
          name="password"
          type="password"
          required
          minLength={isSignUp ? 8 : undefined}
          autoComplete={isSignUp ? 'new-password' : 'current-password'}
          className={FIELD}
        />
      </label>
      {isSignUp && (
        <label className={LABEL}>
          <span>{t('confirm')}</span>
          <input name="confirm" type="password" required minLength={8} autoComplete="new-password" className={FIELD} />
        </label>
      )}
      <button type="submit" disabled={pending || googlePending} className={PRIMARY_BUTTON}>
        {pending ? t('processing') : submit}
      </button>
      <p className="text-center text-sm text-zinc-600">
        {question}{' '}
        <Link href={other.href} className="font-medium text-zinc-900 underline">
          {other.label}
        </Link>
      </p>
    </form>
    </div>
  )
}
