export type SearchParams = Record<string, string | string[] | undefined>

export const firstValue = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Ids from the URL or a form: checked before they reach Postgres, which errors on a malformed uuid. */
export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)

/** Where to go after signing in: only a path on this site, since `//host` and `/\host` lead elsewhere. */
export const safeNext = (value: unknown): string =>
  typeof value === 'string' && /^\/(?![/\\])/.test(value) &&
  !Array.from(value).some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)
    ? value : '/kalender'
