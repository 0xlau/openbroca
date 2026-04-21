export type NotifyWindowAction = {
  id: string
  label: string
}

export type NotifyWindowNotification = {
  title: string
  body?: string
  actions?: NotifyWindowAction[]
}

export type NotifyWindowBridgeState = {
  notification: NotifyWindowNotification | null
}

export const INITIAL_NOTIFY_WINDOW_BRIDGE_STATE: NotifyWindowBridgeState = {
  notification: null
}
