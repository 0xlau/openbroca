import { uIOhook, UiohookKey, UiohookKeyboardEvent } from 'uiohook-napi'

interface ParsedAccelerator {
  ctrl: boolean
  shift: boolean
  meta: boolean
  alt: boolean
  keyCode: number
}

/**
 * Maps common accelerator key names to uiohook keycodes.
 * Extend this map to support more keys.
 */
const KEY_NAME_TO_CODE: Record<string, number> = {
  space: UiohookKey.Space,
  return: UiohookKey.Enter,
  enter: UiohookKey.Enter,
  tab: UiohookKey.Tab,
  escape: UiohookKey.Escape,
  esc: UiohookKey.Escape,
  backspace: UiohookKey.Backspace,
  delete: UiohookKey.Delete,
  up: UiohookKey.ArrowUp,
  down: UiohookKey.ArrowDown,
  left: UiohookKey.ArrowLeft,
  right: UiohookKey.ArrowRight,
  f1: UiohookKey.F1,
  f2: UiohookKey.F2,
  f3: UiohookKey.F3,
  f4: UiohookKey.F4,
  f5: UiohookKey.F5,
  f6: UiohookKey.F6,
  f7: UiohookKey.F7,
  f8: UiohookKey.F8,
  f9: UiohookKey.F9,
  f10: UiohookKey.F10,
  f11: UiohookKey.F11,
  f12: UiohookKey.F12
}

function parseAccelerator(accelerator: string): ParsedAccelerator | null {
  const parts = accelerator.split('+').map((p) => p.trim().toLowerCase())

  let ctrl = false
  let shift = false
  let meta = false
  let alt = false
  let keyCode: number | null = null

  for (const part of parts) {
    switch (part) {
      case 'ctrl':
      case 'control':
        ctrl = true
        break
      case 'cmdorctrl':
      case 'commandorcontrol':
        if (process.platform === 'darwin') {
          meta = true
        } else {
          ctrl = true
        }
        break
      case 'cmd':
      case 'command':
        meta = true
        break
      case 'shift':
        shift = true
        break
      case 'alt':
      case 'option':
        alt = true
        break
      default: {
        const code = KEY_NAME_TO_CODE[part]
        if (code !== undefined) {
          keyCode = code
        } else if (part.length === 1) {
          // Single character key — use charCodeAt as a best-effort keycode
          // This is approximate; uiohook keycodes for letters follow US keyboard layout
          keyCode = part.charCodeAt(0)
        }
      }
    }
  }

  if (keyCode === null) return null

  return { ctrl, shift, meta, alt, keyCode }
}

function modifiersMatch(event: UiohookKeyboardEvent, parsed: ParsedAccelerator): boolean {
  return (
    event.ctrlKey === parsed.ctrl &&
    event.shiftKey === parsed.shift &&
    event.metaKey === parsed.meta &&
    event.altKey === parsed.alt
  )
}

class ShortcutManager {
  private parsed: ParsedAccelerator | null = null
  private onDown: (() => void) | null = null
  private onUp: (() => void) | null = null
  private isDown = false
  private started = false

  private handleKeydown = (e: UiohookKeyboardEvent): void => {
    if (!this.parsed || !this.onDown) return
    if (e.keycode !== this.parsed.keyCode) return
    if (!modifiersMatch(e, this.parsed)) return
    if (this.isDown) return // guard against key repeat

    this.isDown = true
    this.onDown()
  }

  private handleKeyup = (e: UiohookKeyboardEvent): void => {
    if (!this.parsed || !this.onUp) return
    if (e.keycode !== this.parsed.keyCode) return

    if (this.isDown) {
      this.isDown = false
      this.onUp()
    }
  }

  start(accelerator: string, onDown: () => void, onUp: () => void): void {
    this.parsed = parseAccelerator(accelerator)
    this.onDown = onDown
    this.onUp = onUp
    this.isDown = false

    if (!this.started) {
      uIOhook.on('keydown', this.handleKeydown)
      uIOhook.on('keyup', this.handleKeyup)
      uIOhook.start()
      this.started = true
    }
  }

  updateAccelerator(accelerator: string): void {
    this.parsed = parseAccelerator(accelerator)
    this.isDown = false
  }

  stop(): void {
    if (this.started) {
      uIOhook.off('keydown', this.handleKeydown)
      uIOhook.off('keyup', this.handleKeyup)
      uIOhook.stop()
      this.started = false
    }
    this.isDown = false
  }
}

export const shortcutManager = new ShortcutManager()
