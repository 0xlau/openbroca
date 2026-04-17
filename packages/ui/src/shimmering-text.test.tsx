// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { ShimmeringText } from './index'

class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: MockIntersectionObserver
})

describe('ShimmeringText', () => {
  test('is exported from the package root and renders the shared slot contract', () => {
    render(
      <ShimmeringText
        text="Processing..."
        className="text-sm"
        data-testid="shimmering-text"
        title="Shared loading text"
        startOnView={false}
      />
    )

    const text = screen.getByTestId('shimmering-text')

    expect(text.tagName).toBe('SPAN')
    expect(text.getAttribute('data-slot')).toBe('shimmering-text')
    expect(text.className).toContain('text-sm')
    expect(text.getAttribute('title')).toBe('Shared loading text')
    expect(text.textContent).toBe('Processing...')
  })

  test('accepts explicit base and shimmer colors', () => {
    render(
      <ShimmeringText
        text="Thinking..."
        data-testid="colored-shimmering-text"
        color="var(--muted-foreground)"
        shimmerColor="var(--foreground)"
        startOnView={false}
      />
    )

    const text = screen.getByTestId('colored-shimmering-text')
    const style = text.getAttribute('style') ?? ''

    expect(style).toContain('--base-color: var(--muted-foreground)')
    expect(style).toContain('--shimmer-color: var(--foreground)')
  })
})
