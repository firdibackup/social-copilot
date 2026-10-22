/** Serialize snapshots and deduplicate autosave + navigation flushes of the same version. */
export function createSaveQueue() {
  let tail = Promise.resolve(true)
  let saved = -1
  const pending = new Map<number, Promise<boolean>>()
  return (version: number, save: () => Promise<boolean>): Promise<boolean> => {
    if (version <= saved) return Promise.resolve(true)
    const existing = pending.get(version)
    if (existing) return existing
    const next = tail.then(async () => {
      if (version <= saved) return true
      const success = await save().catch(() => false)
      if (success) saved = version
      return success
    }).finally(() => { pending.delete(version) })
    pending.set(version, next)
    tail = next
    return next
  }
}
