import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  screen: {
    getCursorScreenPoint: vi.fn(),
    getDisplayNearestPoint: vi.fn()
  }
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: false }
}))

describe('createNotifyWindows', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    vi.clearAllMocks()

    const electron = await import('electron')
    vi.mocked(electron.screen.getCursorScreenPoint).mockReturnValue({ x: 0, y: 0 })
    vi.mocked(electron.screen.getDisplayNearestPoint).mockReturnValue({
      workArea: { x: 0, y: 0, width: 1200, height: 900 }
    } as never)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.resetModules()
  })

  test('reuses a single window and replaces the current notification', async () => {
    const send = vi.fn()
    const showInactive = vi.fn()
    const hide = vi.fn()
    let visible = false

    const createWindow = vi.fn(
      () =>
        ({
          webContents: { send },
          isDestroyed: () => false,
          isVisible: () => visible,
          getBounds: () => ({ x: 0, y: 0, width: 320, height: 88 }),
          setBounds: vi.fn(),
          showInactive: () => {
            visible = true
            showInactive()
          },
          hide: () => {
            visible = false
            hide()
          },
          on: vi.fn()
        }) as never
    )

    const { createNotifyWindows } = await import('../notify-windows')
    const notifyWindows = createNotifyWindows({ createWindow, timeoutMs: 2500 })

    await notifyWindows.show({
      title: 'Copied to clipboard',
      body: 'Paste it into the target app'
    })

    await notifyWindows.show({
      title: 'Copied again'
    })

    expect(createWindow).toHaveBeenCalledTimes(1)
    expect(showInactive).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenNthCalledWith(1, 'notify-window:state-changed', {
      notification: {
        title: 'Copied to clipboard',
        body: 'Paste it into the target app'
      }
    })
    expect(send).toHaveBeenNthCalledWith(2, 'notify-window:state-changed', {
      notification: {
        title: 'Copied again'
      }
    })
    expect(notifyWindows.getState()).toEqual({
      notification: {
        title: 'Copied again'
      }
    })
    expect(hide).not.toHaveBeenCalled()
  })

  test('repositions a reused window onto the current cursor display before showing a new notification', async () => {
    const electron = await import('electron')
    const setBounds = vi.fn()
    const showInactive = vi.fn()
    const on = vi.fn()
    let visible = false

    vi.mocked(electron.screen.getCursorScreenPoint)
      .mockReturnValueOnce({ x: 10, y: 20 })
      .mockReturnValueOnce({ x: 1300, y: 300 })
    vi.mocked(electron.screen.getDisplayNearestPoint)
      .mockReturnValueOnce({
        workArea: { x: 0, y: 0, width: 1200, height: 900 }
      } as never)
      .mockReturnValueOnce({
        workArea: { x: 1200, y: 0, width: 1440, height: 1000 }
      } as never)

    const createWindow = vi.fn(
      () =>
        ({
          webContents: { send: vi.fn() },
          isDestroyed: () => false,
          isVisible: () => visible,
          getBounds: () => ({ x: 0, y: 0, width: 320, height: 88 }),
          setBounds,
          showInactive: () => {
            visible = true
            showInactive()
          },
          hide: vi.fn(),
          on
        }) as never
    )

    const { createNotifyWindows } = await import('../notify-windows')
    const notifyWindows = createNotifyWindows({ createWindow, timeoutMs: 2500 })

    await notifyWindows.show({ title: 'First notification' })
    await notifyWindows.show({ title: 'Second notification' })

    expect(createWindow).toHaveBeenCalledTimes(1)
    expect(setBounds).toHaveBeenNthCalledWith(1, {
      x: 440,
      y: 702,
      width: 320,
      height: 88
    })
    expect(setBounds).toHaveBeenNthCalledWith(2, {
      x: 1760,
      y: 802,
      width: 320,
      height: 88
    })
    expect(showInactive).toHaveBeenCalledTimes(1)
  })

  test('recreates the notify window after the previous one was manually closed', async () => {
    const electron = await import('electron')
    const createWindowHandles: Array<{ close: () => void }> = []

    vi.mocked(electron.screen.getCursorScreenPoint).mockReturnValue({ x: 0, y: 0 })
    vi.mocked(electron.screen.getDisplayNearestPoint).mockReturnValue({
      workArea: { x: 0, y: 0, width: 1200, height: 900 }
    } as never)

    const createWindow = vi.fn(() => {
      let closedHandler: (() => void) | undefined

      const handle = {
        close: () => {
          closedHandler?.()
        }
      }

      createWindowHandles.push(handle)

      return {
        webContents: { send: vi.fn() },
        isDestroyed: () => false,
        isVisible: () => false,
        getBounds: () => ({ x: 0, y: 0, width: 320, height: 88 }),
        setBounds: vi.fn(),
        showInactive: vi.fn(),
        hide: vi.fn(),
        on: vi.fn((event: string, callback: () => void) => {
          if (event === 'closed') {
            closedHandler = callback
          }
        })
      } as never
    })

    const { createNotifyWindows } = await import('../notify-windows')
    const notifyWindows = createNotifyWindows({ createWindow, timeoutMs: 2500 })

    await notifyWindows.show({ title: 'First notification' })
    createWindowHandles[0]?.close()
    await notifyWindows.show({ title: 'Second notification' })

    expect(createWindow).toHaveBeenCalledTimes(2)
  })

  test('closes the notify window and resets bridge state after the dismiss timeout', async () => {
    const send = vi.fn()
    const close = vi.fn()
    let closedHandler: (() => void) | undefined

    const createWindow = vi.fn(
      () =>
        ({
          webContents: { send },
          isDestroyed: () => false,
          isVisible: () => false,
          getBounds: () => ({ x: 0, y: 0, width: 320, height: 88 }),
          setBounds: vi.fn(),
          showInactive: vi.fn(),
          close: () => {
            close()
            closedHandler?.()
          },
          on: vi.fn((event: string, callback: () => void) => {
            if (event === 'closed') {
              closedHandler = callback
            }
          })
        }) as never
    )

    const { createNotifyWindows } = await import('../notify-windows')
    const notifyWindows = createNotifyWindows({ createWindow, timeoutMs: 2500 })

    await notifyWindows.show({
      title: 'Copied to clipboard'
    })

    await vi.advanceTimersByTimeAsync(2500)

    expect(close).toHaveBeenCalledTimes(1)
    expect(notifyWindows.getState()).toEqual({
      notification: null
    })
  })

  test('creates a fresh notify window after timeout dismissal closed the previous one', async () => {
    const createWindowHandles: Array<{ close: () => void }> = []

    const createWindow = vi.fn(() => {
      let closedHandler: (() => void) | undefined
      const handle = {
        close: () => {
          closedHandler?.()
        }
      }

      createWindowHandles.push(handle)

      return {
        webContents: { send: vi.fn() },
        isDestroyed: () => false,
        isVisible: () => false,
        getBounds: () => ({ x: 0, y: 0, width: 320, height: 88 }),
        setBounds: vi.fn(),
        showInactive: vi.fn(),
        close: handle.close,
        on: vi.fn((event: string, callback: () => void) => {
          if (event === 'closed') {
            closedHandler = callback
          }
        })
      } as never
    })

    const { createNotifyWindows } = await import('../notify-windows')
    const notifyWindows = createNotifyWindows({ createWindow, timeoutMs: 2500 })

    await notifyWindows.show({ title: 'First notification' })
    await vi.advanceTimersByTimeAsync(2500)
    await notifyWindows.show({ title: 'Second notification' })

    expect(createWindow).toHaveBeenCalledTimes(2)
    expect(createWindowHandles).toHaveLength(2)
  })
})
