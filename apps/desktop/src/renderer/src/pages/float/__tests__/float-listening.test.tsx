// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, waitFor, within } from '@testing-library/react'
import { createStore } from 'zustand'
import type { ListeningSessionState } from '../../../../../shared/listening-session-state'

vi.mock('@openbroca/ui', () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  LiveWaveform: ({ active }: { active: boolean }) => (
    <div data-testid="waveform" data-active={String(active)} />
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

async function renderForState(state: ListeningSessionState) {
  const listeners = new Set<(next: ListeningSessionState) => void>()
  window.api = {
    ...window.api,
    windowControls: {
      minimize: vi.fn(),
      maximize: vi.fn(),
      close: vi.fn()
    },
    listeningSession: {
      getState: vi.fn().mockResolvedValue(state),
      onStateChange: vi.fn((callback) => {
        listeners.add(callback)
        return () => listeners.delete(callback)
      })
    }
  }

  const { FloatListening } = await import('../float-listening')
  const view = render(<FloatListening />)

  await waitFor(() => {
    expect(within(view.container).queryByTestId('waveform')).not.toBeNull()
  })

  return {
    waveform: within(view.container).getByTestId('waveform'),
    emit(next: ListeningSessionState) {
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
    const { waveform } = await renderForState({ status: 'listening' })

    await waitFor(() => {
      expect(waveform.getAttribute('data-active')).toBe('true')
    })
  })

  test.each([
    { status: 'idle' },
    { status: 'starting' },
    { status: 'stopping' },
    { status: 'error', message: 'boom' }
  ] satisfies ListeningSessionState[])('keeps the waveform inactive for %o', async (state) => {
    const { waveform } = await renderForState(state)

    await waitFor(() => {
      expect(waveform.getAttribute('data-active')).toBe('false')
    })
  })

  test('reacts to later session updates from the bridge', async () => {
    const { emit, waveform } = await renderForState({ status: 'starting' })

    await waitFor(() => {
      expect(waveform.getAttribute('data-active')).toBe('false')
    })

    emit({ status: 'listening' })

    await waitFor(() => {
      expect(waveform.getAttribute('data-active')).toBe('true')
    })
  })
})
