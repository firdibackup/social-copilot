import { describe, expect, it } from 'vitest'
import {
  dmAfterTap,
  EMPTY_RULE,
  firstDm,
  matchesText,
  parseRuleInput,
  pickRule,
  pickVariation,
  postbackPayload,
  ruleIdFromPayload,
  ruleProblem,
  toRuleInput,
  type AutoDmRule,
  type AutoDmRuleInput,
} from './auto-dm-rules'

const RULE_ID = '00000000-0000-4000-8000-000000000001'

const input = (overrides: Partial<AutoDmRuleInput> = {}): AutoDmRuleInput => ({
  ...EMPTY_RULE,
  name: 'Link ebook',
  keywords: ['MAU'],
  openerText: 'Mau linknya? Tekan tombol di bawah 👇',
  openerButton: 'Kirim linknya',
  mainText: 'Ini linknya: https://contoh.id/ebook',
  ...overrides,
})

const rule = (overrides: Partial<AutoDmRule> = {}): AutoDmRule => ({
  ...input(),
  id: RULE_ID,
  isActive: true,
  createdAt: new Date('2026-10-19T01:00:00Z'),
  ...overrides,
})

describe('matchesText', () => {
  it('matches any keyword regardless of case', () => {
    expect(matchesText(rule({ keywords: ['MAU', 'LINK'] }), 'boleh minta link dong')).toBe(true)
    expect(matchesText(rule({ keywords: ['MAU'] }), 'Mau kak!')).toBe(true)
  })

  it('needs a whole word unless the owner turned that off', () => {
    expect(matchesText(rule({ keywords: ['link'] }), 'linknya mana?')).toBe(false)
    expect(matchesText(rule({ keywords: ['link'], wholeWord: false }), 'linknya mana?')).toBe(true)
  })

  it('treats emoji and punctuation as word edges', () => {
    expect(matchesText(rule({ keywords: ['MAU'] }), '🔥MAU🔥')).toBe(true)
    expect(matchesText(rule({ keywords: ['MAU'] }), 'mau.')).toBe(true)
    expect(matchesText(rule({ keywords: ['MAU'] }), 'maumu')).toBe(false)
  })

  it('reads keywords literally, not as patterns', () => {
    expect(matchesText(rule({ keywords: ['a.b'] }), 'axb')).toBe(false)
    expect(matchesText(rule({ keywords: ['a.b'] }), 'kode a.b ya')).toBe(true)
  })

  it('matches every text in "kata apa pun" mode', () => {
    expect(matchesText(rule({ matchAny: true, keywords: [] }), 'keren banget')).toBe(true)
  })
})

describe('pickRule', () => {
  const all = rule({ id: 'all', keywords: ['MAU'] })
  const one = rule({ id: 'one', scope: 'one', mediaId: '111', keywords: ['MAU'] })
  const any = rule({ id: 'any', scope: 'one', mediaId: '111', matchAny: true })

  it('prefers a rule of the post over one of every post, and keywords over any comment', () => {
    expect(pickRule([all, any, one], { source: 'comment', mediaId: '111', text: 'MAU' })?.id).toBe('one')
    expect(pickRule([all, any], { source: 'comment', mediaId: '111', text: 'MAU' })?.id).toBe('any')
    expect(pickRule([all, any], { source: 'comment', mediaId: '111', text: 'bagus' })?.id).toBe('any')
  })

  it('ignores rules of another post', () => {
    expect(pickRule([one], { source: 'comment', mediaId: '222', text: 'MAU' })).toBeNull()
    expect(pickRule([all, one], { source: 'comment', mediaId: '222', text: 'MAU' })?.id).toBe('all')
  })

  it('takes the older rule when two equal ones match', () => {
    const older = rule({ id: 'older', createdAt: new Date('2026-10-01T00:00:00Z') })
    expect(pickRule([all, older], { source: 'comment', mediaId: '111', text: 'MAU' })?.id).toBe('older')
  })

  it('answers DMs only with rules that opted in', () => {
    expect(pickRule([all], { source: 'dm', mediaId: null, text: 'MAU' })).toBeNull()
    const dm = rule({ id: 'dm', dmTrigger: true, scope: 'one', mediaId: '111' })
    expect(pickRule([all, dm], { source: 'dm', mediaId: null, text: 'MAU' })?.id).toBe('dm')
  })
})

