/** Missing or invalid configuration. The message is safe to show to the owner. */
export class ConfigError extends Error {
  override name = 'ConfigError'
}

/**
 * One-line description for server logs. Never log request URLs instead:
 * Graph API GET requests carry the access token in the query string.
 */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return 'Unknown error'
  const code = 'code' in error && error.code != null ? ` (code ${String(error.code)})` : ''
  return `${error.name}: ${error.message}${code}`
}
