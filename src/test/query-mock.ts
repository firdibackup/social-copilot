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

/** Whether the recorded chain filtered `column` by `value`. */
export const filtered = (calls: unknown[][], column: string, value: unknown) =>
  calls.some((call) => call[0] === 'eq' && call[1] === column && call[2] === value)
