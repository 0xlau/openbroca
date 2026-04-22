import type { ShortcutSettings } from '../shared/shortcuts'
import {
  isProcessingShellState,
  type ListeningSessionBridgeState,
  type ListeningSessionCaptureMode
} from '../shared/listening-session-state'
import {
  FLOATING_LISTENING_SIZE,
  FLOATING_PROCESSING_SIZE
} from './windows/floating-window'

type FloatingSessionStatus = ListeningSessionBridgeState['state']['status']

type FloatingSessionLike = {
  getState: () => ListeningSessionBridgeState
  subscribe: (listener: (state: ListeningSessionBridgeState) => void) => () => void
  start: (options?: { deviceId?: number }) => void
  stop: () => void
}

type FloatingWindowManagerLike = {
  showFloating: (size?: { width: number; height: number }) => void
  hideFloating: () => void
  setFloatingHiddenHandler: (handler: (() => void) | null) => void
}

type ShortcutManagerLike = {
  startCaptureBindings: (options: {
    quickAccelerator: string
    toHoldKey: string
    holdAccelerator: string
    onQuickDown: () => void
    onQuickUp: () => void
    onToHoldDown: () => void
    onHoldDown: () => void
  }) => void
  updateCaptureBindings: (settings: ShortcutSettings) => void
}

interface BindFloatingSessionControllerOptions {
  shortcutSettings: ShortcutSettings
  getSelectedDeviceId?: () => number | null | undefined
  onCaptureModeChange?: (mode: ListeningSessionCaptureMode) => void
  listeningSession: FloatingSessionLike
  shortcutManager: ShortcutManagerLike
  windowManager: FloatingWindowManagerLike
}

export type FloatingSessionController = {
  finishCapture: () => void
  updateShortcuts: (nextSettings: ShortcutSettings) => void
  getCaptureMode: () => ListeningSessionCaptureMode
  dispose: () => void
}

function isCaptureActive(status: FloatingSessionStatus): boolean {
  return status === 'starting' || status === 'listening'
}

function syncFloatingWindow(
  windowManager: FloatingWindowManagerLike,
  state: ListeningSessionBridgeState
): void {
  const status = state.state.status

  if (status === 'idle' || status === 'error') {
    windowManager.hideFloating()
    return
  }

  windowManager.showFloating(
    isProcessingShellState(state.state) ? FLOATING_PROCESSING_SIZE : FLOATING_LISTENING_SIZE
  )
}

export function bindFloatingSessionController(
  options: BindFloatingSessionControllerOptions
): FloatingSessionController {
  const {
    shortcutSettings,
    getSelectedDeviceId,
    onCaptureModeChange,
    listeningSession,
    shortcutManager,
    windowManager
  } = options
  let captureMode: ListeningSessionCaptureMode = null

  const setCaptureMode = (nextMode: ListeningSessionCaptureMode) => {
    if (captureMode === nextMode) {
      return
    }

    captureMode = nextMode
    onCaptureModeChange?.(captureMode)
  }

  const startCapture = (mode: Exclude<ListeningSessionCaptureMode, null>) => {
    if (listeningSession.getState().state.status !== 'idle') {
      return
    }

    setCaptureMode(mode)
    const deviceId = getSelectedDeviceId?.()
    listeningSession.start(deviceId == null ? undefined : { deviceId })
  }

  const stopSustainedCapture = () => {
    if (captureMode !== 'latched' && captureMode !== 'hold') {
      return
    }

    setCaptureMode(null)
    if (isCaptureActive(listeningSession.getState().state.status)) {
      listeningSession.stop()
    }
  }

  const handleFloatingHidden = () => {
    if (isCaptureActive(listeningSession.getState().state.status)) {
      setCaptureMode(null)
      listeningSession.stop()
    }
  }

  const unsubscribe = listeningSession.subscribe((state) => {
    if (state.state.status === 'idle' || state.state.status === 'error') {
      setCaptureMode(null)
    }
    syncFloatingWindow(windowManager, state)
  })

  windowManager.setFloatingHiddenHandler(handleFloatingHidden)
  syncFloatingWindow(windowManager, listeningSession.getState())

  shortcutManager.startCaptureBindings({
    ...shortcutSettings,
    onQuickDown: () => {
      if (captureMode === 'latched') {
        stopSustainedCapture()
        return
      }

      if (listeningSession.getState().state.status === 'error') {
        listeningSession.stop()
      }

      startCapture('quick')
    },
    onQuickUp: () => {
      if (captureMode !== 'quick') {
        return
      }

      setCaptureMode(null)
      if (isCaptureActive(listeningSession.getState().state.status)) {
        listeningSession.stop()
      }
    },
    onToHoldDown: () => {
      if (captureMode === 'quick') {
        setCaptureMode('latched')
      }
    },
    onHoldDown: () => {
      if (captureMode === 'hold') {
        stopSustainedCapture()
        return
      }

      if (listeningSession.getState().state.status === 'error') {
        listeningSession.stop()
      }

      startCapture('hold')
    }
  })

  return {
    finishCapture: stopSustainedCapture,
    updateShortcuts(nextSettings) {
      if (captureMode !== null && isCaptureActive(listeningSession.getState().state.status)) {
        setCaptureMode(null)
        listeningSession.stop()
      }

      shortcutManager.updateCaptureBindings(nextSettings)
    },
    getCaptureMode() {
      return captureMode
    },
    dispose() {
      unsubscribe()
      windowManager.setFloatingHiddenHandler(null)
    }
  }
}
