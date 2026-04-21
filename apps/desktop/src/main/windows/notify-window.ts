import { BrowserWindow, screen, type Rectangle } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'

export const NOTIFY_WINDOW_SIZE = { width: 320, height: 88 } as const

export function getNotifyWindowPosition(
  area: Rectangle,
  size: Pick<Rectangle, 'width' | 'height'> = NOTIFY_WINDOW_SIZE
): { x: number; y: number } {
  return {
    x: Math.round(area.x + (area.width - size.width) / 2),
    y: Math.round(area.y + area.height - size.height - 110)
  }
}

export function createNotifyWindow(): BrowserWindow {
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const { x, y } = getNotifyWindowPosition(display.workArea)

  const notifyWindow = new BrowserWindow({
    width: NOTIFY_WINDOW_SIZE.width,
    height: NOTIFY_WINDOW_SIZE.height,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    ...(process.platform === 'darwin' ? { type: 'panel' as const } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    notifyWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#/notify/window')
  } else {
    notifyWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      hash: '/notify/window'
    })
  }

  return notifyWindow
}
