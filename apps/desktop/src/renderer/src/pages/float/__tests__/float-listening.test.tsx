// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import { createStore } from 'zustand'
import type { ListeningSessionBridgeState, ListeningSessionState } from '../../../../../shared/listening-session-state'

vi.mock('@openbroca/ui', () => ({
  Button: ({
    children,
    onClick,
    className,
    ...props
  }: {
    children: React.ReactNode
    onClick?: () => void
    className?: string
    [key: string]: unknown
  }) => (
    <button onClick={onClick} className={className} {...props}>
      {children}
    </button>
  ),
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
  LiveWaveform: ({ active }: { active: boolean }) => (
    <div data-testid="waveform" data-active={String(active)} />
  ),
  ShimmeringText: ({
    text,
    className
  }: {
    text: string
    className?: string
  }) => (
    <span data-testid="shimmering-text" className={className}>
      {text}
    </span>
  )
}))

vi.mock('@renderer/stores/microphone-store', () => ({
  microphoneStore: createStore(() => ({
    data: {
      selectedDeviceId: null,
      selectedBrowserDeviceId: null
    }
  }))
}))

async function renderForBridgeState(
  bridge: ListeningSessionBridgeState,
  overrides: {
    cancelCapture?: ReturnType<typeof vi.fn>
    cancelProcessing?: ReturnType<typeof vi.fn>
    finishCapture?: ReturnType<typeof vi.fn>
  } = {}
) {
  const listeners = new Set<(next: ListeningSessionBridgeState) => void>()
  window.api = {
    ...window.api,
    windowControls: {
      minimize: vi.fn(),
      maximize: vi.fn(),
      close: vi.fn()
    },
    listeningSession: {
      getState: vi.fn().mockResolvedValue(bridge),
      cancelCapture: overrides.cancelCapture ?? vi.fn().mockResolvedValue(undefined),
      cancelProcessing: overrides.cancelProcessing ?? vi.fn().mockResolvedValue(undefined),
      finishCapture: overrides.finishCapture ?? vi.fn().mockResolvedValue(undefined),
      onStateChange: vi.fn((callback) => {
        listeners.add(callback)
        return () => listeners.delete(callback)
      })
    }
  }

  const { FloatListening } = await import('../float-listening')
  const view = render(<FloatListening />)

  await waitFor(() => {
    expect(view.container.firstChild).not.toBeNull()
  })

  return {
    container: view.container,
    get waveform() {
      return within(view.container).queryByTestId('waveform')
    },
    emit(next: ListeningSessionBridgeState) {
      for (const listener of listeners) {
        listener(next)
      }
    }
  }
}

