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
  markPaymentReminded,
  resetCredits,
  setBanned,
  setPassword,
} from '@/lib/admin'
import { parseAdjustment, parseGrantDays, parsePassword, parseSettings } from '@/lib/admin-options'
import { saveAppSettings } from '@/lib/app-settings'
import { requireAdmin } from '@/lib/auth'
import { describeError } from '@/lib/errors'
import { isJpeg, MAX_IMAGE_BYTES } from '@/lib/image'
import { chatCompletion, generateImage, RouterApiError } from '@/lib/nine-router'
import { isUuid } from '@/lib/params'
import { toReferenceDataUrl } from '@/lib/slide-image'
import { analyzeTemplates } from '@/lib/template-ai'
import { parseTemplateEdit } from '@/lib/template-options'
import { addTemplate, deleteTemplate, importLegacyTemplates, setTemplateActive, TemplateError, updateTemplate } from '@/lib/templates'

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

const TEMPLATE_DATABASE = 'Periksa Supabase dan migrasi template desain.'

/** One template image from the admin's browser, already a JPEG. Returns an error message, or null. */
export async function uploadTemplateAction(formData: FormData): Promise<string | null> {
  const admin = await requireAdmin()
  const file = formData.get('file')
  if (!(file instanceof Blob)) return 'File tidak ditemukan.'
  if (file.size === 0 || file.size > MAX_IMAGE_BYTES) return 'Ukuran gambar harus di bawah 8 MB.'
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!isJpeg(bytes)) return 'File bukan JPEG.'
  try {
    const id = await addTemplate(admin.id, bytes)
    await logAdminAction(admin, 'upload_template', null, { templateId: id })
  } catch (error) {
    console.error('[admin] template gagal disimpan:', describeError(error))
    return `Gambar gagal disimpan. ${TEMPLATE_DATABASE}`
  }
  refresh()
  return null
}

export async function importTemplatesAction(): Promise<FormState> {
  const admin = await requireAdmin()
  let added: number
  try {
    added = await importLegacyTemplates(admin.id)
  } catch (error) {
    if (error instanceof TemplateError) return failed(error.message)
    console.error('[admin] impor template gagal:', describeError(error))
    return failed(`Impor gagal. ${TEMPLATE_DATABASE}`)
  }
  if (added === 0) return done('Semua contoh desain sudah diimpor.')
  await logAdminAction(admin, 'import_templates', null, { added })
  refresh()
  return done(`${added} contoh desain diimpor. Klik Analisis dengan AI untuk mengelompokkannya.`)
}

/** Every pending template, or the one given (Analisis ulang). Not charged to anyone. */
export async function analyzeTemplatesAction(templateId: string | null): Promise<FormState> {
  const admin = await requireAdmin()
  if (templateId !== null && !isUuid(templateId)) return failed('Template tidak ditemukan.')
  let result: { analyzed: number; failed: number }
  try {
    result = await analyzeTemplates(admin.id, templateId ? [templateId] : null)
  } catch (error) {
    console.error('[admin] analisis template gagal:', describeError(error))
    return failed(`Analisis gagal dijalankan. ${TEMPLATE_DATABASE}`)
  }
  const total = result.analyzed + result.failed
  if (total === 0) return done('Tidak ada template yang menunggu analisis.')
  await logAdminAction(admin, 'analyze_templates', null, {
    ...result,
    templateId,
  })
  refresh()
  if (result.failed === 0) return done(`${result.analyzed} template dianalisis.`)
  return failed(`${result.analyzed} dari ${total} template dianalisis; sisanya gagal. Atur manual atau analisis ulang.`)
}

export type TemplateIntent = 'update' | 'activate' | 'deactivate' | 'delete'

/** Every change to one template, picked by the form's `intent`. */
export async function templateAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin()
  const fields = fieldsOf(formData)
  const templateId = fields.templateId
  if (!isUuid(templateId)) return failed('Template tidak ditemukan.')

  let message: string
  try {
    switch (fields.intent as TemplateIntent) {
      case 'update': {
        const edit = parseTemplateEdit(fields, formData.getAll('styles'))
        if ('error' in edit) return failed(edit.error)
        await updateTemplate(templateId, edit)
        await logAdminAction(admin, 'update_template', null, {
          templateId,
          ...edit,
        })
        message = 'Template disimpan.'
        break
      }
      case 'activate':
      case 'deactivate': {
        const active = fields.intent === 'activate'
        await setTemplateActive(templateId, active)
        await logAdminAction(admin, 'toggle_template', null, {
          templateId,
          active,
        })
        message = active ? 'Template diaktifkan.' : 'Template dinonaktifkan.'
        break
      }
      case 'delete':
        await deleteTemplate(templateId)
        await logAdminAction(admin, 'delete_template', null, { templateId })
        message = 'Template dihapus.'
        break
      default:
        return failed('Aksi tidak dikenal.')
    }
  } catch (error) {
    console.error('[admin] aksi template gagal:', describeError(error))
    return failed(`Aksi gagal. ${TEMPLATE_DATABASE}`)
  }
  refresh()
  return done(message)
}

/** Called as the admin opens the WhatsApp chat, so the list shows who was already reminded. */
export async function markRemindedAction(paymentId: string): Promise<{ error: string | null }> {
  const admin = await requireAdmin()
  if (!isUuid(paymentId)) return { error: 'Pembayaran tidak ditemukan.' }
  try {
    await markPaymentReminded(admin, paymentId)
  } catch (error) {
    if (error instanceof AdminError) return { error: error.message }
    console.error('[admin] pengingat pembayaran gagal dicatat:', describeError(error))
    return { error: 'Pengingat gagal dicatat. Sudah menjalankan migrasi kontak pembayaran?' }
  }
  refresh()
  return { error: null }
}
