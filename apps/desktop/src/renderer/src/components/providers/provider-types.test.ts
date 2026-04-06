import { describe, expect, it } from 'vitest'
import { resolveProviderIconSrc, shouldInvertProviderIcon } from './provider-types'

describe('resolveProviderIconSrc', () => {
  it('wraps inline svg markup in a data URI', () => {
    const src = resolveProviderIconSrc('<svg viewBox="0 0 1 1"></svg>')

    expect(src).toMatch(/^data:image\/svg\+xml,/)
    expect(src).toContain(encodeURIComponent('<svg viewBox="0 0 1 1"></svg>'))
  })

  it('returns remote icon URLs unchanged', () => {
    const url = 'https://unpkg.com/@lobehub/icons-static-svg@latest/icons/openai-color.svg'

    expect(resolveProviderIconSrc(url)).toBe(url)
  })

  it('returns undefined for blank values', () => {
    expect(resolveProviderIconSrc('   ')).toBeUndefined()
    expect(resolveProviderIconSrc(undefined)).toBeUndefined()
  })
})

describe('shouldInvertProviderIcon', () => {
  it('marks mono lobe svg urls for dark-theme inversion', () => {
    expect(
      shouldInvertProviderIcon('https://unpkg.com/@lobehub/icons-static-svg@latest/icons/openai.svg')
    ).toBe(true)
    expect(
      shouldInvertProviderIcon('https://unpkg.com/@lobehub/icons-static-svg@latest/icons/codex.svg')
    ).toBe(true)
    expect(
      shouldInvertProviderIcon(
        'https://unpkg.com/@lobehub/icons-static-svg@latest/icons/openrouter.svg'
      )
    ).toBe(true)
  })

  it('does not invert color assets or inline svg markup', () => {
    expect(
      shouldInvertProviderIcon(
        'https://unpkg.com/@lobehub/icons-static-svg@latest/icons/codex-color.svg'
      )
    ).toBe(false)
    expect(shouldInvertProviderIcon('<svg viewBox="0 0 1 1"></svg>')).toBe(false)
    expect(shouldInvertProviderIcon(undefined)).toBe(false)
  })
})
