import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from './proxy'

const session = vi.hoisted(() => ({ userId: null as string | null, email: 'pengguna@example.com' }))

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getClaims: async () => ({
        data: session.userId ? { claims: { sub: session.userId, email: session.email } } : null,
        error: null,
      }),
    },
  }),
}))

const ORIGIN = 'https://social-copilot.ngrok-free.app'
const visit = (path: string) => proxy(new NextRequest(`${ORIGIN}${path}`))

beforeEach(() => {
  session.userId = null
  session.email = 'pengguna@example.com'
  vi.stubEnv('ADMIN_EMAILS', 'Owner@Example.com')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('proxy', () => {
  it('serves the public landing page with or without a session', async () => {
    for (const userId of [null, 'user-1']) {
      session.userId = userId
      const response = await visit('/')
      expect(response.headers.get('location')).toBeNull()
      expect(response.headers.get('x-middleware-next')).toBe('1')
    }
  })

  it('rewrites the OAuth return on the bare domain to the callback route', async () => {
    const response = await visit('/?code=abc&state=xyz')
    expect(response.headers.get('x-middleware-rewrite')).toBe(`${ORIGIN}/api/auth/instagram/callback?code=abc&state=xyz`)
  })

  it('rewrites a denied OAuth return too', async () => {
    const response = await visit('/?error=access_denied&state=xyz')
    expect(response.headers.get('x-middleware-rewrite')).toBe(`${ORIGIN}/api/auth/instagram/callback?error=access_denied&state=xyz`)
  })

  it('sends visitors without a session to sign in, remembering where they were going', async () => {
    const response = await visit('/kalender?tampilan=daftar')
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(`${ORIGIN}/masuk?next=%2Fkalender%3Ftampilan%3Ddaftar`)
  })

  it('lets visitors without a session reach sign in, the privacy page and the webhook', async () => {
    for (const path of ['/masuk', '/daftar', '/privasi', '/auth/callback?code=google-code', '/api/webhooks/instagram']) {
      const response = await visit(path)
      expect(response.headers.get('location'), path).toBeNull()
      expect(response.headers.get('x-middleware-next'), path).toBe('1')
    }
  })

  it('lets a signed-in user through and sends them past the sign-in pages', async () => {
    session.userId = 'user-1'
    expect((await visit('/kalender')).headers.get('x-middleware-next')).toBe('1')
    expect((await visit('/masuk')).headers.get('location')).toBe(`${ORIGIN}/kalender`)
  })

  it('answers the admin pages with the not-found route for anyone but an admin', async () => {
    session.userId = 'user-1'
    for (const path of ['/admin', '/admin/pengguna?id=x', '/admin/pengaturan']) {
      expect((await visit(path)).headers.get('x-middleware-rewrite'), path).toBe(`${ORIGIN}/_tidak-ditemukan`)
    }
    expect((await visit('/administrasi')).headers.get('x-middleware-rewrite')).toBeNull()

    vi.stubEnv('ADMIN_EMAILS', '')
    session.email = ''
    expect((await visit('/admin')).headers.get('x-middleware-rewrite')).toBe(`${ORIGIN}/_tidak-ditemukan`)
  })

  it('lets an admin reach the admin pages, whatever the case of the email', async () => {
    session.userId = 'admin-1'
    session.email = 'owner@example.com'
    const response = await visit('/admin/pengguna')
    expect(response.headers.get('x-middleware-rewrite')).toBeNull()
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('still sends visitors without a session from the admin pages to sign in', async () => {
    expect((await visit('/admin')).headers.get('location')).toBe(`${ORIGIN}/masuk?next=%2Fadmin`)
  })
})
