import { createStore } from 'zustand'
import type { ListeningSessionState } from '../../../shared/listening-session-state'

interface ListeningSessionStoreState {
  state: ListeningSessionState
}

const listeningSessionStoreImpl = createStore<ListeningSessionStoreState>(() => ({
  state: { status: 'idle' }
}))

let initialized = false

function setListeningSessionState(state: ListeningSessionState): void {
  listeningSessionStoreImpl.setState({ state })
}

function initializeListeningSessionStore(): void {
  if (initialized || typeof window === 'undefined' || !window.api?.listeningSession) {
    return
  }

  initialized = true

  let receivedLiveUpdate = false

  window.api.listeningSession.onStateChange((state) => {
    receivedLiveUpdate = true
    setListeningSessionState(state)
  })

  void window.api.listeningSession
    .getState()
    .then((state) => {
      if (!receivedLiveUpdate) {
        setListeningSessionState(state)
      }
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Failed to load listening session'
      setListeningSessionState({ status: 'error', message })
    })
}

const getState = listeningSessionStoreImpl.getState.bind(listeningSessionStoreImpl)
const subscribe = listeningSessionStoreImpl.subscribe.bind(listeningSessionStoreImpl)

listeningSessionStoreImpl.getState = () => {
  initializeListeningSessionStore()
  return getState()
}

listeningSessionStoreImpl.subscribe = ((...args: Parameters<typeof subscribe>) => {
  initializeListeningSessionStore()
  return subscribe(...args)
}) as typeof listeningSessionStoreImpl.subscribe

export const listeningSessionStore = listeningSessionStoreImpl
