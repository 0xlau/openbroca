export type ListeningSessionState =
  | { status: 'idle' }
  | { status: 'starting' }
  | { status: 'listening' }
  | { status: 'stopping' }
  | { status: 'error'; message: string }

export function isListeningSessionActive(state: ListeningSessionState): boolean {
  return state.status === 'listening'
}
