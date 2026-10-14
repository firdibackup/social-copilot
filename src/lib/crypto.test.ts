import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { decryptToken, encryptToken } from './crypto'

describe('token encryption', () => {
  beforeEach(() => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', randomBytes(32).toString('base64'))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('round-trips a token', () => {
    expect(decryptToken(encryptToken('IGAA-test-token'))).toBe('IGAA-test-token')
  })

  it('uses a fresh IV for every encryption', () => {
    expect(encryptToken('same')).not.toBe(encryptToken('same'))
  })

  it('does not contain the plaintext', () => {
    expect(encryptToken('IGAA-test-token')).not.toContain('IGAA')
  })

  it('rejects a tampered ciphertext', () => {
    const [version, iv, tag, data] = encryptToken('IGAA-test-token').split(':')
    const flipped = Buffer.from(data, 'base64')
    flipped[0] ^= 0xff
    const tampered = [version, iv, tag, flipped.toString('base64')].join(':')
    expect(() => decryptToken(tampered)).toThrow()
  })

  it('rejects ciphertext encrypted with another key', () => {
    const encrypted = encryptToken('IGAA-test-token')
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', randomBytes(32).toString('base64'))
    expect(() => decryptToken(encrypted)).toThrow()
  })

  it('rejects a key that is not 32 bytes', () => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', randomBytes(16).toString('base64'))
    expect(() => encryptToken('x')).toThrow(/32 byte/)
  })

  it('rejects an unknown payload format', () => {
    expect(() => decryptToken('plain-token')).toThrow(/format/i)
  })
})
