// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { ShimmeringText } from './index'

const shimmeringTextCss = readFileSync(
  path.resolve(process.cwd(), 'packages/ui/src/shimmering-text.css'),
  'utf8'
)

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

  test('restores ordinary static text styles for reduced motion users', () => {
    expect(shimmeringTextCss).toContain('@media (prefers-reduced-motion: reduce)')
    expect(shimmeringTextCss).toContain('animation: none;')
    expect(shimmeringTextCss).toContain('background-image: none;')
    expect(shimmeringTextCss).toContain('background-clip: border-box;')
    expect(shimmeringTextCss).toContain('color: inherit;')
    expect(shimmeringTextCss).toContain('-webkit-text-fill-color: currentColor;')
  })
})
