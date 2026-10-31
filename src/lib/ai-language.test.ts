import { describe, expect, it } from 'vitest'
import { buildContentMessages, buildCaptionEditMessages, buildIdeasMessages, buildScriptMessages, buildSlideRevisionMessages } from './content-ai'
import { buildSystemPrompt } from './chat-ai'
import { languagePrompt, outputLanguageInstruction } from './ai-language'
import { buildProfileMessages, buildStrategyMessages, buildVisualMessages } from './brand-ai'
import { buildTagMessages } from './asset-ai'
import { buildTemplateMessages } from './template-ai'
import { buildCatalogMessages } from './website-ai'
import { buildThreadWriteMessages, buildThreadEditMessages } from './threads-ai'

const brand = { name: 'Kopi', category: '', description: '', audience: '', voice: '', wordsUse: '', wordsAvoid: '', facts: '' }

// These snapshots were captured before adding language support: ID must stay byte-identical.
describe('English AI prompts', () => {
  it('leaves ID byte-identical, including whitespace', () => {
    const prompt = '  Tulis dalam Bahasa Indonesia.\n\n'
    expect(languagePrompt(prompt, 'id')).toBe(prompt)
    expect(outputLanguageInstruction('id')).toBe('')
  })

  it('requires English for every generator, without changing structured output contracts', () => {
    const prompts = [
      buildContentMessages('Kopi', 3, null, 'auto', [], null, null, null, 'seimbang', 'en'),
      buildContentMessages('Kopi', 1, null, 'auto', [], null, null, null, 'seimbang', 'en'),
      buildContentMessages('Kopi', 2, null, 'auto', [], null, [
        { label: 'Hook', title: 'Approved text', body: '' }, { label: 'CTA', title: 'Save this', body: '' },
      ], null, 'seimbang', 'en'),
      buildIdeasMessages(brand, [], 'en'),
      buildScriptMessages('Kopi', null, 'auto', '', 'seimbang', 'en'),
      buildCaptionEditMessages('Kopi', 'Singkat', null, 'en'),
      buildSlideRevisionMessages({ headline: 'Kopi', scene: 'Kafe' }, 'Malam', null, false, 'en'),
      buildProfileMessages({ website: null, instagram: null }, 'en'),
      buildVisualMessages([], 'en'),
      buildStrategyMessages({ brand, recent: [] }, 'en'),
      buildTagMessages([], 'en'),
      buildTemplateMessages([], 'en'),
      buildCatalogMessages([], 'en'),
      buildThreadWriteMessages('Kopi', null, 'en'),
      buildThreadEditMessages(['Kopi'], 'Singkat', null, null, 'en'),
    ]
    for (const messages of prompts) {
      const system = String(messages[0].content)
      expect(system).toContain('Write all output in English.')
      expect(system).not.toMatch(/bahasa Indonesia/i)
      expect(system).toContain('Indonesian phrases in the instructions are style examples only')
      expect(system).toContain('Keep JSON keys, enum values, IDs')
    }
    expect(buildSystemPrompt(null, false, '', new Date('2026-10-31T00:00:00Z'), 'en'))
      .toContain('Write all output in English.')
    expect(JSON.stringify(buildTagMessages([], 'en'))).not.toContain('bahasa Indonesia')
    expect(JSON.stringify(buildTemplateMessages([], 'en'))).not.toContain('bahasa Indonesia')
  })
})

describe('original Indonesian AI prompts', () => {
  it('preserves the complete content prompts', () => {
    expect({
      content: buildContentMessages('Kopi pagi', 3, null),
      single: buildContentMessages('Kopi pagi', 1, null),
      scripted: buildContentMessages('Kopi pagi', 2, null, 'auto', [], null, [
        { label: 'Hook', title: 'Kopi pagi', body: '' },
        { label: 'CTA', title: 'Coba sekarang', body: '' },
      ]),
      ideas: buildIdeasMessages({ name: 'Kopi', category: '', description: '', audience: '', voice: '', wordsUse: '', wordsAvoid: '', facts: '' }, []),
      script: buildScriptMessages('Kopi pagi', null),
      caption: buildCaptionEditMessages('Kopi pagi', 'Singkat', null),
      revision: buildSlideRevisionMessages({ headline: 'Kopi', scene: 'Kafe' }, 'Malam'),
    }).toMatchSnapshot()
  })

  it('preserves the complete Mimo prompt', () => {
    expect(buildSystemPrompt(null, false, 'Kopi pagi', new Date('2026-10-31T00:00:00Z'))).toMatchSnapshot()
  })
})
