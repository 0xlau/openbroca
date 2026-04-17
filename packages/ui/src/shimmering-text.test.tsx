// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { ShimmeringText } from './shimmering-text'

describe('ShimmeringText', () => {
  test('renders a span with the shared shimmer slot and merged classes', () => {
    render(
      <ShimmeringText className="text-sm" data-testid="shimmering-text">
        Processing...
      </ShimmeringText>
    )

    const text = screen.getByTestId('shimmering-text')

    expect(text.tagName).toBe('SPAN')
    expect(text.getAttribute('data-slot')).toBe('shimmering-text')
    expect(text.className).toContain('openbroca-shimmering-text')
    expect(text.className).toContain('text-sm')
    expect(text.textContent).toBe('Processing...')
  })
})
