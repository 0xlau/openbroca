import { afterEach, describe, expect, test, vi } from 'vitest'
import type { ListeningSessionBridgeState } from '../../shared/listening-session-state'
import type { OnboardingGateSnapshot } from '../../main/onboarding-gate/types'

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
    permissions: {
      getSnapshot: () => Promise<OnboardingGateSnapshot>
      requestMicrophone: () => Promise<OnboardingGateSnapshot>
      openDesktopControlSettings: () => Promise<OnboardingGateSnapshot>
      refresh: () => Promise<OnboardingGateSnapshot>
      quitApp: () => Promise<void>
      onStateChange: (callback: (snapshot: OnboardingGateSnapshot) => void) => () => void
    }
    listeningSession: {
      cancelCapture: () => Promise<void>
      cancelProcessing: () => Promise<void>
      finishCapture: () => Promise<void>
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

  test('fetches the permission onboarding snapshot', async () => {
    const snapshot: OnboardingGateSnapshot = {
      platform: 'darwin',
      mode: 'first-run',
      canEnterMainWindow: false,
      permissionsOk: false,
      hasCompletedOnboarding: false,
      permissions: [
        {
          key: 'microphone',
          title: 'Microphone',
          description: 'Required to capture your voice.',
          status: 'missing'
        },
        {
          key: 'desktopControl',
          title: 'Desktop Control',
          description: 'Required to paste the final text into your current app.',
          status: 'needs-manual-step'
        }
      ]
    }
    invoke.mockResolvedValueOnce(snapshot)
    enableContextIsolation()

    await import('../index')

    const api = getExposedApi()
    const result = await api.permissions.getSnapshot()

    expect(invoke).toHaveBeenCalledWith('permissions:get-snapshot')
    expect(result).toEqual(snapshot)
  })

  test('requests microphone access through the permissions bridge', async () => {
    const snapshot: OnboardingGateSnapshot = {
      platform: 'darwin',
      mode: 'first-run',
      canEnterMainWindow: false,
      permissionsOk: false,
      hasCompletedOnboarding: false,
      permissions: [
        {
          key: 'microphone',
          title: 'Microphone',
          description: 'Required to capture your voice.',
          status: 'granted'
        },
        {
          key: 'desktopControl',
          title: 'Desktop Control',
          description: 'Required to paste the final text into your current app.',
          status: 'needs-manual-step'
        }
      ]
    }
    invoke.mockResolvedValueOnce(snapshot)
    enableContextIsolation()

    await import('../index')

    const api = getExposedApi()
    const result = await api.permissions.requestMicrophone()

    expect(invoke).toHaveBeenCalledWith('permissions:request-microphone')
    expect(result).toEqual(snapshot)
  })

  test('opens desktop control settings through the permissions bridge', async () => {
    const snapshot: OnboardingGateSnapshot = {
      platform: 'darwin',
      mode: 'none',
      canEnterMainWindow: true,
      permissionsOk: true,
      hasCompletedOnboarding: true,
      permissions: [
        {
          key: 'microphone',
          title: 'Microphone',
          description: 'Required to capture your voice.',
          status: 'granted'
        },
        {
          key: 'desktopControl',
          title: 'Desktop Control',
          description: 'Required to paste the final text into your current app.',
          status: 'granted'
        }
      ]
    }
    invoke.mockResolvedValueOnce(snapshot)
    enableContextIsolation()

    await import('../index')

    const api = getExposedApi()
    const result = await api.permissions.openDesktopControlSettings()

    expect(invoke).toHaveBeenCalledWith('permissions:open-desktop-control-settings')
    expect(result).toEqual(snapshot)
  })

  test('refreshes the permission gate through the permissions bridge', async () => {
    const snapshot: OnboardingGateSnapshot = {
      platform: 'darwin',
      mode: 'none',
      canEnterMainWindow: true,
      permissionsOk: true,
      hasCompletedOnboarding: true,
      permissions: [
        {
          key: 'microphone',
          title: 'Microphone',
          description: 'Required to capture your voice.',
          status: 'granted'
        },
        {
          key: 'desktopControl',
          title: 'Desktop Control',
          description: 'Required to paste the final text into your current app.',
          status: 'granted'
        }
      ]
    }
    invoke.mockResolvedValueOnce(snapshot)
    enableContextIsolation()

    await import('../index')

    const api = getExposedApi()
    const result = await api.permissions.refresh()

    expect(invoke).toHaveBeenCalledWith('permissions:refresh')
    expect(result).toEqual(snapshot)
  })

  test('quits the app through the permissions bridge', async () => {
    enableContextIsolation()

    await import('../index')

    const api = getExposedApi()
    await api.permissions.quitApp()

    expect(invoke).toHaveBeenCalledWith('permissions:quit-app')
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

  test('cancels an active capture through the main-process bridge', async () => {
    enableContextIsolation()

    await import('../index')

    const api = getExposedApi()
    await api.listeningSession.cancelCapture()

    expect(invoke).toHaveBeenCalledWith('listening-session:cancel-capture')
  })

  test('finishes a sustained capture through the main-process bridge', async () => {
    enableContextIsolation()

    await import('../index')

    const api = getExposedApi()
    await api.listeningSession.finishCapture()

    expect(invoke).toHaveBeenCalledWith('listening-session:finish-capture')
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
    handler?.({}, {
      state: { status: 'idle' },
      targetApp: null
    } satisfies ListeningSessionBridgeState)

    expect(removeListener).toHaveBeenCalledWith('listening-session:state-changed', handler)
  })
})

describe('preload permissions bridge', () => {
  afterEach(() => {
    vi.resetModules()
    invoke.mockReset()
    on.mockReset()
    removeListener.mockReset()
    exposeInMainWorld.mockReset()
  })

  test('onStateChange registers ipcRenderer listener and returns unsubscribe', async () => {
    enableContextIsolation()
    await import('../index')
    const api = getExposedApi()

    const callback = vi.fn()
    const unsubscribe = api.permissions.onStateChange(callback)

    expect(on).toHaveBeenCalledTimes(1)
    expect(on.mock.calls[0]?.[0]).toBe('onboarding:state-changed')

    const handler = on.mock.calls[0]?.[1] as (
      event: unknown,
      snapshot: OnboardingGateSnapshot
    ) => void
    const fakeSnapshot: OnboardingGateSnapshot = {
      platform: 'darwin',
      mode: 'first-run',
      canEnterMainWindow: false,
      permissionsOk: false,
      hasCompletedOnboarding: false,
      permissions: []
    }
    handler({}, fakeSnapshot)
    expect(callback).toHaveBeenCalledWith(fakeSnapshot)

    unsubscribe()
    expect(removeListener).toHaveBeenCalledWith('onboarding:state-changed', handler)
  })
})
