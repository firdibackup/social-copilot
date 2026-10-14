export type SearchParams = Record<string, string | string[] | undefined>

export const firstValue = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Ids from the URL or a form: checked before they reach Postgres, which errors on a malformed uuid. */
export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)
