// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, waitFor, within } from '@testing-library/react'
import { createStore } from 'zustand'
import type { ListeningSessionBridgeState, ListeningSessionState } from '../../../../../shared/listening-session-state'

vi.mock('@openbroca/ui', () => ({
  Button: ({
    children,
    onClick
  }: {
    children: React.ReactNode
    onClick?: () => void
  }) => <button onClick={onClick}>{children}</button>,
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
  LiveWaveform: ({ active }: { active: boolean }) => (
    <div data-testid="waveform" data-active={String(active)} />
  ),
  ShimmeringText: ({
    children,
    className
  }: {
    children: React.ReactNode
    className?: string
  }) => (
    <span data-testid="shimmering-text" className={className}>
      {children}
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
    cancelProcessing?: ReturnType<typeof vi.fn>
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
      cancelProcessing: overrides.cancelProcessing ?? vi.fn().mockResolvedValue(undefined),
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
