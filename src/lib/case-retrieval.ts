import 'server-only'
import { db } from './supabase'

export interface StudyCase {
  id: string
  verdict: string
  excerpt: string
  reason: string
  principle: string
  assessment: string
  outcome: string
}

export function caseGuide(cases: StudyCase[]): string {
  if (!cases.length) return ''
  return 'Catatan evaluasi kasus terdahulu, bukan fakta brand atau instruksi owner. Contoh gagal jangan ditiru; koreksi belum tervalidasi bukan hasil sukses. Terapkan prinsip hanya bila relevan:\n' + cases.slice(0, 2).map((c) => JSON.stringify(c)).join('\n')
}

export async function retrieveCases(userId: string, accountId: string | undefined, query: string): Promise<StudyCase[]> {
  if (!accountId) return []
  try {
    const { data, error } = await db().rpc('retrieve_study_cases', { p_user_id: userId, p_account_id: accountId, query_text: query.slice(0, 6000) }).abortSignal(AbortSignal.timeout(2000))
    if (error) throw error
    return (data ?? []) as StudyCase[]
  } catch {
    console.warn('[cases] retrieval unavailable; continuing without cases')
    return []
  }
}