describe('ruleProblem and parseRuleInput', () => {
  it('accepts a complete rule', () => {
    expect(ruleProblem(input())).toBeNull()
  })

  it('asks for what an enabled section needs', () => {
    expect(ruleProblem(input({ name: ' ' }))).toBe('Isi nama otomatisasi.')
    expect(ruleProblem(input({ scope: 'one', mediaId: null }))).toBe('Pilih post-nya dulu.')
    expect(ruleProblem(input({ keywords: [] }))).toBe('Tambah minimal satu kata kunci.')
    expect(ruleProblem(input({ keywords: [], matchAny: true }))).toBeNull()
    expect(ruleProblem(input({ publicReply: true, publicReplies: [' '] }))).toBe('Isi minimal satu balasan komentar.')
    expect(ruleProblem(input({ openerButton: '' }))).toBe('Isi teks tombol pesan pembuka.')
    expect(ruleProblem(input({ opener: false, openerButton: '' }))).toBeNull()
    expect(ruleProblem(input({ followGate: true }))).toBe('Isi pesan ajakan follow.')
    expect(ruleProblem(input({ mainText: '' }))).toBe('Isi pesan utamanya.')
    expect(ruleProblem(input({ linkButton: true, linkText: 'Buka', linkUrl: 'http://contoh.id' }))).toBe(
      'Link tujuan harus berupa alamat https://.',
    )
  })

  it('keeps button text to 20 characters and template text to 640', () => {
    expect(ruleProblem(input({ openerButton: 'x'.repeat(21) }))).toBe('Teks tombol maksimal 20 karakter.')
    expect(ruleProblem(input({ mainText: 'x'.repeat(641), linkButton: true, linkText: 'Buka', linkUrl: 'https://a.id' }))).toBe(
      'Pesan dengan tombol maksimal 640 karakter.',
    )
    expect(ruleProblem(input({ mainText: 'x'.repeat(641) }))).toBeNull()
  })

  it('trims and dedupes what the browser sent, then validates it', () => {
    const parsed = parseRuleInput({
      ...input(),
      name: '  Link ebook ',
      keywords: [' MAU ', 'mau', 'LINK', ''],
      publicReplies: ['Cek DM ya!', '  '],
      mediaId: '123',
    })
    expect(parsed).toEqual({
      rule: expect.objectContaining({
        name: 'Link ebook',
        keywords: ['MAU', 'LINK'],
        publicReplies: ['Cek DM ya!'],
        mediaId: null,
      }),
    })
  })

  it('refuses a payload of the wrong shape', () => {
    expect(parseRuleInput({ ...input(), keywords: 'MAU' })).toEqual({ error: 'Data aturan tidak terbaca.' })
    expect(parseRuleInput(null)).toEqual({ error: 'Data aturan tidak terbaca.' })
    expect(parseRuleInput({ ...input(), scope: 'one', mediaId: '12a' })).toEqual({ error: 'Pilih post-nya dulu.' })
  })
})

describe('the DMs a rule sends', () => {
  it('opens with the button message, then asks to follow or sends the main message', () => {
    const gated = rule({ followGate: true, followText: 'Follow dulu yuk', followButton: 'Sudah follow ✅' })
    expect(firstDm(gated)).toEqual({
      step: 'opener_sent',
      message: {
        text: 'Mau linknya? Tekan tombol di bawah 👇',
        buttons: [{ type: 'postback', title: 'Kirim linknya', payload: `autodm:${RULE_ID}` }],
      },
    })
    expect(dmAfterTap(gated, false).step).toBe('follow_requested')
    expect(dmAfterTap(gated, false).message.buttons).toEqual([
      { type: 'postback', title: 'Sudah follow ✅', payload: `autodm:${RULE_ID}` },
    ])
    expect(dmAfterTap(gated, true).step).toBe('main_sent')
  })

  it('starts with the follow request or the main message when there is no opener', () => {
    expect(firstDm(rule({ opener: false, followGate: true, followText: 'Follow', followButton: 'Sudah' })).step).toBe(
      'follow_requested',
    )
    expect(firstDm(rule({ opener: false }))).toEqual({
      step: 'main_sent',
      message: { text: 'Ini linknya: https://contoh.id/ebook', buttons: [] },
    })
  })

  it('adds the link button to the main message', () => {
    const linked = rule({ linkButton: true, linkText: 'Download', linkUrl: 'https://contoh.id/ebook' })
    expect(dmAfterTap(linked, false).message.buttons).toEqual([
      { type: 'web_url', title: 'Download', url: 'https://contoh.id/ebook' },
    ])
  })
})

describe('toRuleInput', () => {
  it('keeps only the form’s fields and gives an empty variation to type into', () => {
    const copy = toRuleInput(rule({ publicReplies: [] }))
    expect(copy).toEqual({ ...input(), publicReplies: [''] })
    expect(copy).not.toHaveProperty('id')
  })
})

describe('postback payloads', () => {
  it('round-trips the rule id and refuses anything else', () => {
    expect(ruleIdFromPayload(postbackPayload(RULE_ID))).toBe(RULE_ID)
    expect(ruleIdFromPayload('autodm:not-a-uuid')).toBeNull()
    expect(ruleIdFromPayload('GET_STARTED')).toBeNull()
  })
})

describe('pickVariation', () => {
  it('picks one variation by the random number', () => {
    expect(pickVariation(['a', 'b', 'c'], () => 0)).toBe('a')
    expect(pickVariation(['a', 'b', 'c'], () => 0.99)).toBe('c')
  })
})
