import { uIOhook, UiohookKey, UiohookKeyboardEvent } from 'uiohook-napi'

type ModifierKind = 'ctrl' | 'shift' | 'meta' | 'alt'

interface ParsedAccelerator {
  ctrl: boolean
  shift: boolean
  meta: boolean
  alt: boolean
  keyCode: number
  modifierOnly: boolean
}

const UIOHOOK_KEY_RECORD = UiohookKey as unknown as Record<string, number | undefined>
const MODIFIER_DOUBLE_TAP_THRESHOLD_MS = 250
const MODIFIER_KEY_CODES: Record<ModifierKind, number> = {
  ctrl: 29,
  shift: 42,
  alt: 56,
  meta: 3675
}
const ALPHANUMERIC_KEY_NAME_TO_CODE = [
  ...'abcdefghijklmnopqrstuvwxyz',
  ...'0123456789'
].reduce<Record<string, number>>((acc, keyName) => {
  const uiohookName = /[a-z]/.test(keyName) ? keyName.toUpperCase() : keyName
  const keyCode = UIOHOOK_KEY_RECORD[uiohookName]
  if (typeof keyCode === 'number') {
    acc[keyName] = keyCode
  }
  return acc
}, {})

/**
 * Maps common accelerator key names to uiohook keycodes.
 * Extend this map to support more keys.
 */
