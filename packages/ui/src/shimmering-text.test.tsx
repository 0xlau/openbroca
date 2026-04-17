// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { ShimmeringText } from './index'

describe('ShimmeringText', () => {
  test('is exported from the package root and renders the shared slot contract', () => {
    render(
      <ShimmeringText
        className="text-sm"
        data-testid="shimmering-text"
        title="Shared loading text"
      >
        Processing...
      </ShimmeringText>
    )

    const text = screen.getByTestId('shimmering-text')

    expect(text.tagName).toBe('SPAN')
    expect(text.getAttribute('data-slot')).toBe('shimmering-text')
    expect(text.className).toContain('text-sm')
    expect(text.getAttribute('title')).toBe('Shared loading text')
    expect(text.textContent).toBe('Processing...')
  })
})
