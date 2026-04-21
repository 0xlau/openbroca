import { createStore } from 'zustand'
import {
  INITIAL_NOTIFY_WINDOW_BRIDGE_STATE,
  type NotifyWindowBridgeState
} from '../../../shared/notify-window-state'

interface NotifyWindowStoreState {
  bridge: NotifyWindowBridgeState
}

const notifyWindowStoreImpl = createStore<NotifyWindowStoreState>(() => ({
  bridge: INITIAL_NOTIFY_WINDOW_BRIDGE_STATE
}))

let initialized = false

function setNotifyWindowBridgeState(bridge: NotifyWindowBridgeState): void {
  notifyWindowStoreImpl.setState({ bridge })
}

function initializeNotifyWindowStore(): void {
  if (initialized || typeof window === 'undefined' || !window.api?.notifyWindow) {
    return
  }

  initialized = true

  let receivedLiveUpdate = false

  window.api.notifyWindow.onStateChange((bridge) => {
    receivedLiveUpdate = true
    setNotifyWindowBridgeState(bridge)
  })

  void window.api.notifyWindow
    .getState()
    .then((bridge) => {
      if (!receivedLiveUpdate) {
        setNotifyWindowBridgeState(bridge)
      }
    })
    .catch(() => {
      setNotifyWindowBridgeState(INITIAL_NOTIFY_WINDOW_BRIDGE_STATE)
    })
}

const getState = notifyWindowStoreImpl.getState.bind(notifyWindowStoreImpl)
const subscribe = notifyWindowStoreImpl.subscribe.bind(notifyWindowStoreImpl)

notifyWindowStoreImpl.getState = () => {
  initializeNotifyWindowStore()
  return getState()
}

notifyWindowStoreImpl.subscribe = ((...args: Parameters<typeof subscribe>) => {
  initializeNotifyWindowStore()
  return subscribe(...args)
}) as typeof notifyWindowStoreImpl.subscribe

export const notifyWindowStore = notifyWindowStoreImpl
