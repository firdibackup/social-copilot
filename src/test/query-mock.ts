import { vi } from 'vitest'

/**
 * A stand-in for a postgrest-js query: every builder method records its arguments and returns the query again,
 * and awaiting it gives `result`. `calls` lists the chain, e.g. [['from', 'posts'], ['eq', 'user_id', 'u']].
 */
export function queryMock(result: unknown = { data: [], error: null }) {
  const calls: unknown[][] = []
  const query: Record<string, unknown> = {}
  for (const method of [
    'from', 'select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'in', 'is', 'gte', 'lt', 'order', 'limit',
    'maybeSingle', 'single', 'overrideTypes',
  ]) {
    query[method] = vi.fn((...args: unknown[]) => {
      calls.push([method, ...args])
      return query
    })
  }
  query.rpc = vi.fn(async (...args: unknown[]) => {
    calls.push(['rpc', ...args])
    return result
  })
  // Awaiting the chain resolves it, like postgrest-js's thenable builder.
  query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return { query, calls }
}

/**
 * A db() stand-in whose every `from()` starts a new chain answering with the next of `results` (the last one
 * repeats), and whose `storage.from()` bucket records uploads and removals.
 */
export function dbMock(results: unknown[]) {
  const chains: unknown[][][] = []
  const storage = {
    uploads: [] as string[],
    removed: [] as string[],
    upload: vi.fn(async (path: string) => {
      storage.uploads.push(path)
      return { data: { path }, error: null }
    }),
    remove: vi.fn(async (paths: string[]) => {
      storage.removed.push(...paths)
      return { data: [], error: null }
    }),
    download: vi.fn(async (path: string) => ({ data: new Blob([path]), error: null })),
    createSignedUrls: vi.fn(async (paths: string[]) => ({
      data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}` })),
      error: null,
    })),
  }
  const client = {
    from: vi.fn((table: string) => {
      const { query, calls } = queryMock(results[Math.min(chains.length, results.length - 1)])
      chains.push(calls)
      calls.push(['from', table])
      return query
    }),
    storage: { from: () => storage },
  }
  return { client, chains, storage }
}

/** Whether the recorded chain filtered `column` by `value`. */
export const filtered = (calls: unknown[][], column: string, value: unknown) =>
  calls.some((call) => call[0] === 'eq' && call[1] === column && call[2] === value)
