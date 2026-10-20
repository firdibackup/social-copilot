import { describe, expect, it } from 'vitest'
import { toReplyRows, type ConversationReply } from './threads-replies'

const POST = '100'
const at = (minute: number) => new Date(Date.UTC(2026, 9, 20, 12, minute))

const reply = (id: string, repliedToId: string, minute: number, overrides: Partial<ConversationReply> = {}): ConversationReply => ({
  id,
  text: `teks ${id}`,
  username: 'pelanggan',
  createdAt: at(minute),
  isHidden: false,
  isOwn: false,
  repliedToId,
  ...overrides,
})

const rowsById = (replies: ConversationReply[], owner: string | null = 'toko') =>
  new Map(toReplyRows(POST, replies, owner).map((row) => [row.replyId, row]))

describe('toReplyRows', () => {
  it('hangs nested replies under the top-level reply of their branch', () => {
    const rows = rowsById([reply('1', POST, 0), reply('2', '1', 1), reply('3', '2', 2)])

    expect(rows.get('1')?.parentId).toBeNull()
    expect(rows.get('2')?.parentId).toBe('1')
    expect(rows.get('3')?.parentId).toBe('1')
    expect(rows.get('3')?.repliedToId).toBe('2')
  })

  it('treats a reply to something not listed as top-level', () => {
    expect(rowsById([reply('5', '999', 0)]).get('5')?.parentId).toBeNull()
  })

  it('marks replies answered by a later owner reply in the same branch', () => {
    const rows = rowsById([
      reply('1', POST, 0),
      reply('2', '1', 1),
      reply('3', '2', 5, { isOwn: true, username: 'toko' }),
      reply('4', '1', 9),
    ])

    expect(rows.get('1')?.repliedAt).toEqual(at(5))
    expect(rows.get('2')?.repliedAt).toEqual(at(5))
    expect(rows.get('4')?.repliedAt).toBeNull()
    expect(rows.get('3')).toMatchObject({ isFromOwner: true, repliedAt: null })
  })

  it('does not count an owner reply in another branch', () => {
    const rows = rowsById([reply('1', POST, 0), reply('2', POST, 1, { isOwn: true })])

    expect(rows.get('1')?.repliedAt).toBeNull()
  })

  it('knows the owner by username when Threads does not say', () => {
    const rows = rowsById([reply('1', POST, 0), reply('2', '1', 1, { username: 'toko' })])

    expect(rows.get('2')?.isFromOwner).toBe(true)
    expect(rows.get('1')?.repliedAt).toEqual(at(1))
  })

  it('survives a loop in the data', () => {
    const rows = rowsById([reply('1', '2', 0), reply('2', '1', 1)])

    expect(rows.size).toBe(2)
  })
})