const KEY_NAME_TO_CODE: Record<string, number> = {
  ...ALPHANUMERIC_KEY_NAME_TO_CODE,
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

function resolveModifierKind(part: string): ModifierKind | null {
  switch (part) {
    case 'ctrl':
    case 'control':
      return 'ctrl'
    case 'cmdorctrl':
    case 'commandorcontrol':
      return process.platform === 'darwin' ? 'meta' : 'ctrl'
    case 'cmd':
    case 'command':
      return 'meta'
    case 'shift':
      return 'shift'
    case 'alt':
    case 'option':
      return 'alt'
    default:
      return null
  }
}

function parseAccelerator(accelerator: string): ParsedAccelerator | null {
  const parts = accelerator.split('+').map((p) => p.trim().toLowerCase())

  let ctrl = false
  let shift = false
  let meta = false
  let alt = false
  let keyCode: number | null = null
  let modifierOnlyKeyCode: number | null = null

  for (const part of parts) {
    const modifierKind = resolveModifierKind(part)
    if (modifierKind) {
      modifierOnlyKeyCode = MODIFIER_KEY_CODES[modifierKind]
      switch (modifierKind) {
        case 'ctrl':
          ctrl = true
          break
        case 'shift':
          shift = true
          break
        case 'meta':
          meta = true
          break
        case 'alt':
          alt = true
          break
      }
      continue
    }

    const code = KEY_NAME_TO_CODE[part]
    if (code !== undefined) {
      keyCode = code
    }
  }

  if (keyCode === null) {
    if (parts.length === 1 && modifierOnlyKeyCode !== null) {
      return {
        ctrl,
        shift,
        meta,
        alt,
        keyCode: modifierOnlyKeyCode,
        modifierOnly: true
      }
    }
    return null
  }

  return { ctrl, shift, meta, alt, keyCode, modifierOnly: false }
}

function matchesKeydown(event: UiohookKeyboardEvent, parsed: ParsedAccelerator): boolean {
  if (event.keycode !== parsed.keyCode) {
    return false
  }

  if (parsed.modifierOnly) {
    return true
  }

  return modifiersMatch(event, parsed)
}

function isDoubleTap(lastTapAt: number | null): boolean {
  return lastTapAt !== null && Date.now() - lastTapAt <= MODIFIER_DOUBLE_TAP_THRESHOLD_MS
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
  private parsedQuick: ParsedAccelerator | null = null
  private parsedToHold: ParsedAccelerator | null = null
  private parsedHold: ParsedAccelerator | null = null
  private onQuickDown: (() => void) | null = null
  private onQuickUp: (() => void) | null = null
  private onToHoldDown: (() => void) | null = null
  private onHoldDown: (() => void) | null = null
  private quickIsDown = false
  private toHoldIsDown = false
  private holdIsDown = false
  private lastQuickModifierTapAt: number | null = null
  private lastHoldModifierTapAt: number | null = null
  private started = false

  private shouldFireModifierOnlyKeydown(
    event: UiohookKeyboardEvent,
    parsed: ParsedAccelerator,
    isDown: boolean,
    lastTapAt: number | null
  ): boolean {
    return matchesKeydown(event, parsed) && !isDown && isDoubleTap(lastTapAt)
  }

  private resetBindingState(): void {
    this.quickIsDown = false
    this.toHoldIsDown = false
    this.holdIsDown = false
    this.lastQuickModifierTapAt = null
    this.lastHoldModifierTapAt = null
  }

  private handleKeydown = (e: UiohookKeyboardEvent): void => {
    if (this.parsedQuick && this.onQuickDown) {
      if (this.parsedQuick.modifierOnly) {
        if (
          this.shouldFireModifierOnlyKeydown(
            e,
            this.parsedQuick,
            this.quickIsDown,
            this.lastQuickModifierTapAt
          )
        ) {
          this.quickIsDown = true
          this.lastQuickModifierTapAt = null
          this.onQuickDown()
        }
      } else if (matchesKeydown(e, this.parsedQuick) && !this.quickIsDown) {
        this.quickIsDown = true
        this.onQuickDown()
      }
    }

    if (this.parsedToHold && this.onToHoldDown) {
      if (e.keycode === this.parsedToHold.keyCode && !this.toHoldIsDown) {
        this.toHoldIsDown = true
        this.onToHoldDown()
      }
    }

    if (this.parsedHold && this.onHoldDown) {
      if (this.parsedHold.modifierOnly) {
        if (
          this.shouldFireModifierOnlyKeydown(
            e,
            this.parsedHold,
            this.holdIsDown,
            this.lastHoldModifierTapAt
          )
        ) {
          this.holdIsDown = true
          this.lastHoldModifierTapAt = null
          this.onHoldDown()
        }
      } else if (matchesKeydown(e, this.parsedHold) && !this.holdIsDown) {
        this.holdIsDown = true
        this.onHoldDown()
      }
    }
  }

  private handleKeyup = (e: UiohookKeyboardEvent): void => {
    if (this.parsedQuick && e.keycode === this.parsedQuick.keyCode) {
      if (this.parsedQuick.modifierOnly) {
        if (this.quickIsDown) {
          this.quickIsDown = false
          this.lastQuickModifierTapAt = null
          this.onQuickUp?.()
        } else {
          this.lastQuickModifierTapAt = Date.now()
        }
      } else if (this.quickIsDown) {
        this.quickIsDown = false
        this.onQuickUp?.()
      }
    }

    if (this.parsedToHold && e.keycode === this.parsedToHold.keyCode && this.toHoldIsDown) {
      this.toHoldIsDown = false
    }

    if (this.parsedHold && e.keycode === this.parsedHold.keyCode) {
      if (this.parsedHold.modifierOnly) {
        if (this.holdIsDown) {
          this.holdIsDown = false
          this.lastHoldModifierTapAt = null
        } else {
          this.lastHoldModifierTapAt = Date.now()
        }
      } else if (this.holdIsDown) {
        this.holdIsDown = false
      }
    }
  }

  startCaptureBindings({
    quickAccelerator,
    toHoldKey,
    holdAccelerator,
    onQuickDown,
    onQuickUp,
    onToHoldDown,
    onHoldDown
  }: {
    quickAccelerator: string
    toHoldKey: string
    holdAccelerator: string
    onQuickDown: () => void
    onQuickUp: () => void
    onToHoldDown: () => void
    onHoldDown: () => void
  }): void {
    this.parsedQuick = parseAccelerator(quickAccelerator)
    this.parsedToHold = parseAccelerator(toHoldKey)
    this.parsedHold = parseAccelerator(holdAccelerator)
    this.onQuickDown = onQuickDown
    this.onQuickUp = onQuickUp
    this.onToHoldDown = onToHoldDown
    this.onHoldDown = onHoldDown
    this.resetBindingState()

    if (!this.started) {
      uIOhook.on('keydown', this.handleKeydown)
      uIOhook.on('keyup', this.handleKeyup)
      uIOhook.start()
      this.started = true
    }
  }

  updateCaptureBindings({
    quickAccelerator,
    toHoldKey,
    holdAccelerator
  }: {
    quickAccelerator: string
    toHoldKey: string
    holdAccelerator: string
  }): void {
    this.parsedQuick = parseAccelerator(quickAccelerator)
    this.parsedToHold = parseAccelerator(toHoldKey)
    this.parsedHold = parseAccelerator(holdAccelerator)
    this.resetBindingState()
  }

  stop(): void {
    if (this.started) {
      uIOhook.off('keydown', this.handleKeydown)
      uIOhook.off('keyup', this.handleKeyup)
      uIOhook.stop()
      this.started = false
    }
    this.resetBindingState()
  }
}

export const shortcutManager = new ShortcutManager()
