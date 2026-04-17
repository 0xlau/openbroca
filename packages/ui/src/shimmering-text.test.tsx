// @vitest-environment jsdom

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { ShimmeringText } from './index'

function getShimmeringTextCss() {
  const candidatePaths = [
    path.resolve(process.cwd(), 'packages/ui/src/shimmering-text.css'),
    path.resolve(process.cwd(), 'src/shimmering-text.css')
  ]

  const cssPath = candidatePaths.find((candidatePath) => existsSync(candidatePath))

  if (!cssPath) {
    throw new Error(`Unable to locate shimmering-text.css from cwd: ${process.cwd()}`)
  }

  return readFileSync(cssPath, 'utf8')
}

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
    const shimmeringTextCss = getShimmeringTextCss()

    expect(shimmeringTextCss).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*{[\s\S]*?\.openbroca-shimmering-text\s*{[\s\S]*?animation:\s*none;[\s\S]*?background-image:\s*none;[\s\S]*?background-clip:\s*border-box;[\s\S]*?color:\s*inherit;[\s\S]*?-webkit-text-fill-color:\s*currentColor;[\s\S]*?}/
    )
  })
})
