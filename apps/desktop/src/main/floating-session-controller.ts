import { isProcessingShellState, type ListeningSessionBridgeState } from '../shared/listening-session-state'
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
  start: (accelerator: string, onDown: () => void, onUp: () => void) => void
}

interface BindFloatingSessionControllerOptions {
  accelerator: string
  getSelectedDeviceId?: () => number | null | undefined
  listeningSession: FloatingSessionLike
  shortcutManager: ShortcutManagerLike
  windowManager: FloatingWindowManagerLike
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
): () => void {
  const { accelerator, getSelectedDeviceId, listeningSession, shortcutManager, windowManager } = options

  const handleFloatingHidden = () => {
    if (isCaptureActive(listeningSession.getState().state.status)) {
      listeningSession.stop()
    }
  }

  const unsubscribe = listeningSession.subscribe((state) => {
    syncFloatingWindow(windowManager, state)
  })

  windowManager.setFloatingHiddenHandler(handleFloatingHidden)
  syncFloatingWindow(windowManager, listeningSession.getState())

  shortcutManager.start(
    accelerator,
    () => {
      if (listeningSession.getState().state.status === 'error') {
        listeningSession.stop()
      }

      if (listeningSession.getState().state.status !== 'idle') {
        return
      }

      const deviceId = getSelectedDeviceId?.()
      listeningSession.start(deviceId == null ? undefined : { deviceId })
    },
    () => {
      if (isCaptureActive(listeningSession.getState().state.status)) {
        listeningSession.stop()
      }
    }
  )

  return () => {
    unsubscribe()
    windowManager.setFloatingHiddenHandler(null)
  }
}
