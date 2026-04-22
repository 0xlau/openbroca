import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const HANDLER_KEYDOWN = 'keydown'
const HANDLER_KEYUP = 'keyup'
const UIOHOOK_CTRL = 29
const UIOHOOK_SHIFT = 42
const UIOHOOK_ALT = 56
const UIOHOOK_META = 3675
const UIOHOOK_SPACE = 57
const UIOHOOK_ENTER = 28
const UIOHOOK_TAB = 15
const UIOHOOK_K = 37
const UIOHOOK_P = 25
const UIOHOOK_1 = 2

const mockUiohookOn = vi.fn()
const mockUiohookOff = vi.fn()
const mockUiohookStart = vi.fn()
const mockUiohookStop = vi.fn()

type KeyboardEventShape = {
  keycode: number
  ctrlKey: boolean
  shiftKey: boolean
  metaKey: boolean
  altKey: boolean
}

let keydownHandler: ((event: KeyboardEventShape) => void) | null = null
let keyupHandler: ((event: KeyboardEventShape) => void) | null = null

vi.mock('uiohook-napi', () => {
  const UiohookKey = {
    Ctrl: UIOHOOK_CTRL,
    Shift: UIOHOOK_SHIFT,
    Alt: UIOHOOK_ALT,
    Meta: UIOHOOK_META,
    Space: UIOHOOK_SPACE,
    Enter: UIOHOOK_ENTER,
    Tab: UIOHOOK_TAB,
    K: UIOHOOK_K,
    P: UIOHOOK_P,
    '1': UIOHOOK_1
  }

  return {
    UiohookKey,
    uIOhook: {
      on: mockUiohookOn.mockImplementation((eventName: string, handler: unknown) => {
        if (eventName === HANDLER_KEYDOWN) {
          keydownHandler = handler as typeof keydownHandler
        }
        if (eventName === HANDLER_KEYUP) {
          keyupHandler = handler as typeof keyupHandler
        }
      }),
      off: mockUiohookOff.mockImplementation((eventName: string, handler: unknown) => {
        if (eventName === HANDLER_KEYDOWN && keydownHandler === handler) {
          keydownHandler = null
        }
        if (eventName === HANDLER_KEYUP && keyupHandler === handler) {
          keyupHandler = null
        }
      }),
      start: mockUiohookStart,
      stop: mockUiohookStop
    }
  }
})

function getQuickEventModifiers(): Pick<
  KeyboardEventShape,
  'ctrlKey' | 'metaKey'
> {
  if (process.platform === 'darwin') {
    return { ctrlKey: false, metaKey: true }
  }
  return { ctrlKey: true, metaKey: false }
}

function createKeyboardEvent(
  keycode: number,
  modifiers: Partial<Omit<KeyboardEventShape, 'keycode'>> = {}
): KeyboardEventShape {
  return {
    keycode,
    ctrlKey: false,
    shiftKey: false,
    metaKey: false,
    altKey: false,
    ...modifiers
  }
}

function dispatchKeydown(event: KeyboardEventShape): void {
  if (!keydownHandler) throw new Error('keydown handler not registered')
  keydownHandler(event)
}

function dispatchKeyup(event: KeyboardEventShape): void {
  if (!keyupHandler) throw new Error('keyup handler not registered')
  keyupHandler(event)
}

