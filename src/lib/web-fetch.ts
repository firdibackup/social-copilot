import 'server-only'
import { imageType, MAX_IMAGE_BYTES, type ImageType } from './image'

const TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 4
const USER_AGENT = 'Mozilla/5.0 (compatible; SocialCopilot/1.0)'

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
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // carrier-grade NAT
]

/**
 * False for loopback, private and link-local hosts written as such, so a website can't point the server at
 * itself or the LAN. ponytail: a public name that resolves to a private address still passes; resolve and
 * check the address before any deploy where the server sits next to services that matter.
 */
export function isPublicHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || /\.(localhost|local|internal)$/.test(host)) return false
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return !PRIVATE_IPV4.some((range) => range.test(host))
  if (host.includes(':')) return !/^(::1?|f[cd]|fe80|::ffff:)/.test(host)
  return host.includes('.')
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

export interface Fetched {
  bytes: Uint8Array
  contentType: string
  /** Where the last redirect ended. */
  url: string
}

/**
 * GETs a public URL, checking every redirect hop itself. Errors carry no URL: Instagram CDN links are signed.
 */
export async function fetchPublic(input: string, maxBytes: number): Promise<Fetched> {
  let url = checkedUrl(input)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
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
