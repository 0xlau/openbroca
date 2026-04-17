import { afterEach, describe, expect, test, vi } from 'vitest'
import type { ListeningSessionBridgeState } from '../../shared/listening-session-state'

const invoke = vi.fn()
const on = vi.fn()
const removeListener = vi.fn()
const exposeInMainWorld = vi.fn()

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld
  },
  ipcRenderer: {
    invoke,
    on,
    removeListener
  }
}))

vi.mock('@electron-toolkit/preload', () => ({
  electronAPI: {}
}))

function getExposedApi() {
  const call = exposeInMainWorld.mock.calls.find(([key]) => key === 'api')
  return call?.[1] as {
    providerAuth: {
      connect: (providerId: string) => Promise<unknown>
      disconnect: (providerId: string) => Promise<void>
    }
    listeningSession: {
      cancelProcessing: () => Promise<void>
      getState: () => Promise<ListeningSessionBridgeState>
      onStateChange: (callback: (state: ListeningSessionBridgeState) => void) => () => void
    }
  }
}

function enableContextIsolation() {
  Object.defineProperty(process, 'contextIsolated', {
    configurable: true,
    value: true
  })
}

describe('preload listeningSession bridge', () => {
  afterEach(() => {
    vi.resetModules()
    invoke.mockReset()
    on.mockReset()
    removeListener.mockReset()
    exposeInMainWorld.mockReset()
  })

  test('fetches the current listening session snapshot', async () => {
    const bridge: ListeningSessionBridgeState = {
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
    }
    invoke.mockResolvedValueOnce(bridge)
    enableContextIsolation()

    await import('../index')

    const api = getExposedApi()
    const result = await api.listeningSession.getState()

    expect(invoke).toHaveBeenCalledWith('listening-session:get-state')
    expect(result).toEqual(bridge)
  })

  test('connects a provider through the main-process auth bridge', async () => {
    const response = { status: 'connected', providerId: 'openai-codex' }
    invoke.mockResolvedValueOnce(response)
    enableContextIsolation()

    await import('../index')

    const api = getExposedApi()
    const result = await api.providerAuth.connect('openai-codex')

    expect(invoke).toHaveBeenCalledWith('provider-auth:connect', 'openai-codex')
    expect(result).toEqual(response)
  })

  test('disconnects a provider through the main-process auth bridge', async () => {
    enableContextIsolation()

    await import('../index')

    const api = getExposedApi()
    await api.providerAuth.disconnect('openai-codex')

    expect(invoke).toHaveBeenCalledWith('provider-auth:disconnect', 'openai-codex')
  })

  test('subscribers receive listening session state updates', async () => {
    enableContextIsolation()
    await import('../index')

    const api = getExposedApi()
    const listener = vi.fn()
    const unsubscribe = api.listeningSession.onStateChange(listener)

    const handler = on.mock.calls.find(
      ([channel]) => channel === 'listening-session:state-changed'
    )?.[1]
    const state: ListeningSessionBridgeState = {
      state: { status: 'starting' },
      targetApp: null
    }

    handler?.({}, state)

    expect(listener).toHaveBeenCalledWith(state)
    expect(typeof unsubscribe).toBe('function')
  })

  test('cancels post-recording processing through the main-process bridge', async () => {
    enableContextIsolation()

    await import('../index')

    const api = getExposedApi()
    await api.listeningSession.cancelProcessing()

    expect(invoke).toHaveBeenCalledWith('listening-session:cancel-processing')
  })

  test('unsubscribed listeners stop receiving updates', async () => {
    enableContextIsolation()
    await import('../index')

    const api = getExposedApi()
    const listener = vi.fn()
    const unsubscribe = api.listeningSession.onStateChange(listener)
    const handler = on.mock.calls.find(
      ([channel]) => channel === 'listening-session:state-changed'
    )?.[1]

    unsubscribe()
    handler?.(
      {},
      {
        state: { status: 'idle' },
        targetApp: null
      } satisfies ListeningSessionBridgeState
    )

    expect(removeListener).toHaveBeenCalledWith('listening-session:state-changed', handler)
  })
})
