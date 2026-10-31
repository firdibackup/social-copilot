'use server'

import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { authClient } from '@/lib/auth'
import { describeError } from '@/lib/errors'
import { appUrl } from '@/lib/env'
import { safeNext } from '@/lib/params'

export interface AuthState {
  error: string | null
  /** Typed back into the form, which React resets after every submit. */
  email?: string
}

const MIN_PASSWORD = 8

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '')

export async function signInWithGoogle(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const t = await getTranslations('auth.form')
  let url: string | null = null
  try {
    const { data, error } = await (await authClient()).auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: appUrl('/auth/callback', { next: safeNext(formData.get('next')) }),
        queryParams: { prompt: 'select_account' },
      },
    })
    if (error) throw error
    url = data.url
  } catch (error) {
    console.error('[auth] Google gagal dimulai:', describeError(error))
    return { error: t('googleUnavailable') }
  }
  if (!url) return { error: t('unreachable') }
  redirect(url)
}

export async function signIn(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const t = await getTranslations('auth.form')
  const email = field(formData, 'email').trim()
  const password = field(formData, 'password')
  if (!email || !password) return { error: t('required'), email }

  const { error } = await (await authClient()).auth.signInWithPassword({ email, password })
  if (error) {
    if (error.code === 'invalid_credentials') return { error: t('credentials'), email }
    if (error.code === 'email_not_confirmed') return { error: t('inactive'), email }
    console.error('[auth] masuk gagal:', describeError(error))
    return { error: t('unreachable'), email }
  }
  redirect(safeNext(formData.get('next')))
}

export async function signUp(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const t = await getTranslations('auth.form')
  const email = field(formData, 'email').trim()
  const password = field(formData, 'password')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: t('invalidEmail'), email }
  if (password.length < MIN_PASSWORD) return { error: t('minPassword', { count: MIN_PASSWORD }), email }
  if (password !== field(formData, 'confirm')) return { error: t('mismatch'), email }

  const { data, error } = await (await authClient()).auth.signUp({ email, password })
  if (error) {
    if (error.code === 'user_already_exists' || error.code === 'email_exists') {
      return { error: t('exists'), email }
    }
    if (error.code === 'weak_password') return { error: t('weak'), email }
    if (error.code === 'signup_disabled') return { error: t('closed'), email }
    console.error('[auth] daftar gagal:', describeError(error))
    return { error: t('unreachable'), email }
  }
  // Without auto confirm, Supabase would wait for an email link; there is no SMTP to send one.
  if (!data.session) return { error: t('createdInactive'), email }
  redirect('/langganan')
}

export async function signOut(): Promise<void> {
  const { error } = await (await authClient()).auth.signOut({ scope: 'local' })
  if (error) console.error('[auth] keluar gagal:', describeError(error))
  redirect('/masuk')
}
