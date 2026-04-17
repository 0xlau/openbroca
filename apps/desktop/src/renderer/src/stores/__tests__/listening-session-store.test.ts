// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from 'vitest'
import type { ListeningSessionBridgeState } from '../../../../shared/listening-session-state'

describe('listeningSessionStore', () => {
  afterEach(() => {
    vi.resetModules()
  })

  test('initializes itself on first subscription', async () => {
    const listeners = new Set<(state: ListeningSessionBridgeState) => void>()
    const getState = vi.fn().mockResolvedValue({
      state: { status: 'idle' },
      targetApp: null
    } satisfies ListeningSessionBridgeState)
    const onStateChange = vi.fn((callback: (state: ListeningSessionBridgeState) => void) => {
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
    const getState = vi.fn().mockResolvedValue({
      state: { status: 'idle' },
      targetApp: null
    } satisfies ListeningSessionBridgeState)
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

  test('applies later bridge updates over the initial snapshot', async () => {
    const listeners = new Set<(state: ListeningSessionBridgeState) => void>()
    window.api = {
      ...window.api,
      windowControls: {
        minimize: vi.fn(),
        maximize: vi.fn(),
        close: vi.fn()
      },
      listeningSession: {
        getState: vi.fn().mockResolvedValue({
          state: { status: 'starting' },
          targetApp: null
        } satisfies ListeningSessionBridgeState),
        onStateChange: vi.fn((callback: (state: ListeningSessionBridgeState) => void) => {
          listeners.add(callback)
          return () => listeners.delete(callback)
        })
      }
    }

    const { listeningSessionStore } = await import('../listening-session-store')
    listeningSessionStore.subscribe(() => {})

    for (const listener of listeners) {
      listener({
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
    }

    expect(listeningSessionStore.getState().bridge).toEqual({
      state: { status: 'listening' },
      targetApp: expect.objectContaining({
        id: 'cursor',
        iconDataUrl: 'data:image/png;base64,cursor'
      })
    })
  })
})
