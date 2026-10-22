import 'server-only'
import { DEFAULT_DENSITY, toTextDensity, type TextDensity } from './density-options'
import { db, unwrap } from './supabase'

/** The account's default text density for new posts. */
export async function getDensityDefault(userId: string, accountId: string): Promise<TextDensity> {
  const row = unwrap(
    await db()
      .from('schedule_settings')
      .select('text_density')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .maybeSingle(),
  ) as { text_density: string | null } | null
  return row ? toTextDensity(row.text_density) : DEFAULT_DENSITY
}

/** Leaves the slots alone: a row made here keeps following the Brand strategy. */
export async function setDensityDefault(userId: string, accountId: string, density: TextDensity): Promise<void> {
  unwrap(
    await db()
      .from('schedule_settings')
      .upsert(
        { user_id: userId, account_id: accountId, text_density: density, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,account_id' },
      ),
  )
}
