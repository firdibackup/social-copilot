import { describe, expect, it, vi } from 'vitest'
import { AiOutputError } from './ai'
import { EMPTY_BRAND } from './brand-options'
import { buildReplyMessages, parseReply, REPLY_CONTEXT_MESSAGES, REPLY_LIMITS } from './reply-ai'

vi.mock('./supabase', () => ({ db: vi.fn(), unwrap: vi.fn() }))
vi.mock('./billing', () => ({ creditsUsed: vi.fn(), getCurrentPeriod: vi.fn() }))

const userText = (messages: ReturnType<typeof buildReplyMessages>) => String(messages[1].content)

describe('buildReplyMessages', () => {
  it('asks for a draft when the box is empty, quoting the conversation', () => {
    const messages = buildReplyMessages(
      {
        channel: 'dm',
        lines: [
          { fromCustomer: true, text: 'ada ukuran XL?' },
          { fromCustomer: false, text: 'ada kak' },
          { fromCustomer: true, text: null },
        ],
        draft: '  ',
      },
      null,
    )
    const text = userText(messages)
    expect(messages[0].role).toBe('system')
    expect(text).toContain('tulis draf balasan')
    expect(text).toContain(`maksimal ${REPLY_LIMITS.dm} karakter`)
    expect(text).toContain('Pelanggan:\n"""\nada ukuran XL?\n"""')
    expect(text).toContain('Kamu:\n"""\nada kak\n"""')
    expect(text).toContain('"""\n(lampiran)\n"""')
    expect(text).not.toContain('Draf owner')
  })

  it('asks to tidy the owner’s draft, quoted, with the brand and caption', () => {
    const text = userText(
      buildReplyMessages(
        { channel: 'comment', lines: [{ fromCustomer: true, text: 'harga?' }], draft: 'dm aja kak', caption: 'Promo 10.10' },
        { ...EMPTY_BRAND, name: 'Kopi Sinar', voice: 'santai' },
      ),
    )
    expect(text).toContain('Nama: Kopi Sinar')
    expect(text).toContain('balasan publik')
    expect(text).toContain('rapikan draf')
    expect(text).toContain(`maksimal ${REPLY_LIMITS.comment} karakter`)
    expect(text).toContain('Caption post:\n"""\nPromo 10.10\n"""')
    expect(text).toContain('Draf owner:\n"""\ndm aja kak\n"""')
  })

  it('reads only the latest messages', () => {
    const lines = Array.from({ length: REPLY_CONTEXT_MESSAGES + 5 }, (_, index) => ({
      fromCustomer: true,
      text: `pesan-${index}`,
    }))
    const text = userText(buildReplyMessages({ channel: 'dm', lines, draft: '' }, null))
    expect(text).not.toContain('pesan-4\n')
    expect(text).toContain('pesan-5\n')
    expect(text).toContain(`pesan-${REPLY_CONTEXT_MESSAGES + 4}\n`)
  })
})

describe('parseReply', () => {
  it('reads the reply, also inside fences or a sentence', () => {
    expect(parseReply('{"reply": " Halo kak! "}', 100)).toBe('Halo kak!')
    expect(parseReply('Ini dia:\n```json\n{"reply":"Siap kak\\r\\nDitunggu"}\n```', 100)).toBe('Siap kak\nDitunggu')
  })

  it('cuts the reply to the channel’s limit', () => {
    expect(parseReply(JSON.stringify({ reply: 'a'.repeat(50) }), 10)).toHaveLength(10)
  })

  it('fails on an answer without a reply', () => {
    expect(() => parseReply('Maaf, saya tidak bisa.', 100)).toThrow(AiOutputError)
    expect(() => parseReply('{"reply": "  "}', 100)).toThrow(AiOutputError)
    expect(() => parseReply('{"reply": 42}', 100)).toThrow(AiOutputError)
    expect(() => parseReply('{"text": "halo"}', 100)).toThrow(AiOutputError)
  })
})
