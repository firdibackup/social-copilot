import { describe, expect, it } from 'vitest'
import { isAllowedRequest, isLocalRequest } from './tunnel-guard'

const NGROK_HOST = 'social-copilot.ngrok-free.app'
const PUBLIC_IP = '203.0.113.9'

const headers = (init: Record<string, string>) => new Headers(init)

describe('isLocalRequest', () => {
  it('accepts localhost with the loopback forwarded-for that Next adds', () => {
    expect(isLocalRequest(headers({ host: 'localhost:3000', 'x-forwarded-for': '::1' }))).toBe(true)
  })

  it('accepts 127.0.0.1 and [::1] hosts', () => {
    expect(isLocalRequest(headers({ host: '127.0.0.1:3000' }))).toBe(true)
    expect(isLocalRequest(headers({ host: '[::1]:3000', 'x-forwarded-for': '::ffff:127.0.0.1' }))).toBe(true)
  })

  it('rejects requests to the ngrok host', () => {
    expect(isLocalRequest(headers({ host: NGROK_HOST, 'x-forwarded-for': PUBLIC_IP }))).toBe(false)
  })

  it('rejects a localhost host forwarded from a public client', () => {
    expect(isLocalRequest(headers({ host: 'localhost:3000', 'x-forwarded-for': PUBLIC_IP }))).toBe(false)
  })

  it('rejects a spoofed loopback entry in a forwarded-for chain', () => {
    const spoofed = headers({ host: 'localhost:3000', 'x-forwarded-for': `127.0.0.1, ${PUBLIC_IP}` })
    expect(isLocalRequest(spoofed)).toBe(false)
  })

  it('rejects a public x-forwarded-host', () => {
    const rewritten = headers({ host: 'localhost:3000', 'x-forwarded-host': NGROK_HOST })
    expect(isLocalRequest(rewritten)).toBe(false)
  })

  it('rejects a request without a host header', () => {
    expect(isLocalRequest(headers({}))).toBe(false)
  })
})

describe('isAllowedRequest', () => {
  const tunnel = headers({ host: NGROK_HOST, 'x-forwarded-for': PUBLIC_IP })

  it('lets the Instagram OAuth callback through the tunnel', () => {
    expect(isAllowedRequest(tunnel, '/api/auth/instagram/callback')).toBe(true)
  })

  it('blocks dashboard pages and the OAuth start route through the tunnel', () => {
    expect(isAllowedRequest(tunnel, '/pengaturan')).toBe(false)
    expect(isAllowedRequest(tunnel, '/api/auth/instagram/start')).toBe(false)
    expect(isAllowedRequest(tunnel, '/api/auth/instagram/callback/../start')).toBe(false)
  })

  it('allows every path for local requests', () => {
    expect(isAllowedRequest(headers({ host: 'localhost:3000' }), '/pengaturan')).toBe(true)
  })
})
