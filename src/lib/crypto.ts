import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { env } from './env'
import { ConfigError } from './errors'

const ALGORITHM = 'aes-256-gcm'
const KEY_BYTES = 32
const IV_BYTES = 12
const AUTH_TAG_BYTES = 16
const FORMAT_VERSION = 'v1'

function encryptionKey(): Buffer {
  const key = Buffer.from(env('TOKEN_ENCRYPTION_KEY'), 'base64')
  if (key.length !== KEY_BYTES) throw new ConfigError('TOKEN_ENCRYPTION_KEY harus 32 byte (base64)')
  return key
}

/** Encrypts a token as `v1:<iv>:<auth tag>:<ciphertext>` (base64 parts). */
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv, { authTagLength: AUTH_TAG_BYTES })
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return [FORMAT_VERSION, iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64')).join(':')
}

export function decryptToken(payload: string): string {
  const [version, iv, authTag, ciphertext] = payload.split(':')
  if (version !== FORMAT_VERSION || !iv || !authTag || !ciphertext) {
    throw new Error('Format token terenkripsi tidak dikenal')
  }
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(iv, 'base64'), {
    authTagLength: AUTH_TAG_BYTES,
  })
  decipher.setAuthTag(Buffer.from(authTag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8')
}
