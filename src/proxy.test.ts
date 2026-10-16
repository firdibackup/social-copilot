import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from './proxy'

const TUNNEL = 'https://social-copilot.ngrok-free.app'

const throughTunnel = (path: string) =>
  proxy(new NextRequest(`${TUNNEL}${path}`, { headers: { host: 'social-copilot.ngrok-free.app', 'x-forwarded-for': '203.0.113.9' } }))

describe('proxy', () => {
  it('rewrites the OAuth return on the bare domain to the callback route', () => {
    const response = throughTunnel('/?code=abc&state=xyz')
    expect(response.headers.get('x-middleware-rewrite')).toBe(`${TUNNEL}/api/auth/instagram/callback?code=abc&state=xyz`)
  })

  it('rewrites a denied OAuth return too', () => {
    const response = throughTunnel('/?error=access_denied&state=xyz')
    expect(response.headers.get('x-middleware-rewrite')).toBe(`${TUNNEL}/api/auth/instagram/callback?error=access_denied&state=xyz`)
  })

  it('still hides the bare domain without OAuth params', () => {
    expect(throughTunnel('/').status).toBe(404)
    expect(throughTunnel('/?state=xyz').status).toBe(404)
  })
})
