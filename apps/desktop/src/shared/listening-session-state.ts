import type { AppIdentity } from '@openbroca/app-identity'

export type ListeningSessionState =
  | { status: 'idle' }
  | { status: 'starting' }
  | { status: 'listening' }
  | { status: 'stopping' }
  | { status: 'error'; message: string }

export type ListeningSessionBridgeState = {
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

export function isTargetAppPollingState(state: ListeningSessionState): boolean {
  return state.status === 'starting' || state.status === 'listening' || state.status === 'stopping'
}
