import { BrowserWindow, screen, type Rectangle } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

export const FLOATING_LISTENING_SIZE = { width: 360, height: 38 } as const
export const FLOATING_PROCESSING_SIZE = { width: 360, height: 38 } as const
const FLOATING_WINDOW_BOTTOM_OFFSET = 50

export function getFloatingWindowPosition(
  area: Rectangle,
  size: Pick<Rectangle, 'width' | 'height'> = FLOATING_LISTENING_SIZE
): { x: number; y: number } {
  return {
    x: Math.round(area.x + (area.width - size.width) / 2),
    y: Math.round(area.y + area.height - size.height - FLOATING_WINDOW_BOTTOM_OFFSET)
  }
}

export function createFloatingWindow(
  size: Pick<Rectangle, 'width' | 'height'> = FLOATING_LISTENING_SIZE
): BrowserWindow {
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const { x, y } = getFloatingWindowPosition(display.workArea, size)

  const floatingWindow = new BrowserWindow({
    width: size.width,
    height: size.height,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    // type 'panel' on macOS: doesn't steal focus from other apps
    ...(process.platform === 'darwin' ? { type: 'panel' as const } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    floatingWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#/float/listening')
  } else {
    floatingWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      hash: '/float/listening'
    })
  }

  return floatingWindow
}
