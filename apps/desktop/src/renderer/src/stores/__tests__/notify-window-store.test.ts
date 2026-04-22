// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from 'vitest'
import type { NotifyWindowBridgeState } from '../../../../../shared/notify-window-state'

describe('notifyWindowStore', () => {
  afterEach(() => {
    vi.resetModules()
  })

  test('initializes from the bridge snapshot and applies live updates', async () => {
    const listeners = new Set<(state: NotifyWindowBridgeState) => void>()
    const getState = vi.fn().mockResolvedValue({
      notification: {
        title: 'Copied to clipboard',
        body: 'Paste it into the target app'
      }
    })
    const onStateChange = vi.fn((callback) => {
      listeners.add(callback)
      return () => listeners.delete(callback)
    })

    window.api = {
      windowControls: {
        minimize: vi.fn(),
        maximize: vi.fn(),
        close: vi.fn()
      },
      providerAuth: {
        connect: vi.fn(),
        disconnect: vi.fn()
      },
      listeningSession: {
        cancelCapture: vi.fn(),
        cancelProcessing: vi.fn(),
        finishCapture: vi.fn(),
        getState: vi.fn().mockResolvedValue({
          state: { status: 'idle' },
          targetApp: null
        }),
        onStateChange: vi.fn(() => vi.fn())
      },
      notifyWindow: {
        getState,
        onStateChange
      }
    }

    const { notifyWindowStore } = await import('../notify-window-store')
    notifyWindowStore.subscribe(() => {})

    await vi.waitFor(() => {
      expect(notifyWindowStore.getState().bridge).toEqual({
        notification: {
          title: 'Copied to clipboard',
          body: 'Paste it into the target app'
        }
      })
    })

    for (const listener of listeners) {
      listener({
        notification: {
          title: 'Copied again'
        }
      })
    }

    expect(onStateChange).toHaveBeenCalledTimes(1)
    expect(getState).toHaveBeenCalledTimes(1)
    expect(notifyWindowStore.getState().bridge).toEqual({
      notification: {
        title: 'Copied again'
      }
    })
  })
})
