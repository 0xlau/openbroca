// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from 'vitest'
import type { ListeningSessionState } from '../../../../shared/listening-session-state'

describe('listeningSessionStore', () => {
  afterEach(() => {
    vi.resetModules()
  })

  test('initializes itself on first subscription', async () => {
    const listeners = new Set<(state: ListeningSessionState) => void>()
    const getState = vi.fn().mockResolvedValue({ status: 'idle' } satisfies ListeningSessionState)
    const onStateChange = vi.fn((callback: (state: ListeningSessionState) => void) => {
      listeners.add(callback)
      return () => listeners.delete(callback)
    })

    window.api = {
      ...window.api,
      windowControls: {
        minimize: vi.fn(),
        maximize: vi.fn(),
        close: vi.fn()
      },
      listeningSession: {
        getState,
        onStateChange
      }
    }

    const { listeningSessionStore } = await import('../listening-session-store')
    const unsubscribe = listeningSessionStore.subscribe(() => {})

    expect(onStateChange).toHaveBeenCalledTimes(1)
    expect(getState).toHaveBeenCalledTimes(1)

    unsubscribe()
  })

  test('reuses the same bridge subscription after first initialization', async () => {
    const getState = vi.fn().mockResolvedValue({ status: 'idle' } satisfies ListeningSessionState)
    const onStateChange = vi.fn(() => vi.fn())

    window.api = {
      ...window.api,
      windowControls: {
        minimize: vi.fn(),
        maximize: vi.fn(),
        close: vi.fn()
      },
      listeningSession: {
        getState,
        onStateChange
      }
    }

    const { listeningSessionStore } = await import('../listening-session-store')
    const unsubscribeA = listeningSessionStore.subscribe(() => {})
    const unsubscribeB = listeningSessionStore.subscribe(() => {})

    expect(onStateChange).toHaveBeenCalledTimes(1)
    expect(getState).toHaveBeenCalledTimes(1)

    unsubscribeA()
    unsubscribeB()
  })
})
