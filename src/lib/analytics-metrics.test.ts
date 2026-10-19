import { describe, expect, it } from 'vitest'
import {
  emptyMetrics,
  engagementRate,
  formatCount,
  formatRate,
  isSyncStale,
  parseInsights,
  parseRange,
  summarize,
} from './analytics-metrics'

describe('parseInsights', () => {
  it('reads lifetime values and total_value, leaving missing metrics null', () => {
    // Arrange
    const body = {
      data: [
        { name: 'views', period: 'lifetime', values: [{ value: 1200 }] },
        { name: 'reach', period: 'lifetime', values: [{ value: 800 }] },
        { name: 'likes', total_value: { value: 40 } },
        { name: 'total_interactions', values: [{ value: 55 }] },
        { name: 'unknown_metric', values: [{ value: 9 }] },
      ],
    }

    // Act
    const metrics = parseInsights(body)

    // Assert
    expect(metrics).toEqual({
      ...emptyMetrics(),
      views: 1200,
      reach: 800,
      likes: 40,
      total_interactions: 55,
    })
  })

  it('ignores malformed entries instead of throwing', () => {
    const body = { data: [null, { name: 'views' }, { name: 'reach', values: [{ value: 'banyak' }] }, { name: 'saved', values: [] }] }

    expect(parseInsights(body)).toEqual(emptyMetrics())
  })

  it('returns all-null metrics for an empty or missing data set', () => {
    expect(parseInsights({ data: [] })).toEqual(emptyMetrics())
    expect(parseInsights({})).toEqual(emptyMetrics())
  })
})

describe('engagementRate', () => {
  it('divides interactions by views', () => {
    expect(engagementRate(50, 1000)).toBe(0.05)
  })

  it('is null without views', () => {
    expect(engagementRate(10, 0)).toBeNull()
    expect(engagementRate(10, null)).toBeNull()
    expect(engagementRate(null, 100)).toBeNull()
  })
})

describe('summarize', () => {
  it('sums the metrics and computes the rate only over posts with both views and interactions', () => {
    const posts = [
      { views: 1000, totalInteractions: 50 },
      { views: 500, totalInteractions: null },
      { views: null, totalInteractions: 20 },
    ]

    expect(summarize(posts)).toEqual({ postCount: 3, views: 1500, interactions: 70, engagementRate: 0.05 })
  })

  it('keeps sums null when no post has the metric', () => {
    expect(summarize([{ views: null, totalInteractions: null }])).toEqual({
      postCount: 1,
      views: null,
      interactions: null,
      engagementRate: null,
    })
    expect(summarize([])).toEqual({ postCount: 0, views: null, interactions: null, engagementRate: null })
  })
})

describe('parseRange', () => {
  it('accepts 7, 30 and 90 days and defaults to 30', () => {
    expect(parseRange('7')).toBe(7)
    expect(parseRange('90')).toBe(90)
    expect(parseRange('14')).toBe(30)
    expect(parseRange(undefined)).toBe(30)
  })
})

describe('isSyncStale', () => {
  const now = new Date('2026-10-19T12:00:00Z')

  it('is stale when never synced or the last sync started over 6 hours ago', () => {
    expect(isSyncStale(null, now)).toBe(true)
    expect(isSyncStale(new Date('2026-10-19T05:59:00Z'), now)).toBe(true)
  })

  it('is fresh within 6 hours', () => {
    expect(isSyncStale(new Date('2026-10-19T06:30:00Z'), now)).toBe(false)
  })
})

describe('formatting', () => {
  it('shows a dash for missing values', () => {
    expect(formatCount(null)).toBe('—')
    expect(formatRate(null)).toBe('—')
  })

  it('formats counts and rates the Indonesian way', () => {
    expect(formatCount(12345)).toBe('12.345')
    expect(formatRate(0.0425)).toBe('4,3%')
  })
})
