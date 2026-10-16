'use server'

import { remainingCredits } from '@/lib/ai'
import { requireActiveUser } from '@/lib/auth'
import { TASK_CREDITS } from '@/lib/billing-options'
import { getBrandKit, listReferences } from '@/lib/brand'
import { describeError } from '@/lib/errors'
import { createImage, imageErrorMessage, parseContent, parseImageInput, planSlides } from '@/lib/image-ai'
import type { GenerateResult, GeneratorOptions, PlanResult } from '@/lib/image-options'

/** Shared by /studio and the post editor's Gambar AI panel. Nothing here saves an image: the owner picks first. */

export async function generatorOptionsAction(): Promise<GeneratorOptions | { error: string }> {
  const userId = await requireActiveUser()
  try {
    const [kit, references] = await Promise.all([getBrandKit(userId), listReferences(userId)])
    return {
      references: references.map((reference) => ({
        id: reference.id,
        url: reference.url,
        label: reference.sourceLabel || 'Referensi',
      })),
      hasLogo: kit.logoUrl !== null,
      brandName: kit.name,
    }
  } catch (error) {
    console.error('[gambar] brand kit gagal dimuat:', describeError(error))
    return { error: 'Brand kit tidak bisa dimuat. Gambar tetap bisa dibuat tanpa referensi.' }
  }
}

/** Said before the first image is made, while slides can still be removed. */
async function creditWarning(userId: string, count: number): Promise<string | undefined> {
  const affordable = Math.floor((await remainingCredits(userId)).remaining / TASK_CREDITS.image)
  if (affordable >= count) return undefined
  return `Sisa kuota AI cukup untuk ${affordable} dari ${count} gambar. Hapus slide yang tidak perlu, atau perpanjang di menu Langganan.`
}

/** The editable slide plan for the content. */
export async function planSlidesAction(content: unknown): Promise<PlanResult> {
  const userId = await requireActiveUser()
  const parsed = parseContent(content)
  if (typeof parsed !== 'string') return parsed
  try {
    const slides = await planSlides(userId, parsed)
    return { slides, warning: await creditWarning(userId, slides.length) }
  } catch (error) {
    console.error('[gambar] rencana slide gagal:', describeError(error))
    return { error: imageErrorMessage(error) }
  }
}

/** One image. It travels back as a data URL and stays in the browser until the owner saves it. */
export async function generateImageAction(input: unknown): Promise<GenerateResult> {
  const userId = await requireActiveUser()
  const parsed = parseImageInput(input)
  if ('error' in parsed) return parsed
  try {
    return await createImage(userId, parsed.input)
  } catch (error) {
    console.error('[gambar] pembuatan gambar gagal:', describeError(error))
    return { error: imageErrorMessage(error) }
  }
}
