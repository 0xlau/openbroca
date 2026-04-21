import { screen, type BrowserWindow } from 'electron'
import {
  INITIAL_NOTIFY_WINDOW_BRIDGE_STATE,
  type NotifyWindowBridgeState,
  type NotifyWindowNotification
} from '../shared/notify-window-state'
import { createNotifyWindow, getNotifyWindowPosition } from './windows/notify-window'

export function createNotifyWindows(
  deps: {
    createWindow?: () => BrowserWindow
    timeoutMs?: number
  } = {}
) {
  const createWindow = deps.createWindow ?? createNotifyWindow
  const timeoutMs = deps.timeoutMs ?? 2500

  let win: BrowserWindow | null = null
  let bridge: NotifyWindowBridgeState = INITIAL_NOTIFY_WINDOW_BRIDGE_STATE
  let dismissTimer: ReturnType<typeof setTimeout> | null = null

  const clearDismissTimer = () => {
    if (dismissTimer) {
      clearTimeout(dismissTimer)
      dismissTimer = null
    }
  }

  const publish = () => {
    win?.webContents.send('notify-window:state-changed', bridge)
  }

  const positionWindow = (window: BrowserWindow) => {
    const cursor = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(cursor)
    const bounds = window.getBounds()
    const position = getNotifyWindowPosition(display.workArea, {
      width: bounds.width,
      height: bounds.height
    })

    window.setBounds({
      x: position.x,
      y: position.y,
      width: bounds.width,
      height: bounds.height
    })
  }

  const ensureWindow = () => {
    if (!win || win.isDestroyed()) {
      win = createWindow()
      win.on?.('closed', () => {
        win = null
        bridge = INITIAL_NOTIFY_WINDOW_BRIDGE_STATE
        clearDismissTimer()
      })
    }

    return win
  }

  const scheduleDismiss = () => {
    clearDismissTimer()

    dismissTimer = setTimeout(() => {
      dismissTimer = null
      if (!win || win.isDestroyed()) {
        bridge = INITIAL_NOTIFY_WINDOW_BRIDGE_STATE
        return
      }

      win.close()
    }, timeoutMs)
  }

  return {
    getState: () => bridge,
    async show(notification: NotifyWindowNotification) {
      const window = ensureWindow()
      positionWindow(window)
      bridge = { notification }
      publish()

      if (!window.isVisible()) {
        window.showInactive()
      }

      scheduleDismiss()
    }
  }
}
