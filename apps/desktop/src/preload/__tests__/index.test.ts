import { afterEach, describe, expect, test, vi } from 'vitest'
import type { ListeningSessionState } from '../../shared/listening-session-state'

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
    listeningSession: {
      getState: () => Promise<ListeningSessionState>
      onStateChange: (callback: (state: ListeningSessionState) => void) => () => void
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
    const state: ListeningSessionState = { status: 'listening' }
    invoke.mockResolvedValueOnce(state)
    enableContextIsolation()

    await import('../index')

    const api = getExposedApi()
    const result = await api.listeningSession.getState()

    expect(invoke).toHaveBeenCalledWith('listening-session:get-state')
    expect(result).toEqual(state)
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
    const state: ListeningSessionState = { status: 'starting' }

    handler?.({}, state)

    expect(listener).toHaveBeenCalledWith(state)
    expect(typeof unsubscribe).toBe('function')
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
    handler?.({}, { status: 'idle' } satisfies ListeningSessionState)

    expect(removeListener).toHaveBeenCalledWith('listening-session:state-changed', handler)
  })
})
