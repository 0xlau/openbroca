import type { AppIdentity } from '@openbroca/app-identity'

export type ListeningSessionState =
  | { status: 'idle' }
  | { status: 'starting' }
  | { status: 'listening' }
  | { status: 'stopping' }
  | { status: 'processing' }
  | { status: 'error'; message: string }

export type ListeningSessionCaptureMode = 'quick' | 'latched' | 'hold' | null

export type ListeningSessionBridgeState = {
  captureMode?: ListeningSessionCaptureMode
  state: ListeningSessionState
  targetApp: AppIdentity | null
}

export const INITIAL_LISTENING_SESSION_BRIDGE_STATE: ListeningSessionBridgeState = {
  state: { status: 'idle' },
  targetApp: null
}

export function isListeningSessionActive(state: ListeningSessionState): boolean {
  return state.status === 'listening'
}

export function isListeningSessionBusy(state: ListeningSessionState): boolean {
  return (
    state.status === 'starting' ||
    state.status === 'listening' ||
    state.status === 'stopping' ||
    state.status === 'processing'
  )
}

export function isProcessingShellState(state: ListeningSessionState): boolean {
  return state.status === 'stopping' || state.status === 'processing'
}

export function isTargetAppPollingState(state: ListeningSessionState): boolean {
  return isListeningSessionBusy(state)
}
