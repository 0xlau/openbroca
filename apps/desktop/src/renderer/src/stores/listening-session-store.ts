import { createStore } from 'zustand'
import {
  INITIAL_LISTENING_SESSION_BRIDGE_STATE,
  type ListeningSessionBridgeState
} from '../../../shared/listening-session-state'

interface ListeningSessionStoreState {
  bridge: ListeningSessionBridgeState
}

const listeningSessionStoreImpl = createStore<ListeningSessionStoreState>(() => ({
  bridge: INITIAL_LISTENING_SESSION_BRIDGE_STATE
}))

let initialized = false

function setListeningSessionBridgeState(bridge: ListeningSessionBridgeState): void {
  listeningSessionStoreImpl.setState({ bridge })
}

function initializeListeningSessionStore(): void {
  if (initialized || typeof window === 'undefined' || !window.api?.listeningSession) {
    return
  }

  initialized = true

  let receivedLiveUpdate = false

  window.api.listeningSession.onStateChange((bridge) => {
    receivedLiveUpdate = true
    setListeningSessionBridgeState(bridge)
  })

  void window.api.listeningSession
    .getState()
    .then((bridge) => {
      if (!receivedLiveUpdate) {
        setListeningSessionBridgeState(bridge)
      }
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Failed to load listening session'
      setListeningSessionBridgeState({
        state: { status: 'error', message },
        targetApp: null
      })
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
