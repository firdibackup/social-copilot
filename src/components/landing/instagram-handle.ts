const HANDLE = /^[A-Za-z0-9._]{1,30}$/

/** '@Kopi.Kita ' → 'Kopi.Kita'. Empty string means "no handle". */
export function normalizeHandle(value: string) {
  return value.trim().replace(/^@+/, '')
}

export function handleIssue(value: string): 'space' | 'invalid' | null {
  const handle = normalizeHandle(value)
  if (!handle) return null
  if (/\s/.test(handle)) return 'space'
  return HANDLE.test(handle) ? null : 'invalid'
}

/** Sign-up URL for the free trial; the handle rides along so onboarding can start from it. */
export function trialHref(value: string) {
  const handle = normalizeHandle(value)
  return handle ? `/daftar?instagram=${encodeURIComponent(handle)}` : '/daftar'
}
