'use server'

import { refresh } from 'next/cache'
import { requireAccount } from '@/lib/auth'
import { describeError } from '@/lib/errors'
import { saveSlots } from '@/lib/schedule'
import { parseSlots, type PostingSlot } from '@/lib/schedule-slots'

export type SlotsResult = { slots: PostingSlot[] } | { error: string }

/** The slot table on Pengaturan and in Kalender: saved on every change. Posts keep their times. */
export async function saveSlotsAction(input: unknown): Promise<SlotsResult> {
  const { userId, accountId } = await requireAccount()
  const parsed = parseSlots(input)
  if ('error' in parsed) return parsed
  try {
    await saveSlots(userId, accountId, parsed.slots)
  } catch (error) {
    console.error('[jadwal] slot gagal disimpan:', describeError(error))
    return { error: 'Slot gagal disimpan. Coba lagi.' }
  }
  refresh()
  return parsed
}
