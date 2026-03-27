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
  getFloatingWindowPosition: vi.fn()
}))

describe('WindowManager', () => {
  const setPosition = vi.fn()
  const showInactive = vi.fn()
  const hide = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('calls the floating hidden handler when hiding the floating window', async () => {
    const { WindowManager } = await import('../window-manager')
    const onFloatingHidden = vi.fn()
    const manager = new WindowManager({
      onFloatingHidden,
      createFloatingWindow: () =>
        ({
          isDestroyed: () => false,
          isVisible: () => true,
          getBounds: () => ({ x: 0, y: 0, width: 320, height: 80 }),
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
})
