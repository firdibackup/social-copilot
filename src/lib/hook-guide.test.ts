import { describe, expect, it } from 'vitest'
import { hookGuide } from './hook-guide'
import knowledge from './hook-knowledge.json'

describe('retrieved hook guide', () => {
  it('keeps rules but never stuffs the full local collection', () => {
    const prompt = hookGuide()
    for (const rule of knowledge.rules) expect(prompt).toContain(rule)
    for (const hook of knowledge.templates) expect(prompt).not.toContain(hook.structure)
  })
  it('includes only the bounded retrieved structures', () => {
    const hooks = knowledge.templates.slice(0, 4).map((h) => ({ id: h.id, structure: h.structure, use_when: h.useWhen }))
    const prompt = hookGuide(hooks)
    for (const hook of hooks.slice(0, 3)) expect(prompt).toContain(hook.structure)
    expect(prompt).not.toContain(hooks[3].structure)
  })
})
