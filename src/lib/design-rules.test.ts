import { describe, expect, it } from 'vitest'
import { parseDesignRules } from './chat-options'

describe('parseDesignRules', () => {
  it('trims, allows clearing, and rejects non-text or over-long rules', () => {
    expect(parseDesignRules({ designRules: '  - Kurangi foto keluarga\r\n' })).toEqual({ rules: { designRules: '- Kurangi foto keluarga' } })
    expect(parseDesignRules({ designRules: '' })).toEqual({ rules: { designRules: '' } })
    expect(parseDesignRules({ designRules: 3 })).toHaveProperty('error')
    expect(parseDesignRules({ designRules: 'a'.repeat(1001) })).toHaveProperty('error')
  })
})
