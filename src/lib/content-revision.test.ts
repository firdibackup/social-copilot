import { describe, expect, it } from 'vitest'
import { contentRevision, type ContentRevisionRow } from './content-revision'

const row: ContentRevisionRow = {
  id: 'post-1', updated_at: '2026-10-22T00:00:00Z',
  content_jobs: { kind: 'content', status: 'running' },
  post_slides: [
    { id: 'b', status: 'pending', updated_at: 'one' },
    { id: 'a', status: 'generating', updated_at: 'one' },
  ],
}

describe('contentRevision', () => {
  it('ignores database relation order, avoiding refresh loops', () => {
    expect(contentRevision({ ...row, post_slides: [...row.post_slides].reverse(), content_jobs: [row.content_jobs as { kind: string; status: string }] }))
      .toBe(contentRevision(row))
  })
  it('detects finished slides even without a parent post update', () => {
    expect(contentRevision({ ...row, post_slides: [{ ...row.post_slides[0], status: 'ready' }, row.post_slides[1]] }))
      .not.toBe(contentRevision(row))
  })
  it('detects job cancellation and removed slides', () => {
    expect(contentRevision({ ...row, content_jobs: { kind: 'content', status: 'cancelled' } })).not.toBe(contentRevision(row))
    expect(contentRevision({ ...row, post_slides: [] })).not.toBe(contentRevision(row))
  })
})
