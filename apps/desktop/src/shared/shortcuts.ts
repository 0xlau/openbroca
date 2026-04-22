export interface ShortcutSettings {
  quickAccelerator: string
  toHoldKey: string
  holdAccelerator: string
}

export type ShortcutValidationIssue = {
  field: keyof ShortcutSettings
  message: string
}

const MACOS_DEFAULT_SHORTCUT_SETTINGS: ShortcutSettings = {
  quickAccelerator: 'Command',
  toHoldKey: 'Space',
  holdAccelerator: 'Command+Space'
}

const NON_MACOS_DEFAULT_SHORTCUT_SETTINGS: ShortcutSettings = {
  quickAccelerator: 'CommandOrControl',
  toHoldKey: 'Space',
  holdAccelerator: 'CommandOrControl+Space'
}

const LEGACY_NON_MACOS_DEFAULT_FLOATING_WINDOW_ACCELERATOR = 'CommandOrControl+Shift+Space'

export function resolveDefaultShortcutSettings(platform?: string): ShortcutSettings {
  return platform === 'darwin'
    ? { ...MACOS_DEFAULT_SHORTCUT_SETTINGS }
    : { ...NON_MACOS_DEFAULT_SHORTCUT_SETTINGS }
}

export const DEFAULT_SHORTCUT_SETTINGS: ShortcutSettings = resolveDefaultShortcutSettings()

function getStringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

export function normalizeShortcutSettings(raw: unknown, platform?: string): ShortcutSettings {
  const defaults = resolveDefaultShortcutSettings(platform)

  if (raw == null || typeof raw !== 'object') {
    return defaults
  }

  const legacy = raw as { floatingWindowAccelerator?: unknown }
  const rawRecord = raw as Record<string, unknown>
  const hasUsableQuickAccelerator =
    typeof rawRecord.quickAccelerator === 'string' && rawRecord.quickAccelerator.length > 0
  if (
    !hasUsableQuickAccelerator &&
    typeof legacy.floatingWindowAccelerator === 'string' &&
    legacy.floatingWindowAccelerator.length > 0
  ) {
    if (
      platform !== 'darwin' &&
      legacy.floatingWindowAccelerator === LEGACY_NON_MACOS_DEFAULT_FLOATING_WINDOW_ACCELERATOR
    ) {
      return defaults
    }

    return {
      quickAccelerator: legacy.floatingWindowAccelerator,
      toHoldKey: defaults.toHoldKey,
      holdAccelerator: defaults.holdAccelerator
    }
  }

  const value = raw as Partial<ShortcutSettings>
  return {
    quickAccelerator: getStringValue(value.quickAccelerator, defaults.quickAccelerator),
    toHoldKey: getStringValue(value.toHoldKey, defaults.toHoldKey),
    holdAccelerator: getStringValue(value.holdAccelerator, defaults.holdAccelerator)
  }
}

export function getShortcutPrimaryKey(accelerator: string): string | null {
  const parts = accelerator.split('+')
  const primaryKey = parts[parts.length - 1]?.trim()
  return primaryKey && primaryKey.length > 0 ? primaryKey : null
}

export function validateShortcutSettings(settings: ShortcutSettings): ShortcutValidationIssue[] {
  const issues: ShortcutValidationIssue[] = []

  if (settings.holdAccelerator === settings.quickAccelerator) {
    issues.push({
      field: 'holdAccelerator',
      message: 'Hold cannot use the same shortcut as Quick.'
    })
  }

  if (settings.toHoldKey === getShortcutPrimaryKey(settings.quickAccelerator)) {
    issues.push({
      field: 'toHoldKey',
      message: 'To Hold cannot use the Quick trigger key.'
    })
  }

  return issues
}
