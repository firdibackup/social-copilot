'use server'

import { aiErrorMessage, parseAiRequest, runAiTask } from '@/lib/ai'
import type { AiRequest, AiResult } from '@/lib/ai-options'
import { describeError } from '@/lib/errors'
import { assertLocalRequest } from '@/lib/local-only'

/**
 * Runs one AI task for the editor. The result only fills the editor; saving and publishing stay with the owner.
 * `input` is typed for the editor's sake: a server action's body is untrusted, so it is validated as unknown.
 */
export async function generateAction(input: AiRequest): Promise<AiResult> {
  await assertLocalRequest()
  const parsed = parseAiRequest(input)
  if ('error' in parsed) return parsed

  try {
    return { options: await runAiTask(parsed.request) }
  } catch (error) {
    console.error(`[ai] ${parsed.request.task} gagal:`, describeError(error))
    return { error: aiErrorMessage(error) }
  }
}
