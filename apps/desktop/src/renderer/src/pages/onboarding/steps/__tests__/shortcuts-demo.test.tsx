// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: new Proxy(
    {},
    {
      get:
        (_, tag: string) =>
        ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
          React.createElement(tag, props, children)
    }
  )
}))

vi.mock('@hugeicons/react', () => ({
  HugeiconsIcon: () => <span />
}))

describe('ShortcutsDemo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  test('walks through listening → transcribing → pasted, then onComplete', async () => {
    const onComplete = vi.fn()
    const { ShortcutsDemo } = await import('../shortcuts-demo')

    render(<ShortcutsDemo transcript="Hello, OpenBroca." onComplete={onComplete} />)

    expect(screen.getByTestId('demo-stage').dataset.stage).toBe('listening')

    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByTestId('demo-stage').dataset.stage).toBe('transcribing')

    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    expect(screen.getByTestId('demo-stage').dataset.stage).toBe('pasted')
    expect(screen.getByText(/Hello, OpenBroca\./)).toBeTruthy()

    await act(async () => {
      vi.advanceTimersByTime(1400)
    })
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  test('unmount cancels pending stages without calling onComplete', async () => {
    const onComplete = vi.fn()
    const { ShortcutsDemo } = await import('../shortcuts-demo')
    const { unmount } = render(<ShortcutsDemo transcript="x" onComplete={onComplete} />)
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    unmount()
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    expect(onComplete).not.toHaveBeenCalled()
  })
})
