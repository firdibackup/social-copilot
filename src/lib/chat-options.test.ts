import { describe, expect, it } from 'vitest'
import {
  analyzeRequest,
  attachmentsProblem,
  checkAttachment,
  HISTORY_MAX,
  historyRange,
  LIMIT_MESSAGES,
  MAX_FILE_BYTES,
  searchPattern,
  sessionTitle,
  suggestionContext,
  suggestionsFor,
  summaryBatch,
  wibDayStart,
  type ChatPart,
} from './chat-options'

describe('daily limits', () => {
  it('start counting at 00:00 WIB of the day it is in Jakarta', () => {
    // 23:30 UTC on the 20th is 06:30 WIB on the 21st.
    expect(wibDayStart(new Date('2026-10-20T23:30:00Z')).toISOString()).toBe('2026-10-20T17:00:00.000Z')
    // 16:59 UTC is still 23:59 WIB of the same day.
    expect(wibDayStart(new Date('2026-10-21T16:59:00Z')).toISOString()).toBe('2026-10-20T17:00:00.000Z')
  })

  it('tell the owner the limit and when it resets', () => {
    expect(LIMIT_MESSAGES.chat).toBe('Limit chat harian tercapai (100/hari). Reset jam 00:00 WIB.')
    expect(LIMIT_MESSAGES.deep_search).toBe('Limit riset kompetitor harian tercapai (10/hari). Reset jam 00:00 WIB.')
  })
})

describe('checkAttachment', () => {
  it('takes images and PDFs up to 5 MB', () => {
    expect(checkAttachment({ name: 'a.png', type: 'image/png', size: 1000 })).toEqual({ kind: 'image' })
    expect(checkAttachment({ name: 'brief.pdf', type: 'application/pdf', size: MAX_FILE_BYTES })).toEqual({ kind: 'pdf' })
    // Some browsers send no type for a PDF.
    expect(checkAttachment({ name: 'Brief.PDF', type: '', size: 10 })).toEqual({ kind: 'pdf' })
  })

  it('refuses other files, empty ones and anything over 5 MB', () => {
    expect(checkAttachment({ name: 'a.docx', type: 'application/msword', size: 10 })).toEqual({
      error: 'a.docx: hanya PDF, JPG, PNG, atau WebP.',
    })
    expect(checkAttachment({ name: 'big.jpg', type: 'image/jpeg', size: MAX_FILE_BYTES + 1 })).toEqual({
      error: 'big.jpg lebih dari 5 MB.',
    })
    expect(checkAttachment({ name: 'kosong.png', type: 'image/png', size: 0 })).toEqual({ error: 'kosong.png kosong.' })
  })

  it('allows three attachments with at most one PDF', () => {
    expect(attachmentsProblem(['pdf', 'image', 'image'])).toBeNull()
    expect(attachmentsProblem(['image', 'image', 'image', 'image'])).toBe('Maksimal 3 lampiran per pesan.')
    expect(attachmentsProblem(['pdf', 'pdf'])).toBe('Maksimal 1 PDF per pesan.')
  })
})

describe('searchPattern', () => {
  it('keeps only words, so the pattern is safe inside a PostgREST or() filter', () => {
    expect(searchPattern('Promo Ramadan, (diskon) 50%!')).toBe('%promo%ramadan%diskon%50%')
    expect(searchPattern('a.b,c')).toBeNull()
    expect(searchPattern('  ')).toBeNull()
  })
})

describe('sessionTitle', () => {
  it('is the first message on one line, cut short', () => {
    expect(sessionTitle('Cari tren\nkopi susu', '')).toBe('Cari tren kopi susu')
    const long = sessionTitle('kata '.repeat(30), '')
    expect(long.length).toBeLessThanOrEqual(61)
    expect(long.endsWith('…')).toBe(true)
  })

  it('falls back to the file name, then to Chat baru', () => {
    expect(sessionTitle('  ', 'brief.pdf')).toBe('brief.pdf')
    expect(sessionTitle('', '')).toBe('Chat baru')
  })
})

describe('the rolling summary', () => {
  it('waits until 40 messages are past the summary, then folds the oldest 20', () => {
    expect(summaryBatch(39, 0)).toBeNull()
    expect(summaryBatch(40, 0)).toEqual({ from: 0, to: 19 })
    expect(summaryBatch(59, 20)).toBeNull()
    expect(summaryBatch(60, 20)).toEqual({ from: 20, to: 39 })
  })

  it('sends every message after the summary, but never more than HISTORY_MAX', () => {
    expect(historyRange(0, 0)).toBeNull()
    expect(historyRange(5, 0)).toEqual({ from: 0, to: 4 })
    expect(historyRange(45, 20)).toEqual({ from: 20, to: 44 })
    // Summaries kept failing: only the newest HISTORY_MAX.
    expect(historyRange(100, 0)).toEqual({ from: 100 - HISTORY_MAX, to: 99 })
  })
})

describe('suggestions', () => {
  const assistant = (parts: ChatPart[]) => ({ role: 'assistant' as const, parts })
  const script = (state: 'saved' | 'discarded'): ChatPart => ({
    type: 'scripts',
    items: [{ ideaId: 'i', title: 'T', script: [], state }],
    errors: [],
  })

  it('fit where the chat stands', () => {
    expect(suggestionContext([])).toBe('empty')
    expect(suggestionContext([{ role: 'user', parts: [] }])).toBeNull()
    expect(suggestionContext([assistant([])])).toBeNull()
    expect(suggestionContext([assistant([script('saved')])])).toBe('after_script')
    expect(suggestionContext([assistant([script('discarded')])])).toBeNull()
    const competitors: ChatPart = {
      type: 'competitors',
      query: '@a',
      competitors: [{ username: 'a', name: '', bio: '', followers: 1, postsCount: 1, verified: false, avatar: null, recentPosts: [] }],
    }
    expect(suggestionContext([assistant([competitors])])).toBe('after_deep_search')
  })

  it('are static snippets', () => {
    expect(suggestionsFor('empty')).toHaveLength(4)
    expect(suggestionsFor('after_script')).toContain('Ubah hook-nya')
  })

  it('ask to analyze the picked accounts', () => {
    expect(analyzeRequest(['a', 'b'])).toContain('@a, @b')
  })
})
