import 'server-only'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { imageType, MAX_IMAGE_BYTES, type ImageType } from './image'

const TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 4
const USER_AGENT = 'Mozilla/5.0 (compatible; Carousely/1.0)'

/** A page or file outside the app could not be fetched. The message is safe to show to the owner. */
export class RemoteFetchError extends Error {
  override name = 'RemoteFetchError'
}

const PRIVATE_IPV4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^(22[4-9]|23\d)\./,
  /^255\.255\.255\.255$/,
]

const normalizedAddress = (address: string) => address.toLowerCase().replace(/^\[|\]$/g, '').replace(/^::ffff:/, '')

export function isPublicAddress(address: string): boolean {
  const value = normalizedAddress(address)
  const family = isIP(value)
  if (family === 4) return !PRIVATE_IPV4.some((range) => range.test(value))
  if (family === 6) return !/^(::|::1$|f[cd]|fe[89ab]|ff)/.test(value)
  return false
}

/** False for hosts that are explicitly local, private or not fully qualified. */
export function isPublicHost(hostname: string): boolean {
  const host = normalizedAddress(hostname)
  if (host === 'localhost' || /\.(localhost|local|internal)$/.test(host)) return false
  if (isIP(host)) return isPublicAddress(host)
  return host.includes('.')
}

async function assertPublicDns(hostname: string): Promise<void> {
  if (isIP(normalizedAddress(hostname))) return
  let addresses: { address: string }[]
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true })
  } catch {
    throw new RemoteFetchError('Alamat website tidak ditemukan.')
  }
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new RemoteFetchError('Alamat jaringan lokal atau privat tidak diambil.')
  }
}

function checkedUrl(input: string | URL, base?: URL): URL {
  let url: URL
  try {
    url = new URL(input, base)
  } catch {
    throw new RemoteFetchError('Alamatnya tidak valid.')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new RemoteFetchError('Hanya alamat http atau https.')
  if (url.username || url.password || !isPublicHost(url.hostname)) {
    throw new RemoteFetchError('Alamat jaringan lokal atau privat tidak diambil.')
  }
  return url
}

async function readLimited(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length'))
  if (declared > maxBytes) throw new RemoteFetchError('Ukurannya melebihi batas.')
  if (!response.body) return new Uint8Array()

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > maxBytes) {
      await reader.cancel()
      throw new RemoteFetchError('Ukurannya melebihi batas.')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}

export interface FetchPublicOptions {
  allowedHostname?: string
}

export interface Fetched {
  bytes: Uint8Array
  contentType: string
  /** Where the last redirect ended. */
  url: string
}

/**
 * GETs a public URL, checking every redirect hop itself. Errors carry no URL: Instagram CDN links are signed.
 */
export async function fetchPublic(input: string, maxBytes: number, options: FetchPublicOptions = {}): Promise<Fetched> {
  let url = checkedUrl(input)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (options.allowedHostname && url.hostname !== options.allowedHostname) {
      throw new RemoteFetchError('Redirect keluar dari domain website tidak diikuti.')
    }
    await assertPublicDns(url.hostname)
    const response = await fetch(url, {
      redirect: 'manual',
      headers: { 'user-agent': USER_AGENT, accept: '*/*' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch((error: unknown) => {
      const timedOut = error instanceof Error && error.name === 'TimeoutError'
      throw new RemoteFetchError(timedOut ? 'Terlalu lama menjawab.' : 'Tidak bisa dihubungi.')
    })
    const location = response.headers.get('location')
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel()
      url = checkedUrl(location, url)
      continue
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new RemoteFetchError(`Server menjawab HTTP ${response.status}.`)
    }
    const bytes = await readLimited(response, maxBytes)
    return { bytes, contentType: response.headers.get('content-type') ?? '', url: url.toString() }
  }
  throw new RemoteFetchError('Terlalu banyak redirect.')
}

/** A JPEG, PNG or WebP, judged by its bytes. */
export async function fetchImage(input: string, maxBytes = MAX_IMAGE_BYTES): Promise<{ bytes: Uint8Array; type: ImageType }> {
  const { bytes } = await fetchPublic(input, maxBytes)
  const type = imageType(bytes)
  if (!type) throw new RemoteFetchError('File itu bukan gambar JPEG, PNG, atau WebP.')
  return { bytes, type }
}
