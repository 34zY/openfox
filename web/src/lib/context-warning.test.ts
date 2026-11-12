import { describe, expect, it } from 'vitest'
import { MIN_CONTEXT_WARNING, isSmallContext, wouldOverflowContext } from './context-warning'

describe('isSmallContext', () => {
  it('flags contexts below the warning threshold', () => {
    expect(isSmallContext(MIN_CONTEXT_WARNING - 1)).toBe(true)
    expect(isSmallContext(8192)).toBe(true)
    expect(isSmallContext(0)).toBe(true)
  })

  it('accepts contexts at or above the warning threshold', () => {
    expect(isSmallContext(MIN_CONTEXT_WARNING)).toBe(false)
    expect(isSmallContext(32768)).toBe(false)
    expect(isSmallContext(262144)).toBe(false)
  })
})

describe('wouldOverflowContext', () => {
  it('flags the real incident: a 309,537-char paste against a 131,072 window', () => {
    expect(wouldOverflowContext('x'.repeat(309_537), 131_072)).toBe(true)
  })

  it('accepts a short message against any real window', () => {
    expect(wouldOverflowContext('hello', 131_072)).toBe(false)
    expect(wouldOverflowContext('hello', 16_384)).toBe(false)
  })

  it('never blocks when the window is unknown', () => {
    expect(wouldOverflowContext('x'.repeat(309_537), undefined)).toBe(false)
    expect(wouldOverflowContext('x'.repeat(309_537), 0)).toBe(false)
  })

  it('never blocks empty content', () => {
    expect(wouldOverflowContext('', 131_072)).toBe(false)
  })
})