describe('FloatListening', () => {
  beforeEach(() => {
    vi.resetModules()
    cleanup()
    document.body.className = ''
  })

  test('activates the waveform only while listening', async () => {
    const { waveform } = await renderForBridgeState({
      state: { status: 'listening' },
      targetApp: null
    })

    await waitFor(() => {
      expect(waveform?.getAttribute('data-active')).toBe('true')
    })
  })

  test.each([
    { status: 'idle' },
    { status: 'starting' },
    { status: 'error', message: 'boom' }
  ] satisfies ListeningSessionState[])('keeps the waveform inactive for %o', async (state) => {
    const { waveform } = await renderForBridgeState({
      state,
      targetApp: null
    })

    await waitFor(() => {
      expect(waveform?.getAttribute('data-active')).toBe('false')
    })
  })

  test('hides the waveform while stopping', async () => {
    const { container } = await renderForBridgeState({
      state: { status: 'stopping' },
      targetApp: null
    })

    await waitFor(() => {
      expect(within(container).queryByTestId('waveform')).toBeNull()
    })
  })

  test('renders the processing shell for stopping and processing states', async () => {
    const { container, emit } = await renderForBridgeState({
      state: { status: 'stopping' },
      targetApp: {
        id: 'cursor',
        displayName: 'Cursor',
        platform: 'macos',
        bundleId: 'com.todesktop.230313mzl4w4u92',
        path: '/Applications/Cursor.app',
        source: 'detected',
        iconDataUrl: 'data:image/png;base64,cursor'
      }
    })

    await waitFor(() => {
      expect(within(container).getByText('Thinking...')).toBeTruthy()
      expect(within(container).queryByTestId('waveform')).toBeNull()
      expect(within(container).queryByTestId('float-target-app-icon')).toBeNull()
      expect(within(container).queryByRole('button')).toBeNull()
    })

    emit({
      state: { status: 'processing' },
      targetApp: {
        id: 'cursor',
        displayName: 'Cursor',
        platform: 'macos',
        bundleId: 'com.todesktop.230313mzl4w4u92',
        path: '/Applications/Cursor.app',
        source: 'detected',
        iconDataUrl: 'data:image/png;base64,cursor'
      }
    })

    await waitFor(() => {
      expect(within(container).getByText('Thinking...')).toBeTruthy()
      expect(within(container).queryByTestId('waveform')).toBeNull()
      expect(within(container).queryByTestId('float-target-app-icon')).toBeNull()
      expect(within(container).getByRole('button')).toBeTruthy()
    })
  })

  test('uses a flexible processing layout that fits within the floating window', async () => {
    const { container } = await renderForBridgeState({
      state: { status: 'processing' },
      targetApp: null
    })

    await waitFor(() => {
      const outer = container.firstElementChild as HTMLElement | null
      const shell = within(container).getByText('Thinking...').parentElement?.parentElement as HTMLElement | null
      expect(outer?.className).toContain('w-full')
      expect(shell?.className).toContain('flex-1')
      expect(shell?.className).toContain('min-w-0')
      expect(shell?.className).not.toContain('w-[320px]')
    })
  })

  test('clicking cancel while processing invokes the preload bridge', async () => {
    const cancelProcessing = vi.fn().mockResolvedValue(undefined)
    const { container } = await renderForBridgeState(
      {
        state: { status: 'processing' },
        targetApp: null
      },
      { cancelProcessing }
    )

    await waitFor(() => {
      expect(within(container).getByRole('button')).toBeTruthy()
    })

    within(container).getByRole('button').click()

    await waitFor(() => {
      expect(cancelProcessing).toHaveBeenCalledTimes(1)
    })
  })

  test.each([
    { name: 'latched', captureMode: 'latched' as const },
    { name: 'hold', captureMode: 'hold' as const }
  ])('shows a confirm button while listening in %s capture mode', async ({ captureMode }) => {
    const { container } = await renderForBridgeState({
      state: { status: 'listening' },
      captureMode,
      targetApp: null
    })

    await waitFor(() => {
      expect(within(container).getByRole('button', { name: 'Confirm capture' })).toBeTruthy()
    })
  })

  test.each([
    { name: 'latched', captureMode: 'latched' as const },
    { name: 'hold', captureMode: 'hold' as const }
  ])('shows a cancel button while listening in %s capture mode', async ({ captureMode }) => {
    const { container } = await renderForBridgeState({
      state: { status: 'listening' },
      captureMode,
      targetApp: null
    })

    await waitFor(() => {
      expect(within(container).getByRole('button', { name: 'Cancel capture' })).toBeTruthy()
    })
  })

  test.each([
    {
      name: 'quick listening',
      bridge: {
        state: { status: 'listening' },
        captureMode: 'quick' as const,
        targetApp: null
      }
    },
    {
      name: 'processing',
      bridge: {
        state: { status: 'processing' },
        captureMode: 'latched' as const,
        targetApp: null
      }
    }
  ])('hides the confirm button for %s', async ({ bridge }) => {
    const { container } = await renderForBridgeState(bridge)

    await waitFor(() => {
      expect(within(container).queryByRole('button', { name: 'Confirm capture' })).toBeNull()
    })
  })

  test('clicking confirm finishes capture through the preload bridge', async () => {
    const finishCapture = vi.fn().mockResolvedValue(undefined)
    const { container } = await renderForBridgeState(
      {
        state: { status: 'listening' },
        captureMode: 'latched',
        targetApp: null
      },
      { finishCapture }
    )

    await waitFor(() => {
      expect(within(container).getByRole('button', { name: 'Confirm capture' })).toBeTruthy()
    })

    fireEvent.click(within(container).getByRole('button', { name: 'Confirm capture' }))

    await waitFor(() => {
      expect(finishCapture).toHaveBeenCalledTimes(1)
    })
  })

  test.each([
    { name: 'latched', captureMode: 'latched' as const },
    { name: 'hold', captureMode: 'hold' as const }
  ])('clicking cancel in %s mode cancels capture through the preload bridge', async ({ captureMode }) => {
    const cancelCapture = vi.fn().mockResolvedValue(undefined)
    const { container } = await renderForBridgeState(
      {
        state: { status: 'listening' },
        captureMode,
        targetApp: null
      },
      { cancelCapture }
    )

    await waitFor(() => {
      expect(within(container).getByRole('button', { name: 'Cancel capture' })).toBeTruthy()
    })

    fireEvent.click(within(container).getByRole('button', { name: 'Cancel capture' }))

    await waitFor(() => {
      expect(cancelCapture).toHaveBeenCalledTimes(1)
    })
  })

  test('renders the target app icon when one is available', async () => {
    const { container } = await renderForBridgeState({
      state: { status: 'listening' },
      targetApp: {
        id: 'cursor',
        displayName: 'Cursor',
        platform: 'macos',
        bundleId: 'com.todesktop.230313mzl4w4u92',
        path: '/Applications/Cursor.app',
        source: 'detected',
        iconDataUrl: 'data:image/png;base64,cursor'
      }
    })

    await waitFor(() => {
      const icon = within(container).getByAltText('Cursor icon')
      expect(icon).toBeTruthy()
      expect(icon.getAttribute('src')).toBe('data:image/png;base64,cursor')
      expect(within(container).getByTestId('float-target-app-icon')).toBeTruthy()
    })
  })

  test('does not render the icon container when target app is missing or iconless', async () => {
    const { container, emit } = await renderForBridgeState({
      state: { status: 'starting' },
      targetApp: null
    })

    await waitFor(() => {
      expect(within(container).queryByTestId('float-target-app-icon')).toBeNull()
    })

    emit({
      state: { status: 'listening' },
      targetApp: {
        id: 'cursor',
        displayName: 'Cursor',
        platform: 'macos',
        bundleId: 'com.todesktop.230313mzl4w4u92',
        path: '/Applications/Cursor.app',
        source: 'detected'
      }
    })

    await waitFor(() => {
      expect(within(container).queryByTestId('float-target-app-icon')).toBeNull()
    })
  })

  test('renders the icon when a later bridge update adds one', async () => {
    const { container, emit } = await renderForBridgeState({
      state: { status: 'starting' },
      targetApp: null
    })

    await waitFor(() => {
      expect(within(container).queryByTestId('float-target-app-icon')).toBeNull()
    })

    emit({
      state: { status: 'listening' },
      targetApp: {
        id: 'cursor',
        displayName: 'Cursor',
        platform: 'macos',
        bundleId: 'com.todesktop.230313mzl4w4u92',
        path: '/Applications/Cursor.app',
        source: 'detected',
        iconDataUrl: 'data:image/png;base64,cursor'
      }
    })

    await waitFor(() => {
      const icon = within(container).getByAltText('Cursor icon')
      expect(icon.getAttribute('src')).toBe('data:image/png;base64,cursor')
    })
  })

  test('reacts to later session updates from the bridge', async () => {
    const { emit, waveform } = await renderForBridgeState({
      state: { status: 'starting' },
      targetApp: null
    })

    await waitFor(() => {
      expect(waveform?.getAttribute('data-active')).toBe('false')
    })

    emit({
      state: { status: 'listening' },
      targetApp: null
    })

    await waitFor(() => {
      expect(waveform?.getAttribute('data-active')).toBe('true')
    })
  })
})
