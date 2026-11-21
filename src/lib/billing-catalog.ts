import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import { assertPayableTotals, parseBillingCatalog } from './billing-catalog-options'
import { db, unwrap } from './supabase'

/** Tag of the cached copy the public pages show; saving the catalog expires it. */
export const BILLING_CATALOG_TAG = 'billing-catalog'

export async function getBillingCatalog() {
  const row = unwrap(await db().from('billing_catalog').select('version, config').eq('id', true).single()) as { version: number; config: unknown }
  return { version: row.version, catalog: parseBillingCatalog(row.config) }
}

/**
 * The catalog for display only (landing pricing, legal terms), cached so those pages don't wait on the database.
 * Anything that charges or checks credits must call getBillingCatalog().
 */
export async function getDisplayedBillingCatalog() {
  'use cache'
  cacheLife('minutes')
  cacheTag(BILLING_CATALOG_TAG)
  return (await getBillingCatalog()).catalog
}
export async function saveBillingCatalog(adminId: string, version: number, input: unknown): Promise<void> {
  const config = parseBillingCatalog(input)
  assertPayableTotals(config)
  const saved = unwrap(await db().rpc('save_billing_catalog', { p_admin: adminId, p_version: version, p_config: config }))
  if (!saved) throw new Error('Pengaturan sudah diubah di tab lain. Muat ulang sebelum menyimpan.')
}
