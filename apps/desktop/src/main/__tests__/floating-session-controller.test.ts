import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { ListeningSessionBridgeState } from '../../shared/listening-session-state'
import type { ShortcutSettings } from '../../shared/shortcuts'

const FLOATING_LISTENING_SIZE = { width: 180, height: 38 }
const FLOATING_PROCESSING_SIZE = { width: 360, height: 38 }
const DEFAULT_SHORTCUT_SETTINGS = {
  quickAccelerator: 'CommandOrControl+Space',
  toHoldKey: 'Tab',
  holdAccelerator: 'CommandOrControl+Shift+Space'
}

vi.mock('../windows/floating-window', () => ({
  FLOATING_LISTENING_SIZE,
  FLOATING_PROCESSING_SIZE
}))

type StateListener = (state: ListeningSessionBridgeState) => void

type CaptureBindings = {
  quickAccelerator: string
  toHoldKey: string
  holdAccelerator: string
  onQuickDown: () => void
  onQuickUp: () => void
  onToHoldDown: () => void
  onHoldDown: () => void
}

describe('bindFloatingSessionController', () => {
  let currentState: ListeningSessionBridgeState
  let subscribeHandler: StateListener | null
  let unsubscribe: () => void

  beforeEach(() => {
    currentState = {
      state: { status: 'idle' },
      targetApp: null
    }
    subscribeHandler = null
    unsubscribe = vi.fn(() => undefined)
  })

  async function setupController(options?: {
    getSelectedDeviceId?: () => number | null | undefined
    stopImplementation?: () => void
    onCaptureModeChange?: (mode: ListeningSessionBridgeState['captureMode']) => void
  }) {
    const { bindFloatingSessionController } = await import('../floating-session-controller')
    const windowManager = {
      showFloating: vi.fn(),
      hideFloating: vi.fn(),
      setFloatingHiddenHandler: vi.fn()
    }
    const stopMock = vi.fn(() => {
      options?.stopImplementation?.()
    })
    const listeningSession: {
      getState: () => ListeningSessionBridgeState
      subscribe: (listener: StateListener) => () => void
      start: (options?: { deviceId?: number }) => void
      stop: () => void
    } = {
      getState: vi.fn(() => currentState),
      subscribe: vi.fn((handler: StateListener): (() => void) => {
        subscribeHandler = handler
        return unsubscribe
      }),
      start: vi.fn(),
      stop: stopMock
    }
    const startCaptureBindingsMock = vi.fn()
    const updateCaptureBindingsMock = vi.fn()
    const shortcutManager: {
      startCaptureBindings: (options: CaptureBindings) => void
      updateCaptureBindings: (settings: ShortcutSettings) => void
    } = {
      startCaptureBindings: startCaptureBindingsMock,
      updateCaptureBindings: updateCaptureBindingsMock
    }

    const controller = bindFloatingSessionController({
      shortcutSettings: DEFAULT_SHORTCUT_SETTINGS,
      getSelectedDeviceId: options?.getSelectedDeviceId,
      onCaptureModeChange: options?.onCaptureModeChange,
      listeningSession,
      shortcutManager,
      windowManager
    })

    const captureBindings = startCaptureBindingsMock.mock.calls[0]?.[0]

    return {
      controller,
      windowManager,
      listeningSession,
      shortcutManager,
      stopMock,
      updateCaptureBindingsMock,
      captureBindings,
      setState(nextState: ListeningSessionBridgeState) {
        currentState = nextState
        subscribeHandler?.(nextState)
      }
    }
  }

  async function setupStopObservationController() {
    const observedCaptureModes: ListeningSessionBridgeState['captureMode'][] = []
    let readCaptureMode: (() => ListeningSessionBridgeState['captureMode']) | null = null

    const setup = await setupController({
      stopImplementation: () => {
        observedCaptureModes.push(readCaptureMode ? readCaptureMode() : null)
      }
    })

    readCaptureMode = () => setup.controller.getCaptureMode()

    return {
      ...setup,
      observedCaptureModes
    }
  }

  test('maps listening session state to floating window visibility and shell size', async () => {
    const { windowManager, setState } = await setupController()

    setState({
      state: { status: 'starting' },
      targetApp: null
    })

    setState({
      state: { status: 'processing' },
      targetApp: null
    })

    setState({
      state: { status: 'idle' },
      targetApp: null
    })

    setState({
      state: { status: 'error', message: 'boom' },
      targetApp: null
    })

    expect(windowManager.showFloating).toHaveBeenNthCalledWith(1, FLOATING_LISTENING_SIZE)
    expect(windowManager.showFloating).toHaveBeenNthCalledWith(2, FLOATING_PROCESSING_SIZE)
    expect(windowManager.hideFloating).toHaveBeenCalledTimes(3)
  })

  test('quick down starts capture from idle', async () => {
    const { controller, listeningSession, captureBindings, setState } = await setupController({
      getSelectedDeviceId: () => 7
    })

    expect(typeof controller).toBe('object')

    setState({
      state: { status: 'idle' },
      targetApp: null
    })
    captureBindings.onQuickDown()

    expect(listeningSession.start).toHaveBeenCalledTimes(1)
    expect(listeningSession.start).toHaveBeenCalledWith({ deviceId: 7 })
    expect(controller.getCaptureMode()).toBe('quick')
  })

  test('quick down plus toHold down stays active after quick up until finishCapture or quick down in latched mode', async () => {
    const first = await setupController()

    first.captureBindings.onQuickDown()
    first.setState({
      state: { status: 'listening' },
      targetApp: null
    })
    first.captureBindings.onToHoldDown()
    first.captureBindings.onQuickUp()

    expect(first.controller.getCaptureMode()).toBe('latched')
    expect(first.listeningSession.stop).not.toHaveBeenCalled()

    first.controller.finishCapture()

    expect(first.listeningSession.stop).toHaveBeenCalledTimes(1)
    expect(first.controller.getCaptureMode()).toBe(null)

    currentState = {
      state: { status: 'idle' },
      targetApp: null
    }
    const second = await setupController()
    second.captureBindings.onQuickDown()
    second.setState({
      state: { status: 'listening' },
      targetApp: null
    })
    second.captureBindings.onToHoldDown()
    second.captureBindings.onQuickUp()
    second.captureBindings.onQuickDown()

    expect(second.listeningSession.stop).toHaveBeenCalledTimes(1)
    expect(second.controller.getCaptureMode()).toBe(null)
  })

  test('hold down toggles start and stop', async () => {
    const { controller, listeningSession, captureBindings, setState } = await setupController({
      getSelectedDeviceId: () => 5
    })

    captureBindings.onHoldDown()

    expect(listeningSession.start).toHaveBeenCalledTimes(1)
    expect(listeningSession.start).toHaveBeenCalledWith({ deviceId: 5 })
    expect(controller.getCaptureMode()).toBe('hold')

    setState({
      state: { status: 'listening' },
      targetApp: null
    })
    captureBindings.onHoldDown()

    expect(listeningSession.stop).toHaveBeenCalledTimes(1)
    expect(controller.getCaptureMode()).toBe(null)
  })

  test('finishCapture stops latched and hold safely', async () => {
    const latched = await setupController()
    latched.captureBindings.onQuickDown()
    latched.setState({
      state: { status: 'listening' },
      targetApp: null
    })
    latched.captureBindings.onToHoldDown()
    latched.captureBindings.onQuickUp()
    latched.controller.finishCapture()

    expect(latched.listeningSession.stop).toHaveBeenCalledTimes(1)
    expect(latched.controller.getCaptureMode()).toBe(null)

    currentState = {
      state: { status: 'idle' },
      targetApp: null
    }
    const hold = await setupController()
    hold.captureBindings.onHoldDown()
    hold.setState({
      state: { status: 'listening' },
      targetApp: null
    })
    hold.controller.finishCapture()

    expect(hold.listeningSession.stop).toHaveBeenCalledTimes(1)
    expect(hold.controller.getCaptureMode()).toBe(null)
  })

  test('quick release clears captureMode before stop-triggered observation', async () => {
    const { captureBindings, setState, observedCaptureModes } = await setupStopObservationController()

    captureBindings.onQuickDown()
    setState({
      state: { status: 'listening' },
      targetApp: null
    })

    captureBindings.onQuickUp()

    expect(observedCaptureModes).toEqual([null])
  })

  test.each([
    {
      name: 'latched finishCapture',
      activate: async ({
        captureBindings,
        setState,
        controller
      }: Awaited<ReturnType<typeof setupStopObservationController>>) => {
        captureBindings.onQuickDown()
        setState({
          state: { status: 'listening' },
          targetApp: null
        })
        captureBindings.onToHoldDown()
        captureBindings.onQuickUp()
        controller.finishCapture()
      }
    },
    {
      name: 'hold finishCapture',
      activate: async ({
        captureBindings,
        setState,
        controller
      }: Awaited<ReturnType<typeof setupStopObservationController>>) => {
        captureBindings.onHoldDown()
        setState({
          state: { status: 'listening' },
          targetApp: null
        })
        controller.finishCapture()
      }
    }
  ])('$name clears captureMode before stop-triggered observation', async ({ activate }) => {
    const setup = await setupStopObservationController()

    await activate(setup)

    expect(setup.observedCaptureModes).toEqual([null])
  })

  test('subscribed idle state clears captureMode', async () => {
    const { controller, captureBindings, setState } = await setupController()

    captureBindings.onQuickDown()
    setState({
      state: { status: 'listening' },
      targetApp: null
    })
    captureBindings.onToHoldDown()
    captureBindings.onQuickUp()

    expect(controller.getCaptureMode()).toBe('latched')

    setState({
      state: { status: 'idle' },
      targetApp: null
    })

    expect(controller.getCaptureMode()).toBe(null)
  })

  test('subscribed error state clears captureMode', async () => {
    const { controller, captureBindings, setState } = await setupController()

    captureBindings.onHoldDown()
    setState({
      state: { status: 'listening' },
      targetApp: null
    })

    expect(controller.getCaptureMode()).toBe('hold')

    setState({
      state: { status: 'error', message: 'boom' },
      targetApp: null
    })

    expect(controller.getCaptureMode()).toBe(null)
  })

  test('notifies controller-owned captureMode transitions including quick to latched', async () => {
    const onCaptureModeChange = vi.fn()
    const { captureBindings, setState } = await setupController({
      onCaptureModeChange
    })

    captureBindings.onQuickDown()
    setState({
      state: { status: 'listening' },
      targetApp: null
    })
    captureBindings.onToHoldDown()
    captureBindings.onQuickUp()
    setState({
      state: { status: 'idle' },
      targetApp: null
    })

    expect(onCaptureModeChange.mock.calls).toEqual([
      ['quick'],
      ['latched'],
      [null]
    ])
  })

  test('updateShortcuts forwards to shortcutManager.updateCaptureBindings', async () => {
    const { controller, shortcutManager } = await setupController()
    const nextSettings = {
      quickAccelerator: 'CommandOrControl+Enter',
      toHoldKey: 'F',
      holdAccelerator: 'CommandOrControl+Shift+Enter'
    }

    controller.updateShortcuts(nextSettings)

    expect(shortcutManager.updateCaptureBindings).toHaveBeenCalledTimes(1)
    expect(shortcutManager.updateCaptureBindings).toHaveBeenCalledWith(nextSettings)
  })

  test('updateShortcuts stops an active capture and clears captureMode before forwarding bindings', async () => {
    const { controller, listeningSession, shortcutManager, captureBindings, setState, stopMock, updateCaptureBindingsMock } =
      await setupController()
    const nextSettings = {
      quickAccelerator: 'CommandOrControl+Enter',
      toHoldKey: 'F',
      holdAccelerator: 'CommandOrControl+Shift+Enter'
    }

    captureBindings.onQuickDown()
    setState({
      state: { status: 'listening' },
      targetApp: null
    })

    expect(controller.getCaptureMode()).toBe('quick')

    controller.updateShortcuts(nextSettings)

    expect(listeningSession.stop).toHaveBeenCalledTimes(1)
    expect(controller.getCaptureMode()).toBe(null)
    expect(shortcutManager.updateCaptureBindings).toHaveBeenCalledTimes(1)
    expect(shortcutManager.updateCaptureBindings).toHaveBeenCalledWith(nextSettings)
    expect(stopMock.mock.invocationCallOrder[0]).toBeLessThan(
      updateCaptureBindingsMock.mock.invocationCallOrder[0]
    )
  })

  test('updateShortcuts clears captureMode before stop-triggered observation', async () => {
    const { controller, captureBindings, setState, observedCaptureModes } =
      await setupStopObservationController()

    captureBindings.onQuickDown()
    setState({
      state: { status: 'listening' },
      targetApp: null
    })

    controller.updateShortcuts({
      quickAccelerator: 'CommandOrControl+Enter',
      toHoldKey: 'F',
      holdAccelerator: 'CommandOrControl+Shift+Enter'
    })

    expect(observedCaptureModes).toEqual([null])
  })

  test('quick down recovers from error by clearing it and starting a new capture', async () => {
    const { listeningSession, captureBindings } = await setupController({
      getSelectedDeviceId: () => 11,
      stopImplementation: () => {
        currentState = {
          state: { status: 'idle' },
          targetApp: null
        }
      }
    })
    currentState = {
      state: { status: 'error', message: 'mic failed' },
      targetApp: null
    }

    captureBindings.onQuickDown()

    expect(listeningSession.stop).toHaveBeenCalledTimes(1)
    expect(listeningSession.start).toHaveBeenCalledTimes(1)
    expect(listeningSession.start).toHaveBeenCalledWith({ deviceId: 11 })
  })

  test('hold down recovers from error by clearing it and starting a new capture', async () => {
    const { listeningSession, captureBindings, controller } = await setupController({
      getSelectedDeviceId: () => 17,
      stopImplementation: () => {
        currentState = {
          state: { status: 'idle' },
          targetApp: null
        }
      }
    })
    currentState = {
      state: { status: 'error', message: 'mic failed' },
      targetApp: null
    }

    captureBindings.onHoldDown()

    expect(listeningSession.stop).toHaveBeenCalledTimes(1)
    expect(listeningSession.start).toHaveBeenCalledTimes(1)
    expect(listeningSession.start).toHaveBeenCalledWith({ deviceId: 17 })
    expect(controller.getCaptureMode()).toBe('hold')
  })

  test('floating hidden still stops active capture only', async () => {
    const { controller, listeningSession, windowManager, captureBindings } = await setupController()
    const onFloatingHidden = windowManager.setFloatingHiddenHandler.mock.calls[0]?.[0]

    captureBindings.onHoldDown()
    currentState = {
      state: { status: 'listening' },
      targetApp: null
    }

    expect(controller.getCaptureMode()).toBe('hold')

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
    expect(controller.getCaptureMode()).toBe(null)
  })

  test('floating hidden clears captureMode before stop-triggered observation', async () => {
    const { windowManager, captureBindings, observedCaptureModes } =
      await setupStopObservationController()
    const onFloatingHidden = windowManager.setFloatingHiddenHandler.mock.calls[0]?.[0]

    captureBindings.onHoldDown()
    currentState = {
      state: { status: 'listening' },
      targetApp: null
    }

    onFloatingHidden()

    expect(observedCaptureModes).toEqual([null])
  })
})
