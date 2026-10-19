'use server'

import { requireUser } from '@/lib/auth'
import { describeError } from '@/lib/errors'
import { markAllNotificationsSeen, setNotificationReadState } from '@/lib/notifications'

const NUMERIC_ID = /^\d+$/

export async function setNotificationReadAction(kind: unknown, id: unknown, read: unknown): Promise<boolean> {
  const userId = await requireUser()
  if ((kind !== 'dm' && kind !== 'comment') || typeof id !== 'string' || !NUMERIC_ID.test(id) || typeof read !== 'boolean') {
    return false
  }
  try {
    await setNotificationReadState(userId, kind, id, read)
    return true
  } catch (error) {
    console.error('[notifikasi] status dibaca gagal disimpan:', describeError(error))
    return false
  }
}

export async function markAllSeenAction(): Promise<boolean> {
  const userId = await requireUser()
  try {
    await markAllNotificationsSeen(userId)
    return true
  } catch (error) {
    console.error('[notifikasi] gagal ditandai dibaca:', describeError(error))
    return false
  }
}
