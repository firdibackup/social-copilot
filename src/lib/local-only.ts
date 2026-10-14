import 'server-only'
import { headers } from 'next/headers'
import { isLocalRequest } from './tunnel-guard'

/** Server actions are POSTs to the page route, so each one checks here too rather than trusting proxy.ts alone. */
export async function assertLocalRequest(): Promise<void> {
  if (!isLocalRequest(await headers())) throw new Error('Tidak diizinkan')
}
