import 'server-only'
import { aiErrorMessage, loadAccountBrandContext } from './ai'
import { listProductGroups } from './assets'
import { loadAttachment } from './attachments'
import { getBrandVisual, listReferencePool } from './brand'
import { pickFirst, pickRandom, planReferenceImages, slideRoles, type SlideRole } from './brand-options'
import { getConnectedAccountId } from './connection'
import { loadScriptSources, planContent, writeScript } from './content-ai'
import { failContentJob, type ContentJob } from './content-jobs'
import { AUTO_PRODUCT, AUTO_REFERENCE, type ContentRequest } from './content-options'
import { templateStyleForBrand } from './design-styles'
import { describeError } from './errors'
import { contentAttemptActive, GenerationCancelled, watchGeneration } from './generation-cancellation'
import { getAccountIdea } from './ideas'
import { ContentError, createContentPost, type SlideReference } from './posts'
import { db, unwrap } from './supabase'
import { planTemplates } from './template-options'
import { listTemplateBank } from './templates'

/** One durable job, with a lease so a restarted worker cannot overwrite another worker's result. */
export async function processContentJob(job: ContentJob): Promise<void> {
  let watch: Awaited<ReturnType<typeof watchGeneration>> | undefined
  try {
    const language = job.payload.language ?? job.payload.request?.language ?? 'id'
    if (!job.lease) throw new Error('job_not_claimed')
    watch = await watchGeneration(() => contentAttemptActive(job.post_id, job.lease!))
    if (await getConnectedAccountId(job.user_id) !== job.account_id) {
      throw new ContentError('Akun Instagram berubah. Sambungkan akun asal lalu coba lagi.')
    }
    const brand = await loadAccountBrandContext(job.user_id, job.account_id)
    if (job.kind === 'script') {
      const idea = job.idea_id ? await getAccountIdea(job.user_id, job.account_id, job.idea_id) : null
      if (!idea) throw new ContentError('Ide sudah dihapus.')
      await writeScript(job.user_id, idea, async (script) => {
        await watch!.check()
        unwrap(await db().rpc('finish_script_job', { p_post_id: job.post_id, p_lease: job.lease, p_script: script }))
      }, job.payload.brief ?? '', brand, watch.signal, job.payload.density, language, await loadScriptSources(job.user_id, job.account_id))
      return
    }
    const request = job.payload.request
    if (!request) throw new Error('Permintaan konten kosong')
    const [references, listedProducts, attachment] = await Promise.all([
      chooseSlideReferences(job.user_id, job.account_id, request),
      request.productGroupId ? listProductGroups(job.user_id, job.account_id) : [],
      job.payload.attachmentPath ? loadAttachment(job.user_id, job.payload.attachmentPath) : null,
    ])
    const products = listedProducts
      .filter((product) => request.productGroupId === AUTO_PRODUCT || product.id === request.productGroupId)
      .map(({ id, title, description }) => ({ id, title, description }))
    if (request.productGroupId && request.productGroupId !== AUTO_PRODUCT && products.length === 0) {
      throw new ContentError('Produk tidak ditemukan.')
    }
    await watch.check()
    await planContent(job.user_id, request, async (plan) => {
      await watch!.check()
      return createContentPost(job.user_id, request, plan, references, job.payload.attachmentPath ?? null,
        { postId: job.post_id, lease: job.lease! })
    }, products, attachment, job.payload.script ?? null, brand, watch.signal, language)
  } catch (error) {
    if (error instanceof GenerationCancelled) return
    console.error('[worker] draft gagal:', describeError(error))
    await failContentJob(job, error instanceof ContentError ? error.message : aiErrorMessage(error))
  } finally {
    watch?.stop()
  }
}

/**
 * Which design each slide follows, fixed when the post is made (post_slides keeps it, so retries and edits reuse it).
 * Otomatis follows the admin's template bank for the brand's style; the owner's own references are used only when
 * one group is picked, exactly that group. Imported Instagram posts are never picked on the owner's behalf.
 */
async function chooseSlideReferences(userId: string, accountId: string, request: ContentRequest): Promise<SlideReference[]> {
  const roles = slideRoles(request.slides)
  if (!request.referenceId) return roles.map((role) => ({ role, referenceImageId: null, example: null }))
  if (request.referenceId === AUTO_REFERENCE) {
    const examples = await planStyleTemplates(userId, accountId, roles)
    return roles.map((role, index) => ({ role, referenceImageId: null, example: examples[index] }))
  }
  const pool = await listReferencePool(userId, accountId, request.referenceId)
  if (pool.length === 0) throw new ContentError('Referensi brand tidak ditemukan.')
  const images = planReferenceImages(pool, roles, pickFirst)
  return roles.map((role, index) => ({ role, referenceImageId: images[index], example: null }))
}

/** One template set of the brand's style (chosen, else guessed from the kit), with fallbacks for missing roles. */
async function planStyleTemplates(userId: string, accountId: string, roles: (SlideRole | null)[]): Promise<(string | null)[]> {
  try {
    const [brand, bank] = await Promise.all([getBrandVisual(userId, accountId), listTemplateBank()])
    return planTemplates(bank, templateStyleForBrand(brand), roles, pickRandom)
  } catch (error) {
    console.error('[konten] template desain gagal dimuat, lanjut tanpa template:', describeError(error))
    return roles.map(() => null)
  }
}
