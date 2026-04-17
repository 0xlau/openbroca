import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { ListeningSessionBridgeState } from '../../shared/listening-session-state'

const FLOATING_LISTENING_SIZE = { width: 180, height: 38 }
const FLOATING_PROCESSING_SIZE = { width: 360, height: 38 }

vi.mock('../windows/floating-window', () => ({
  FLOATING_LISTENING_SIZE,
  FLOATING_PROCESSING_SIZE
}))

describe('bindFloatingSessionController', () => {
  let currentState: ListeningSessionBridgeState
  let subscribeHandler: ((state: ListeningSessionBridgeState) => void) | null
  let unsubscribe: ReturnType<typeof vi.fn>

  beforeEach(() => {
    currentState = {
      state: { status: 'idle' },
      targetApp: null
    }
    subscribeHandler = null
    unsubscribe = vi.fn()
  })

  test('maps listening session state to floating window visibility and shell size', async () => {
    const { bindFloatingSessionController } = await import('../floating-session-controller')
    const windowManager = {
      showFloating: vi.fn(),
      hideFloating: vi.fn(),
      setFloatingHiddenHandler: vi.fn()
    }
    const listeningSession = {
      getState: vi.fn(() => currentState),
      subscribe: vi.fn((handler: (state: ListeningSessionBridgeState) => void) => {
        subscribeHandler = handler
        return unsubscribe
      }),
      start: vi.fn(),
      stop: vi.fn()
    }
    const shortcutManager = {
      start: vi.fn()
    }

    bindFloatingSessionController({
      accelerator: 'CommandOrControl+Space',
      listeningSession,
      shortcutManager,
      windowManager
    })

    currentState = {
      state: { status: 'starting' },
      targetApp: null
    }
    subscribeHandler?.(currentState)

    currentState = {
      state: { status: 'processing' },
      targetApp: null
    }
    subscribeHandler?.(currentState)

    currentState = {
      state: { status: 'idle' },
      targetApp: null
    }
    subscribeHandler?.(currentState)

    currentState = {
      state: { status: 'error', message: 'boom' },
      targetApp: null
    }
    subscribeHandler?.(currentState)

    expect(windowManager.showFloating).toHaveBeenNthCalledWith(1, FLOATING_LISTENING_SIZE)
    expect(windowManager.showFloating).toHaveBeenNthCalledWith(2, FLOATING_PROCESSING_SIZE)
    expect(windowManager.hideFloating).toHaveBeenCalledTimes(3)
  })

  test('starts only from idle and stops only from starting or listening', async () => {
    const { bindFloatingSessionController } = await import('../floating-session-controller')
    const windowManager = {
      showFloating: vi.fn(),
      hideFloating: vi.fn(),
      setFloatingHiddenHandler: vi.fn()
    }
    const listeningSession = {
      getState: vi.fn(() => currentState),
      subscribe: vi.fn(() => unsubscribe),
      start: vi.fn(),
      stop: vi.fn()
    }
    const shortcutManager = {
      start: vi.fn()
    }

    bindFloatingSessionController({
      accelerator: 'CommandOrControl+Space',
      getSelectedDeviceId: () => 7,
      listeningSession,
      shortcutManager,
      windowManager
    })

    const [, onKeydown, onKeyup] = shortcutManager.start.mock.calls[0]

    currentState = {
      state: { status: 'idle' },
      targetApp: null
    }
    onKeydown()

    currentState = {
      state: { status: 'processing' },
      targetApp: null
    }
    onKeydown()

    currentState = {
      state: { status: 'starting' },
      targetApp: null
    }
    onKeyup()

    currentState = {
      state: { status: 'listening' },
      targetApp: null
    }
    onKeyup()

    currentState = {
      state: { status: 'processing' },
      targetApp: null
    }
    onKeyup()

    expect(listeningSession.start).toHaveBeenCalledTimes(1)
    expect(listeningSession.start).toHaveBeenCalledWith({ deviceId: 7 })
    expect(listeningSession.stop).toHaveBeenCalledTimes(2)
  })

  test('keydown recovers from error by clearing it and starting a new capture', async () => {
    const { bindFloatingSessionController } = await import('../floating-session-controller')
    const windowManager = {
      showFloating: vi.fn(),
      hideFloating: vi.fn(),
      setFloatingHiddenHandler: vi.fn()
    }
    const listeningSession = {
      getState: vi.fn(() => currentState),
      subscribe: vi.fn(() => unsubscribe),
      start: vi.fn(),
      stop: vi.fn(() => {
        currentState = {
          state: { status: 'idle' },
          targetApp: null
        }
      })
    }
    const shortcutManager = {
      start: vi.fn()
    }

    bindFloatingSessionController({
      accelerator: 'CommandOrControl+Space',
      getSelectedDeviceId: () => 11,
      listeningSession,
      shortcutManager,
      windowManager
    })

    const [, onKeydown] = shortcutManager.start.mock.calls[0]
    currentState = {
      state: { status: 'error', message: 'mic failed' },
      targetApp: null
    }

    onKeydown()

    expect(listeningSession.stop).toHaveBeenCalledTimes(1)
    expect(listeningSession.start).toHaveBeenCalledTimes(1)
    expect(listeningSession.start).toHaveBeenCalledWith({ deviceId: 11 })
  })

  test('stops an active capture when the floating window is hidden externally', async () => {
    const { bindFloatingSessionController } = await import('../floating-session-controller')
    const windowManager = {
      showFloating: vi.fn(),
      hideFloating: vi.fn(),
      setFloatingHiddenHandler: vi.fn()
    }
    const listeningSession = {
      getState: vi.fn(() => currentState),
      subscribe: vi.fn(() => unsubscribe),
      start: vi.fn(),
      stop: vi.fn()
    }
    const shortcutManager = {
      start: vi.fn()
    }

    bindFloatingSessionController({
      accelerator: 'CommandOrControl+Space',
      listeningSession,
      shortcutManager,
      windowManager
    })

    const onFloatingHidden = windowManager.setFloatingHiddenHandler.mock.calls[0]?.[0]

    currentState = {
      state: { status: 'listening' },
      targetApp: null
    }
    onFloatingHidden()

    currentState = {
      state: { status: 'processing' },
      targetApp: null
    }
    onFloatingHidden()

    currentState = {
      state: { status: 'error', message: 'boom' },
      targetApp: null
    }
    onFloatingHidden()

    expect(listeningSession.stop).toHaveBeenCalledTimes(1)
  })
})
