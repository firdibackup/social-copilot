'use server'

import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  AdminError,
  adjustCredits,
  deleteUser,
  endSubscription,
  grantDays,
  logAdminAction,
  resetCredits,
  setBanned,
  setPassword,
} from '@/lib/admin'
import { parseAdjustment, parseGrantDays, parsePassword, parseSettings } from '@/lib/admin-options'
import { saveAppSettings } from '@/lib/app-settings'
import { requireAdmin } from '@/lib/auth'
import { describeError } from '@/lib/errors'
import { chatCompletion, generateImage, RouterApiError } from '@/lib/nine-router'
import { isUuid } from '@/lib/params'
import { toReferenceDataUrl } from '@/lib/slide-image'

export interface FormState {
  error: string | null
  success: string | null
}

const fieldsOf = (formData: FormData) => Object.fromEntries(formData.entries())
const failed = (error: string): FormState => ({ error, success: null })
const done = (success: string): FormState => ({ error: null, success })

export async function saveSettingsAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin()
  const parsed = parseSettings(fieldsOf(formData))
  if ('error' in parsed) return failed(parsed.error)
  try {
    await saveAppSettings(admin.id, parsed.settings)
  } catch (error) {
    console.error('[admin] pengaturan gagal disimpan:', describeError(error))
    return failed('Pengaturan gagal disimpan. Sudah menjalankan migrasi admin?')
  }
  await logAdminAction(admin, 'save_settings', null, { ...parsed.settings })
  refresh()
  return done('Pengaturan disimpan. Berlaku untuk permintaan AI berikutnya.')
}

export type ModelTestResult =
  | { ok: true; message: string; preview: string | null; ms: number }
  | { ok: false; message: string; ms: number }

const TEST_PROMPT = 'Balas hanya dengan satu kata: OK'
const TEST_IMAGE_PROMPT = 'A single red circle centered on a plain white background. No text.'
const TEST_IMAGE_SIZE = '1024x1024'

/** One live request to `model`. Not charged to anyone; the admin sees the provider's own error text. */
export async function testModelAction(kind: 'text' | 'image', model: string): Promise<ModelTestResult> {
  await requireAdmin()
  const id = model.trim()
  const startedAt = Date.now()
  const ms = () => Date.now() - startedAt
  if (!id) return { ok: false, message: 'Isi id model dulu.', ms: 0 }
  try {
    if (kind === 'text') {
      const answer = await chatCompletion([{ role: 'user', content: TEST_PROMPT }], id)
      return { ok: true, message: `Jawaban: "${answer.trim().slice(0, 120)}"`, preview: null, ms: ms() }
    }
    const b64 = await generateImage({ prompt: TEST_IMAGE_PROMPT, size: TEST_IMAGE_SIZE, images: [] }, id)
    const preview = await toReferenceDataUrl(new Uint8Array(Buffer.from(b64, 'base64')))
    return { ok: true, message: 'Gambar berhasil dibuat.', preview, ms: ms() }
  } catch (error) {
    if (error instanceof RouterApiError) {
      return { ok: false, message: `${error.status ? `HTTP ${error.status}: ` : ''}${error.message}`, ms: ms() }
    }
    console.error('[admin] tes model gagal:', describeError(error))
    return { ok: false, message: 'Tes gagal dijalankan. Periksa ROUTER_API_BASE_URL dan ROUTER_API_KEY.', ms: ms() }
  }
}

export type UserIntent = 'grant' | 'end' | 'adjust' | 'reset' | 'password' | 'ban' | 'unban' | 'delete'

/** Every action on one user, picked by the form's `intent`. */
export async function userAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin()
  const fields = fieldsOf(formData)
  const userId = fields.userId
  if (!isUuid(userId)) return failed('Pengguna tidak ditemukan.')

  let message: string
  try {
    switch (fields.intent as UserIntent) {
      case 'grant': {
        const days = parseGrantDays(fields.days)
        if (typeof days === 'object') return failed(days.error)
        await grantDays(admin, userId, days)
        message = `${days} hari langganan ditambahkan.`
        break
      }
      case 'end':
        await endSubscription(admin, userId)
        message = 'Langganan dihentikan.'
        break
      case 'adjust': {
        const adjustment = parseAdjustment(fields)
        if ('error' in adjustment) return failed(adjustment.error)
        await adjustCredits(admin, userId, adjustment.amount, adjustment.note)
        message = adjustment.amount > 0 ? 'Kredit ditambahkan.' : 'Kredit dikurangi.'
        break
      }
      case 'reset':
        await resetCredits(admin, userId)
        message = 'Pemakaian kredit periode ini direset ke 0.'
        break
      case 'password': {
        const password = parsePassword(fields.password)
        if (typeof password === 'object') return failed(password.error)
        await setPassword(admin, userId, password)
        message = 'Password diganti. Berikan password baru ke pengguna.'
        break
      }
      case 'ban':
      case 'unban':
        await setBanned(admin, userId, fields.intent === 'ban')
        message = fields.intent === 'ban' ? 'Akun diblokir.' : 'Blokir dibuka.'
        break
      case 'delete':
        await deleteUser(admin, userId, typeof fields.confirmEmail === 'string' ? fields.confirmEmail : '')
        message = ''
        break
      default:
        return failed('Aksi tidak dikenal.')
    }
  } catch (error) {
    if (error instanceof AdminError) return failed(error.message)
    console.error('[admin] aksi pengguna gagal:', describeError(error))
    return failed('Aksi gagal. Coba lagi, atau periksa Supabase dan migrasi admin.')
  }
  // Outside the try: redirect() throws.
  if (fields.intent === 'delete') redirect('/admin/pengguna?dihapus=1')
  refresh()
  return done(message)
}
