'use client'

import Link from 'next/link'
import { useActionState, type ReactNode } from 'react'
import { Notice } from '@/components/notice'
import { signIn, signUp } from './actions'

const LABEL = 'block space-y-1 text-sm font-medium text-zinc-900'
const FIELD =
  'block w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-normal text-zinc-900 focus:border-zinc-400 focus:outline-none'
const PRIMARY_BUTTON =
  'flex w-full justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50'

const MODES = {
  masuk: {
    action: signIn,
    submit: 'Masuk',
    question: 'Belum punya akun?',
    other: { href: '/daftar', label: 'Daftar' },
  },
  daftar: {
    action: signUp,
    submit: 'Daftar',
    question: 'Sudah punya akun?',
    other: { href: '/masuk', label: 'Masuk' },
  },
} as const

export function AuthCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <header className="space-y-2 text-center">
          <p className="font-semibold tracking-tight text-zinc-900">Social Copilot</p>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{title}</h1>
          <p className="text-sm text-zinc-500">{description}</p>
        </header>
        <div className="rounded-xl border border-zinc-200 bg-white p-6">{children}</div>
      </div>
    </main>
  )
}

export function AuthForm({ mode, next }: { mode: keyof typeof MODES; next?: string }) {
  const { action, submit, question, other } = MODES[mode]
  const [state, formAction, pending] = useActionState(action, { error: null })
  const isSignUp = mode === 'daftar'

  return (
    <form action={formAction} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <label className={LABEL}>
        <span>Email</span>
        <input name="email" type="email" required autoComplete="email" defaultValue={state.email} className={FIELD} />
      </label>
      <label className={LABEL}>
        <span>Password</span>
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
          <span>Ulangi password</span>
          <input name="confirm" type="password" required minLength={8} autoComplete="new-password" className={FIELD} />
        </label>
      )}
      <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
        {pending ? 'Memproses…' : submit}
      </button>
      <p className="text-center text-sm text-zinc-600">
        {question}{' '}
        <Link href={other.href} className="font-medium text-zinc-900 underline">
          {other.label}
        </Link>
      </p>
    </form>
  )
}
