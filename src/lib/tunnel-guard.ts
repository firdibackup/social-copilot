const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]'])
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

/** Paths Meta must reach through the public tunnel, plus the privacy policy the Meta app links to. Everything else is local-only. */
const PUBLIC_PATHS = new Set([
  '/api/auth/instagram/callback',
  '/api/auth/facebook/callback',
  '/api/webhooks/instagram',
  '/privasi',
])

const isLoopbackHost = (host: string) => LOOPBACK_HOSTNAMES.has(host.trim().toLowerCase().replace(/:\d+$/, ''))

/**
 * True when the request comes from this machine, not through the ngrok tunnel.
 * Next itself sets `x-forwarded-for` to the socket address (loopback for local
 * requests); ngrok sets it to the public client IP, so every hop must be loopback.
 */
export function isLocalRequest(headers: Headers): boolean {
  const host = headers.get('host')
  if (!host || !isLoopbackHost(host)) return false

  const forwardedHost = headers.get('x-forwarded-host')
  if (forwardedHost && !forwardedHost.split(',').every(isLoopbackHost)) return false

  const forwardedFor = headers.get('x-forwarded-for')
  return !forwardedFor || forwardedFor.split(',').every((ip) => LOOPBACK_ADDRESSES.has(ip.trim()))
}

export function isAllowedRequest(headers: Headers, pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname) || isLocalRequest(headers)
}
