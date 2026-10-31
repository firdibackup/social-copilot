import { describe, expect, it } from 'vitest'
import { fitToInstagram, isJpeg, storedJpegAttempts } from './image'

describe('fitToInstagram', () => {
  it('crops a 9:16 photo to 4:5 around the centre', () => {
    expect(fitToInstagram(1080, 1920)).toEqual({ sx: 0, sy: 285, sw: 1080, sh: 1350, width: 1080, height: 1350 })
  })

  it('crops a 3:1 panorama to 1.91:1 and scales it to 1440 px wide', () => {
    expect(fitToInstagram(3000, 1000)).toEqual({ sx: 545, sy: 0, sw: 1910, sh: 1000, width: 1440, height: 754 })
  })

  it('keeps a square photo uncropped', () => {
    expect(fitToInstagram(1080, 1080)).toEqual({ sx: 0, sy: 0, sw: 1080, sh: 1080, width: 1080, height: 1080 })
  })

  it('scales a large photo down to 1440 px wide without cropping', () => {
    expect(fitToInstagram(4000, 3000)).toEqual({ sx: 0, sy: 0, sw: 4000, sh: 3000, width: 1440, height: 1080 })
  })
})

describe('storedJpegAttempts', () => {
  it('tries lower quality before reducing dimensions and keeps Instagram ratios valid', () => {
    const attempts = storedJpegAttempts(1080, 1350, 0.9, true)
    expect(attempts.slice(0, 4)).toEqual([
      { width: 1080, height: 1350, quality: 0.9 },
      { width: 1080, height: 1350, quality: 0.8 },
      { width: 1080, height: 1350, quality: 0.7 },
      { width: 1080, height: 1350, quality: 0.6 },
    ])
    expect(attempts[4]).toEqual({ width: 918, height: 1147, quality: 0.6 })
    for (const attempt of attempts) {
      expect(attempt.height).toBeLessThanOrEqual(Math.floor((attempt.width * 5) / 4))
      expect(attempt.height).toBeGreaterThanOrEqual(Math.ceil((attempt.width * 100) / 191))
    }
  })
})

describe('isJpeg', () => {
  it('accepts the JPEG signature', () => {
    expect(isJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true)
  })

  it('rejects a PNG', () => {
    expect(isJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false)
  })

  it('rejects an empty file', () => {
    expect(isJpeg(new Uint8Array())).toBe(false)
  })
})
