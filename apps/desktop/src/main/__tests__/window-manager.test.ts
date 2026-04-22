import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('electron', () => ({
  screen: {
    getCursorScreenPoint: vi.fn(),
    getDisplayNearestPoint: vi.fn()
  }
}))

vi.mock('../windows', () => ({
  createMainWindow: vi.fn(),
  createFloatingWindow: vi.fn(),
  createPermissionOnboardingWindow: vi.fn(),
  getFloatingWindowPosition: vi.fn()
}))

describe('WindowManager', () => {
  const setBounds = vi.fn()
  const setPosition = vi.fn()
  const showInactive = vi.fn()
  const hide = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('calls the floating hidden handler when hiding the floating window', async () => {
    const electron = await import('electron')
    const windows = await import('../windows')
    const { WindowManager } = await import('../window-manager')
    const onFloatingHidden = vi.fn()

    vi.mocked(electron.screen.getCursorScreenPoint).mockReturnValue({ x: 0, y: 0 })
    vi.mocked(electron.screen.getDisplayNearestPoint).mockReturnValue({
      workArea: { x: 0, y: 0, width: 1280, height: 720 }
    } as never)
    vi.mocked(windows.getFloatingWindowPosition).mockReturnValue({ x: 10, y: 20 })

    const manager = new WindowManager({
      onFloatingHidden,
      createFloatingWindow: () =>
        ({
          isDestroyed: () => false,
          isVisible: () => true,
          getBounds: () => ({ x: 0, y: 0, width: 320, height: 80 }),
          setBounds,
          setPosition,
          showInactive,
          hide
        }) as never
    })

    manager.showFloating()
    manager.hideFloating()

    expect(hide).toHaveBeenCalledTimes(1)
    expect(onFloatingHidden).toHaveBeenCalledTimes(1)
  })

  test('positions the hidden floating window on the cursor display before showing it', async () => {
    const electron = await import('electron')
    const windows = await import('../windows')
    const { WindowManager } = await import('../window-manager')

    vi.mocked(electron.screen.getCursorScreenPoint).mockReturnValue({ x: 100, y: 200 })
    vi.mocked(electron.screen.getDisplayNearestPoint).mockReturnValue({
      workArea: { x: 20, y: 30, width: 1280, height: 720 }
    } as never)
    vi.mocked(windows.getFloatingWindowPosition).mockReturnValue({ x: 44, y: 55 })

    const createFloatingWindow = vi.fn(() =>
      ({
        isDestroyed: () => false,
        isVisible: () => false,
        getBounds: () => ({ x: 0, y: 0, width: 180, height: 38 }),
        setBounds,
        setPosition,
        showInactive,
        hide
      }) as never
    )
    const manager = new WindowManager({ createFloatingWindow })

    manager.showFloating({ width: 360, height: 38 })

    expect(createFloatingWindow).toHaveBeenCalledWith({ width: 360, height: 38 })
    expect(windows.getFloatingWindowPosition).toHaveBeenCalledWith(
      { x: 20, y: 30, width: 1280, height: 720 },
      { width: 360, height: 38 }
    )
    expect(setBounds).toHaveBeenCalledWith({ x: 44, y: 55, width: 360, height: 38 })
    expect(showInactive).toHaveBeenCalledTimes(1)
  })

  test('keeps the visible floating window anchored instead of recentering to the cursor display', async () => {
    const electron = await import('electron')
    const windows = await import('../windows')
    const { WindowManager } = await import('../window-manager')

    vi.mocked(electron.screen.getCursorScreenPoint).mockReturnValue({ x: 999, y: 888 })
    vi.mocked(electron.screen.getDisplayNearestPoint).mockReturnValue({
      workArea: { x: 20, y: 30, width: 1280, height: 720 }
    } as never)
    vi.mocked(windows.getFloatingWindowPosition).mockReturnValue({ x: 700, y: 710 })

    const createFloatingWindow = vi.fn(() =>
      ({
        isDestroyed: () => false,
        isVisible: () => true,
        getBounds: () => ({ x: 500, y: 600, width: 180, height: 60 }),
        setBounds,
        setPosition,
        showInactive,
        hide
      }) as never
    )
    const manager = new WindowManager({ createFloatingWindow })

    manager.showFloating({ width: 360, height: 38 })

    expect(windows.getFloatingWindowPosition).not.toHaveBeenCalled()
    expect(setBounds).toHaveBeenCalledWith({ x: 410, y: 622, width: 360, height: 38 })
  })

  test('creates and tracks a permission onboarding window', async () => {
    const windows = await import('../windows')
    const { WindowManager } = await import('../window-manager')
    let closedHandler: (() => void) | undefined
    const onboardingWindow = {
      on: vi.fn((event: string, handler: () => void) => {
        if (event === 'closed') {
          closedHandler = handler
        }
      }),
      isDestroyed: () => false,
      close: vi.fn()
    }

    vi.mocked(windows.createPermissionOnboardingWindow).mockReturnValue(onboardingWindow as never)

    const manager = new WindowManager()

    expect(manager.createPermissionOnboarding()).toBe(onboardingWindow)
    expect(manager.getPermissionOnboarding()).toBe(onboardingWindow)

    closedHandler?.()

    expect(manager.getPermissionOnboarding()).toBeNull()
  })

  test('keeps tracking the onboarding window until the closed lifecycle completes', async () => {
    const windows = await import('../windows')
    const { WindowManager } = await import('../window-manager')
    let closedHandler: (() => void) | undefined
    const onboardingWindow = {
      on: vi.fn((event: string, handler: () => void) => {
        if (event === 'closed') {
          closedHandler = handler
        }
      }),
      isDestroyed: () => false,
      close: vi.fn()
    }

    vi.mocked(windows.createPermissionOnboardingWindow).mockReturnValue(onboardingWindow as never)

    const manager = new WindowManager()
    manager.createPermissionOnboarding()
    manager.closePermissionOnboarding()

    expect(onboardingWindow.close).toHaveBeenCalledTimes(1)
    expect(manager.getPermissionOnboarding()).toBe(onboardingWindow)

    closedHandler?.()

    expect(manager.getPermissionOnboarding()).toBeNull()
  })
})
