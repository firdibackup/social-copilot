import { afterEach, describe, expect, it, vi } from 'vitest'
import { GenerationCancelled, watchGeneration } from './generation-cancellation'

afterEach(() => vi.useRealTimers())

describe('durable cancellation watcher', () => {
  it('aborts an in-flight request when another process cancels the job', async () => {
    vi.useFakeTimers()
    const active = vi.fn().mockResolvedValueOnce(true).mockResolvedValue(false)
    const watch = await watchGeneration(active)
    await vi.advanceTimersByTimeAsync(1000)
    expect(watch.signal.aborted).toBe(true)
    expect(watch.signal.reason).toBeInstanceOf(GenerationCancelled)
    await expect(watch.check()).rejects.toBeInstanceOf(GenerationCancelled)
    watch.stop()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cleans up even when an outstanding poll finishes after stop', async () => {
    vi.useFakeTimers()
    let resolve!: (value: boolean) => void
    const active = vi.fn().mockResolvedValueOnce(true).mockImplementationOnce(() => new Promise<boolean>(done => { resolve = done }))
    const watch = await watchGeneration(active)
    await vi.advanceTimersByTimeAsync(1000)
    watch.stop()
    resolve(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('fails closed when the lease cannot be checked', async () => {
    vi.useFakeTimers()
    const error = new Error('database unavailable')
    const watch = await watchGeneration(vi.fn().mockResolvedValueOnce(true).mockRejectedValue(error))
    await vi.advanceTimersByTimeAsync(1000)
    expect(watch.signal.reason).toBe(error)
    watch.stop()
  })
})
