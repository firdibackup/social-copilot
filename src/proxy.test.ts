import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from './proxy'

const session = vi.hoisted(() => ({ userId: null as string | null }))

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getClaims: async () => ({ data: session.userId ? { claims: { sub: session.userId } } : null, error: null }),
    },
  }),
}))

const ORIGIN = 'https://social-copilot.ngrok-free.app'
const visit = (path: string) => proxy(new NextRequest(`${ORIGIN}${path}`))

beforeEach(() => {
  session.userId = null
})

describe('proxy', () => {
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
    for (const path of ['/masuk', '/daftar', '/privasi', '/api/webhooks/instagram']) {
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
})