describe('shortcutManager capture bindings', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(0)
    keydownHandler = null
    keyupHandler = null
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('quick accelerator keydown triggers onQuickDown and keyup triggers onQuickUp once', async () => {
    const { shortcutManager } = await import('../shortcut-manager')
    const onQuickDown = vi.fn()
    const onQuickUp = vi.fn()

    shortcutManager.startCaptureBindings({
      quickAccelerator: 'CommandOrControl+Space',
      toHoldKey: 'Tab',
      holdAccelerator: 'Shift+Enter',
      onQuickDown,
      onQuickUp,
      onToHoldDown: vi.fn(),
      onHoldDown: vi.fn()
    })

    dispatchKeydown(createKeyboardEvent(UIOHOOK_SPACE, { ...getQuickEventModifiers() }))
    dispatchKeyup(createKeyboardEvent(UIOHOOK_SPACE, { ...getQuickEventModifiers() }))

    expect(onQuickDown).toHaveBeenCalledTimes(1)
    expect(onQuickUp).toHaveBeenCalledTimes(1)
  })

  test('toHold keydown triggers onToHoldDown without requiring keyup handling', async () => {
    const { shortcutManager } = await import('../shortcut-manager')
    const onToHoldDown = vi.fn()

    shortcutManager.startCaptureBindings({
      quickAccelerator: 'CommandOrControl+Space',
      toHoldKey: 'Tab',
      holdAccelerator: 'Shift+Enter',
      onQuickDown: vi.fn(),
      onQuickUp: vi.fn(),
      onToHoldDown,
      onHoldDown: vi.fn()
    })

    dispatchKeydown(createKeyboardEvent(UIOHOOK_TAB))

    expect(onToHoldDown).toHaveBeenCalledTimes(1)
  })

  test('single-letter toHold keydown triggers onToHoldDown with no modifiers', async () => {
    const { shortcutManager } = await import('../shortcut-manager')
    const onToHoldDown = vi.fn()

    shortcutManager.startCaptureBindings({
      quickAccelerator: 'CommandOrControl+Space',
      toHoldKey: 'P',
      holdAccelerator: 'Shift+Enter',
      onQuickDown: vi.fn(),
      onQuickUp: vi.fn(),
      onToHoldDown,
      onHoldDown: vi.fn()
    })

    dispatchKeydown(createKeyboardEvent(UIOHOOK_P))

    expect(onToHoldDown).toHaveBeenCalledTimes(1)
  })

  test('single-letter toHold keydown still triggers when modifiers are pressed', async () => {
    const { shortcutManager } = await import('../shortcut-manager')
    const onToHoldDown = vi.fn()

    shortcutManager.startCaptureBindings({
      quickAccelerator: 'CommandOrControl+Space',
      toHoldKey: 'P',
      holdAccelerator: 'Shift+Enter',
      onQuickDown: vi.fn(),
      onQuickUp: vi.fn(),
      onToHoldDown,
      onHoldDown: vi.fn()
    })

    dispatchKeydown(createKeyboardEvent(UIOHOOK_P, { metaKey: true }))

    expect(onToHoldDown).toHaveBeenCalledTimes(1)
  })

  test('hold accelerator keydown triggers onHoldDown', async () => {
    const { shortcutManager } = await import('../shortcut-manager')
    const onHoldDown = vi.fn()

    shortcutManager.startCaptureBindings({
      quickAccelerator: 'CommandOrControl+Space',
      toHoldKey: 'Tab',
      holdAccelerator: 'Shift+Enter',
      onQuickDown: vi.fn(),
      onQuickUp: vi.fn(),
      onToHoldDown: vi.fn(),
      onHoldDown
    })

    dispatchKeydown(createKeyboardEvent(UIOHOOK_ENTER, { shiftKey: true }))

    expect(onHoldDown).toHaveBeenCalledTimes(1)
  })

  test('repeated toHold keydown should not double-fire while held', async () => {
    const { shortcutManager } = await import('../shortcut-manager')
    const onToHoldDown = vi.fn()

    shortcutManager.startCaptureBindings({
      quickAccelerator: 'CommandOrControl+Space',
      toHoldKey: 'Tab',
      holdAccelerator: 'Shift+Enter',
      onQuickDown: vi.fn(),
      onQuickUp: vi.fn(),
      onToHoldDown,
      onHoldDown: vi.fn()
    })

    const toHoldEvent = createKeyboardEvent(UIOHOOK_TAB)

    dispatchKeydown(toHoldEvent)
    dispatchKeydown(toHoldEvent)

    expect(onToHoldDown).toHaveBeenCalledTimes(1)
  })

  test('toHold fires again after keyup and second keydown', async () => {
    const { shortcutManager } = await import('../shortcut-manager')
    const onToHoldDown = vi.fn()

    shortcutManager.startCaptureBindings({
      quickAccelerator: 'CommandOrControl+Space',
      toHoldKey: 'Tab',
      holdAccelerator: 'Shift+Enter',
      onQuickDown: vi.fn(),
      onQuickUp: vi.fn(),
      onToHoldDown,
      onHoldDown: vi.fn()
    })

    const toHoldEvent = createKeyboardEvent(UIOHOOK_TAB)

    dispatchKeydown(toHoldEvent)
    dispatchKeyup(toHoldEvent)
    dispatchKeydown(toHoldEvent)

    expect(onToHoldDown).toHaveBeenCalledTimes(2)
  })

  test('repeated hold keydown should not double-fire while held', async () => {
    const { shortcutManager } = await import('../shortcut-manager')
    const onHoldDown = vi.fn()

    shortcutManager.startCaptureBindings({
      quickAccelerator: 'CommandOrControl+Space',
      toHoldKey: 'Tab',
      holdAccelerator: 'Shift+Enter',
      onQuickDown: vi.fn(),
      onQuickUp: vi.fn(),
      onToHoldDown: vi.fn(),
      onHoldDown
    })

    const holdEvent = createKeyboardEvent(UIOHOOK_ENTER, { shiftKey: true })

    dispatchKeydown(holdEvent)
    dispatchKeydown(holdEvent)

    expect(onHoldDown).toHaveBeenCalledTimes(1)
  })

  test('hold fires again after keyup and second keydown', async () => {
    const { shortcutManager } = await import('../shortcut-manager')
    const onHoldDown = vi.fn()

    shortcutManager.startCaptureBindings({
      quickAccelerator: 'CommandOrControl+Space',
      toHoldKey: 'Tab',
      holdAccelerator: 'Shift+Enter',
      onQuickDown: vi.fn(),
      onQuickUp: vi.fn(),
      onToHoldDown: vi.fn(),
      onHoldDown
    })

    const holdEvent = createKeyboardEvent(UIOHOOK_ENTER, { shiftKey: true })

    dispatchKeydown(holdEvent)
    dispatchKeyup(holdEvent)
    dispatchKeydown(holdEvent)

    expect(onHoldDown).toHaveBeenCalledTimes(2)
  })

  test('wrong modifiers do not fire hold binding', async () => {
    const { shortcutManager } = await import('../shortcut-manager')
    const onHoldDown = vi.fn()

    shortcutManager.startCaptureBindings({
      quickAccelerator: 'CommandOrControl+Space',
      toHoldKey: 'Tab',
      holdAccelerator: 'Shift+Enter',
      onQuickDown: vi.fn(),
      onQuickUp: vi.fn(),
      onToHoldDown: vi.fn(),
      onHoldDown
    })

    dispatchKeydown(createKeyboardEvent(UIOHOOK_ENTER))

    expect(onHoldDown).not.toHaveBeenCalled()
  })

  test('repeated quick keydown should not double-fire while held', async () => {
    const { shortcutManager } = await import('../shortcut-manager')
    const onQuickDown = vi.fn()

    shortcutManager.startCaptureBindings({
      quickAccelerator: 'CommandOrControl+Space',
      toHoldKey: 'Tab',
      holdAccelerator: 'Shift+Enter',
      onQuickDown,
      onQuickUp: vi.fn(),
      onToHoldDown: vi.fn(),
      onHoldDown: vi.fn()
    })

    const quickEvent = createKeyboardEvent(UIOHOOK_SPACE, { ...getQuickEventModifiers() })

    dispatchKeydown(quickEvent)
    dispatchKeydown(quickEvent)

    expect(onQuickDown).toHaveBeenCalledTimes(1)
  })

  test('single-letter accelerator uses uiohook keycode mapping (CommandOrControl+K)', async () => {
    const { shortcutManager } = await import('../shortcut-manager')
    const onQuickDown = vi.fn()

    shortcutManager.startCaptureBindings({
      quickAccelerator: 'CommandOrControl+K',
      toHoldKey: 'Tab',
      holdAccelerator: 'Shift+Enter',
      onQuickDown,
      onQuickUp: vi.fn(),
      onToHoldDown: vi.fn(),
      onHoldDown: vi.fn()
    })

    dispatchKeydown(createKeyboardEvent(UIOHOOK_K, { ...getQuickEventModifiers() }))

    expect(onQuickDown).toHaveBeenCalledTimes(1)
  })

  test('single-digit accelerator uses uiohook keycode mapping (Option+1)', async () => {
    const { shortcutManager } = await import('../shortcut-manager')
    const onHoldDown = vi.fn()

    shortcutManager.startCaptureBindings({
      quickAccelerator: 'CommandOrControl+Space',
      toHoldKey: 'Tab',
      holdAccelerator: 'Option+1',
      onQuickDown: vi.fn(),
      onQuickUp: vi.fn(),
      onToHoldDown: vi.fn(),
      onHoldDown
    })

    dispatchKeydown(createKeyboardEvent(UIOHOOK_1, { altKey: true }))

    expect(onHoldDown).toHaveBeenCalledTimes(1)
  })

  test('updateCaptureBindings resets quick down-state so updated bindings can fire again', async () => {
    const { shortcutManager } = await import('../shortcut-manager')
    const onQuickDown = vi.fn()

    shortcutManager.startCaptureBindings({
      quickAccelerator: 'CommandOrControl+Space',
      toHoldKey: 'Tab',
      holdAccelerator: 'Shift+Enter',
      onQuickDown,
      onQuickUp: vi.fn(),
      onToHoldDown: vi.fn(),
      onHoldDown: vi.fn()
    })

    const quickEvent = createKeyboardEvent(UIOHOOK_SPACE, { ...getQuickEventModifiers() })

    dispatchKeydown(quickEvent)
    shortcutManager.updateCaptureBindings({
      quickAccelerator: 'CommandOrControl+Space',
      toHoldKey: 'Tab',
      holdAccelerator: 'Shift+Enter'
    })
    dispatchKeydown(quickEvent)

    expect(onQuickDown).toHaveBeenCalledTimes(2)
  })

  test('stop unregisters listeners and stops uIOhook', async () => {
    const { shortcutManager } = await import('../shortcut-manager')

    shortcutManager.startCaptureBindings({
      quickAccelerator: 'CommandOrControl+Space',
      toHoldKey: 'Tab',
      holdAccelerator: 'Shift+Enter',
      onQuickDown: vi.fn(),
      onQuickUp: vi.fn(),
      onToHoldDown: vi.fn(),
      onHoldDown: vi.fn()
    })

    shortcutManager.stop()

    expect(mockUiohookOff).toHaveBeenCalledTimes(2)
    expect(mockUiohookStop).toHaveBeenCalledTimes(1)
    expect(keydownHandler).toBeNull()
    expect(keyupHandler).toBeNull()
  })

  test('modifier-only quick double tap triggers onQuickDown and onQuickUp once', async () => {
    const { shortcutManager } = await import('../shortcut-manager')
    const onQuickDown = vi.fn()
    const onQuickUp = vi.fn()

    shortcutManager.startCaptureBindings({
      quickAccelerator: 'Control',
      toHoldKey: 'Tab',
      holdAccelerator: 'Shift+Enter',
      onQuickDown,
      onQuickUp,
      onToHoldDown: vi.fn(),
      onHoldDown: vi.fn()
    })

    const ctrlEvent = createKeyboardEvent(UIOHOOK_CTRL, { ctrlKey: true })

    dispatchKeydown(ctrlEvent)
    dispatchKeyup(ctrlEvent)
    vi.advanceTimersByTime(100)
    dispatchKeydown(ctrlEvent)

    expect(onQuickDown).toHaveBeenCalledTimes(1)

    dispatchKeyup(ctrlEvent)

    expect(onQuickUp).toHaveBeenCalledTimes(1)
  })

  test('single tap of modifier-only quick does not trigger', async () => {
    const { shortcutManager } = await import('../shortcut-manager')
    const onQuickDown = vi.fn()
    const onQuickUp = vi.fn()

    shortcutManager.startCaptureBindings({
      quickAccelerator: 'Control',
      toHoldKey: 'Tab',
      holdAccelerator: 'Shift+Enter',
      onQuickDown,
      onQuickUp,
      onToHoldDown: vi.fn(),
      onHoldDown: vi.fn()
    })

    const ctrlEvent = createKeyboardEvent(UIOHOOK_CTRL, { ctrlKey: true })

    dispatchKeydown(ctrlEvent)
    dispatchKeyup(ctrlEvent)

    expect(onQuickDown).not.toHaveBeenCalled()
    expect(onQuickUp).not.toHaveBeenCalled()
  })

  test('modifier-only hold double tap triggers onHoldDown once', async () => {
    const { shortcutManager } = await import('../shortcut-manager')
    const onHoldDown = vi.fn()

    shortcutManager.startCaptureBindings({
      quickAccelerator: 'CommandOrControl+Space',
      toHoldKey: 'Tab',
      holdAccelerator: 'Shift',
      onQuickDown: vi.fn(),
      onQuickUp: vi.fn(),
      onToHoldDown: vi.fn(),
      onHoldDown
    })

    const shiftEvent = createKeyboardEvent(UIOHOOK_SHIFT, { shiftKey: true })

    dispatchKeydown(shiftEvent)
    dispatchKeyup(shiftEvent)
    vi.advanceTimersByTime(100)
    dispatchKeydown(shiftEvent)
    dispatchKeydown(shiftEvent)

    expect(onHoldDown).toHaveBeenCalledTimes(1)
  })

  test('normal non-modifier shortcuts still work', async () => {
    const { shortcutManager } = await import('../shortcut-manager')
    const onQuickDown = vi.fn()
    const onQuickUp = vi.fn()
    const onHoldDown = vi.fn()

    shortcutManager.startCaptureBindings({
      quickAccelerator: 'CommandOrControl+K',
      toHoldKey: 'Tab',
      holdAccelerator: 'Option+1',
      onQuickDown,
      onQuickUp,
      onToHoldDown: vi.fn(),
      onHoldDown
    })

    dispatchKeydown(createKeyboardEvent(UIOHOOK_K, { ...getQuickEventModifiers() }))
    dispatchKeyup(createKeyboardEvent(UIOHOOK_K, { ...getQuickEventModifiers() }))
    dispatchKeydown(createKeyboardEvent(UIOHOOK_1, { altKey: true }))

    expect(onQuickDown).toHaveBeenCalledTimes(1)
    expect(onQuickUp).toHaveBeenCalledTimes(1)
    expect(onHoldDown).toHaveBeenCalledTimes(1)
  })

  test('single-letter toHold still works while modifier-only quick is active', async () => {
    const { shortcutManager } = await import('../shortcut-manager')
    const onQuickDown = vi.fn()
    const onToHoldDown = vi.fn()

    shortcutManager.startCaptureBindings({
      quickAccelerator: 'Control',
      toHoldKey: 'P',
      holdAccelerator: 'Shift+Enter',
      onQuickDown,
      onQuickUp: vi.fn(),
      onToHoldDown,
      onHoldDown: vi.fn()
    })

    const ctrlEvent = createKeyboardEvent(UIOHOOK_CTRL, { ctrlKey: true })

    dispatchKeydown(ctrlEvent)
    dispatchKeyup(ctrlEvent)
    vi.advanceTimersByTime(100)
    dispatchKeydown(ctrlEvent)
    dispatchKeydown(createKeyboardEvent(UIOHOOK_P, { ctrlKey: true }))

    expect(onQuickDown).toHaveBeenCalledTimes(1)
    expect(onToHoldDown).toHaveBeenCalledTimes(1)
  })
})
