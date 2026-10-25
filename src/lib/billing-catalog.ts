import 'server-only'
import { assertPayableTotals, parseBillingCatalog } from './billing-catalog-options'
import { db, unwrap } from './supabase'

export async function getBillingCatalog() {
  const row = unwrap(await db().from('billing_catalog').select('version, config').eq('id', true).single()) as { version: number; config: unknown }
  return { version: row.version, catalog: parseBillingCatalog(row.config) }
}
export async function saveBillingCatalog(adminId: string, version: number, input: unknown): Promise<void> {
  const config = parseBillingCatalog(input)
  assertPayableTotals(config)
  const saved = unwrap(await db().rpc('save_billing_catalog', { p_admin: adminId, p_version: version, p_config: config }))
  if (!saved) throw new Error('Pengaturan sudah diubah di tab lain. Muat ulang sebelum menyimpan.')
}
