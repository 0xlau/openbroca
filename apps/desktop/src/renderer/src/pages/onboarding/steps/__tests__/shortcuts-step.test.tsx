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

vi.mock('@renderer/hooks/use-platform', () => ({
  usePlatform: () => ({ isMac: true, isWindows: false, isLinux: false })
}))

describe('ShortcutsStep', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    vi.resetModules()
    const mod = await import('../shortcuts-step')
    mod.shortcutsStepStore.getState().reset()
  })
  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  test('starts on Quick sub-step in detecting state', async () => {
    const { ShortcutsStep } = await import('../shortcuts-step')
    render(<ShortcutsStep />)
    expect(screen.getByText(/Quick — double-tap/)).toBeTruthy()
  })

  test('after Quick detection, demo runs and then shell switches to Hold', async () => {
    const { ShortcutsStep, shortcutsStepStore } = await import('../shortcuts-step')
    render(<ShortcutsStep />)

    act(() => {
      shortcutsStepStore.getState().markQuickDetected()
    })

    expect(screen.getByTestId('demo-stage')).toBeTruthy()

    await act(async () => {
      vi.advanceTimersByTime(3100)
    })

    expect(shortcutsStepStore.getState().subStep).toBe('hold')
    expect(screen.getByText(/Hold —/)).toBeTruthy()  // "Hold — press and hold"
  })

  test('after Hold detection and demo, bothDone is true', async () => {
    const { ShortcutsStep, shortcutsStepStore } = await import('../shortcuts-step')
    render(<ShortcutsStep />)

    act(() => {
      shortcutsStepStore.setState({ subStep: 'hold', state: 'detecting' })
    })

    act(() => {
      shortcutsStepStore.getState().markHoldDetected()
    })

    await act(async () => {
      vi.advanceTimersByTime(3100)
    })

    expect(shortcutsStepStore.getState().bothDone).toBe(true)
  })

  test('useShortcutsStepReady reflects bothDone', async () => {
    const { useShortcutsStepReady, shortcutsStepStore } = await import('../shortcuts-step')

    function Probe(): React.ReactElement {
      return <div data-testid="ready">{String(useShortcutsStepReady())}</div>
    }

    render(<Probe />)
    expect(screen.getByTestId('ready').textContent).toBe('false')

    act(() => {
      shortcutsStepStore.setState({ bothDone: true })
    })

    expect(screen.getByTestId('ready').textContent).toBe('true')
  })
})
