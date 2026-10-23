'use server'

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
const UNREACHABLE = 'Layanan login tidak bisa dihubungi. Coba lagi sebentar lagi.'

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '')

export async function signInWithGoogle(_previous: AuthState, formData: FormData): Promise<AuthState> {
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
    return { error: 'Login Google belum tersedia. Coba lagi atau masuk dengan email.' }
  }
  if (!url) return { error: UNREACHABLE }
  redirect(url)
}

export async function signIn(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const email = field(formData, 'email').trim()
  const password = field(formData, 'password')
  if (!email || !password) return { error: 'Isi email dan password.', email }

  const { error } = await (await authClient()).auth.signInWithPassword({ email, password })
  if (error) {
    if (error.code === 'invalid_credentials') return { error: 'Email atau password salah.', email }
    if (error.code === 'email_not_confirmed') return { error: 'Akun ini belum aktif. Hubungi admin Carousely.', email }
    console.error('[auth] masuk gagal:', describeError(error))
    return { error: UNREACHABLE, email }
  }
  redirect(safeNext(formData.get('next')))
}

export async function signUp(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const email = field(formData, 'email').trim()
  const password = field(formData, 'password')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Email tidak valid.', email }
  if (password.length < MIN_PASSWORD) return { error: `Password minimal ${MIN_PASSWORD} karakter.`, email }
  if (password !== field(formData, 'confirm')) return { error: 'Password dan ulangi password tidak sama.', email }

  const { data, error } = await (await authClient()).auth.signUp({ email, password })
  if (error) {
    if (error.code === 'user_already_exists' || error.code === 'email_exists') {
      return { error: 'Email sudah terdaftar. Masuk saja.', email }
    }
    if (error.code === 'weak_password') return { error: 'Password terlalu lemah. Pakai kombinasi huruf dan angka.', email }
    if (error.code === 'signup_disabled') return { error: 'Pendaftaran sedang ditutup.', email }
    console.error('[auth] daftar gagal:', describeError(error))
    return { error: UNREACHABLE, email }
  }
  // Without auto confirm, Supabase would wait for an email link; there is no SMTP to send one.
  if (!data.session) return { error: 'Akun dibuat, tapi belum aktif. Hubungi admin Carousely.', email }
  redirect('/pengaturan?billing=pilih')
}

export async function signOut(): Promise<void> {
  const { error } = await (await authClient()).auth.signOut({ scope: 'local' })
  if (error) console.error('[auth] keluar gagal:', describeError(error))
  redirect('/masuk')
}
