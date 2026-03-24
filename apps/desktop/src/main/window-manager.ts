import { BrowserWindow, screen } from 'electron'
import { createMainWindow, createFloatingWindow, getFloatingWindowPosition } from './windows'

class WindowManager {
  private mainWindow: BrowserWindow | null = null
  private floatingWindow: BrowserWindow | null = null

  createMain(): BrowserWindow {
    this.mainWindow = createMainWindow()
    this.mainWindow.on('closed', () => {
      this.mainWindow = null
    })
    return this.mainWindow
  }

  getMain(): BrowserWindow | null {
    return this.mainWindow
  }

  showFloating(): void {
    if (!this.floatingWindow || this.floatingWindow.isDestroyed()) {
      this.floatingWindow = createFloatingWindow()
    }

    if (this.floatingWindow.isVisible()) return

    // Center on the display where the cursor currently is
    const cursor = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(cursor)
    const winBounds = this.floatingWindow.getBounds()
    const { x, y } = getFloatingWindowPosition(display.workArea, winBounds)

    this.floatingWindow.setPosition(x, y)
    this.floatingWindow.showInactive()
  }

  hideFloating(): void {
    if (this.floatingWindow && !this.floatingWindow.isDestroyed()) {
      this.floatingWindow.hide()
    }
  }

  isFloatingVisible(): boolean {
    return (
      this.floatingWindow !== null &&
      !this.floatingWindow.isDestroyed() &&
      this.floatingWindow.isVisible()
    )
  }

  destroyAll(): void {
    if (this.floatingWindow && !this.floatingWindow.isDestroyed()) {
      this.floatingWindow.destroy()
      this.floatingWindow = null
    }
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.destroy()
      this.mainWindow = null
    }
  }
}

export const windowManager = new WindowManager()
