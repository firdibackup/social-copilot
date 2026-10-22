import { describe, expect, it, vi } from 'vitest'
import { createSaveQueue } from './save-queue'

describe('autosave ordering', () => {
  it('deduplicates navigation flushes and writes newer snapshots after the in-flight save', async () => {
    const enqueue = createSaveQueue()
    let finish!: (value: boolean) => void
    const firstSave = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve }))
    const secondSave = vi.fn(async () => true)
    const first = enqueue(1, firstSave)
    expect(enqueue(1, firstSave)).toBe(first)
    const second = enqueue(2, secondSave)
    await Promise.resolve()
    expect(firstSave).toHaveBeenCalledTimes(1)
    expect(secondSave).not.toHaveBeenCalled()
    finish(true)
    await Promise.all([first, second])
    expect(secondSave).toHaveBeenCalledTimes(1)
    await enqueue(1, firstSave)
    expect(firstSave).toHaveBeenCalledTimes(1)
  })

  it('allows retries after a failed save without blocking the queue', async () => {
    const enqueue = createSaveQueue()
    expect(await enqueue(1, async () => { throw new Error('offline') })).toBe(false)
    expect(await enqueue(1, async () => true)).toBe(true)
    expect(await enqueue(2, async () => true)).toBe(true)
  })
})
