import { BrowserWindow, screen, type Rectangle } from 'electron'
import {
  createMainWindow,
  createFloatingWindow,
  createOnboardingWindow,
  getFloatingWindowPosition
} from './windows'
import type { OnboardingMode } from './onboarding-gate/types'

type FloatingWindowSize = Pick<Rectangle, 'width' | 'height'>

interface WindowManagerOptions {
  createFloatingWindow?: (size?: FloatingWindowSize) => BrowserWindow
  onFloatingHidden?: () => void
}

class WindowManager {
  private mainWindow: BrowserWindow | null = null
  private floatingWindow: BrowserWindow | null = null
  private onboardingWindow: BrowserWindow | null = null
  private readonly createFloatingWindow: (size?: FloatingWindowSize) => BrowserWindow
  private onFloatingHidden: (() => void) | null

  constructor(options: WindowManagerOptions = {}) {
    this.createFloatingWindow = options.createFloatingWindow ?? createFloatingWindow
    this.onFloatingHidden = options.onFloatingHidden ?? null
  }

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

  createOnboarding(mode: OnboardingMode): BrowserWindow {
    this.onboardingWindow = createOnboardingWindow(mode)
    this.onboardingWindow.on('closed', () => {
      this.onboardingWindow = null
    })
    return this.onboardingWindow
  }

  getOnboarding(): BrowserWindow | null {
    return this.onboardingWindow
  }

  closeOnboarding(): void {
    if (this.onboardingWindow && !this.onboardingWindow.isDestroyed()) {
      this.onboardingWindow.close()
    }
  }

  showFloating(size?: FloatingWindowSize): void {
    if (!this.floatingWindow || this.floatingWindow.isDestroyed()) {
      this.floatingWindow = this.createFloatingWindow(size)
      this.floatingWindow.on?.('closed', () => {
        this.floatingWindow = null
      })
    }

    const winBounds = this.floatingWindow.getBounds()
    const nextSize = size ?? {
      width: winBounds.width,
      height: winBounds.height
    }

    const nextPosition = this.floatingWindow.isVisible()
      ? {
          x: Math.round(winBounds.x + (winBounds.width - nextSize.width) / 2),
          y: Math.round(winBounds.y + winBounds.height - nextSize.height)
        }
      : (() => {
          // Center on the display where the cursor currently is
          const cursor = screen.getCursorScreenPoint()
          const display = screen.getDisplayNearestPoint(cursor)
          return getFloatingWindowPosition(display.workArea, nextSize)
        })()

    this.floatingWindow.setBounds({
      x: nextPosition.x,
      y: nextPosition.y,
      width: nextSize.width,
      height: nextSize.height
    })

    if (!this.floatingWindow.isVisible()) {
      this.floatingWindow.showInactive()
    }
  }

  hideFloating(): void {
    if (this.floatingWindow && !this.floatingWindow.isDestroyed()) {
      this.floatingWindow.hide()
      this.onFloatingHidden?.()
    }
  }

  setFloatingHiddenHandler(handler: (() => void) | null): void {
    this.onFloatingHidden = handler
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
    if (this.onboardingWindow && !this.onboardingWindow.isDestroyed()) {
      this.onboardingWindow.destroy()
      this.onboardingWindow = null
    }
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.destroy()
      this.mainWindow = null
    }
  }
}

export { WindowManager }

export const windowManager = new WindowManager()
