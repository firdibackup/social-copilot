'use server'

import { getBrandKit, listReferences } from '@/lib/brand'
import { describeError } from '@/lib/errors'
import { createImage, imageErrorMessage, parseContent, parseImageInput, planSlides } from '@/lib/image-ai'
import type { GenerateResult, GeneratorOptions, PlanResult } from '@/lib/image-options'
import { assertLocalRequest } from '@/lib/local-only'

/** Shared by /studio and the post editor's Gambar AI panel. Nothing here saves an image: the owner picks first. */

export async function generatorOptionsAction(): Promise<GeneratorOptions | { error: string }> {
  await assertLocalRequest()
  try {
    const [kit, references] = await Promise.all([getBrandKit(), listReferences()])
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

/** The editable slide plan for the content. */
export async function planSlidesAction(content: unknown): Promise<PlanResult> {
  await assertLocalRequest()
  const parsed = parseContent(content)
  if (typeof parsed !== 'string') return parsed
  try {
    return { slides: await planSlides(parsed) }
  } catch (error) {
    console.error('[gambar] rencana slide gagal:', describeError(error))
    return { error: imageErrorMessage(error) }
  }
}

/** One image. It travels back as a data URL and stays in the browser until the owner saves it. */
export async function generateImageAction(input: unknown): Promise<GenerateResult> {
  await assertLocalRequest()
  const parsed = parseImageInput(input)
  if ('error' in parsed) return parsed
  try {
    return await createImage(parsed.input)
  } catch (error) {
    console.error('[gambar] pembuatan gambar gagal:', describeError(error))
    return { error: imageErrorMessage(error) }
  }
}
