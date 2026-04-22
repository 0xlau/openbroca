import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SHORTCUT_SETTINGS,
  getShortcutPrimaryKey,
  normalizeShortcutSettings,
  type ShortcutSettings,
  resolveDefaultShortcutSettings,
  validateShortcutSettings
} from '../shortcuts'

describe('shortcuts', () => {
  const macDefaults: ShortcutSettings = {
    quickAccelerator: 'Command',
    toHoldKey: 'Space',
    holdAccelerator: 'Command+Space'
  }

  const nonMacDefaults: ShortcutSettings = {
    quickAccelerator: 'CommandOrControl',
    toHoldKey: 'Space',
    holdAccelerator: 'CommandOrControl+Space'
  }

  it('resolveDefaultShortcutSettings(darwin) uses Command-based defaults', () => {
    expect(resolveDefaultShortcutSettings('darwin')).toEqual(macDefaults)
  })

  it('resolveDefaultShortcutSettings(non-darwin) uses Control-based defaults', () => {
    expect(resolveDefaultShortcutSettings('win32')).toEqual(nonMacDefaults)
    expect(resolveDefaultShortcutSettings('linux')).toEqual(nonMacDefaults)
  })

  it('normalizeShortcutSettings(undefined) uses the safe fallback defaults', () => {
    expect(normalizeShortcutSettings(undefined)).toEqual(DEFAULT_SHORTCUT_SETTINGS)
  })

  it('normalizeShortcutSettings(undefined, platform) uses platform defaults', () => {
    expect(normalizeShortcutSettings(undefined, 'darwin')).toEqual(macDefaults)
    expect(normalizeShortcutSettings(undefined, 'win32')).toEqual(nonMacDefaults)
  })

  it('normalizeShortcutSettings backfills missing fields', () => {
    expect(normalizeShortcutSettings({ quickAccelerator: 'Option+Space' }, 'darwin')).toEqual({
      quickAccelerator: 'Option+Space',
      toHoldKey: 'Space',
      holdAccelerator: macDefaults.holdAccelerator
    })
  })

  it('normalizeShortcutSettings migrates the old non-mac legacy default to the new defaults', () => {
    expect(
      normalizeShortcutSettings(
        { floatingWindowAccelerator: 'CommandOrControl+Shift+Space' },
        'win32'
      )
    ).toEqual(nonMacDefaults)
  })

  it('normalizeShortcutSettings preserves legacy custom quick shortcuts on non-mac', () => {
    expect(
      normalizeShortcutSettings({
        quickAccelerator: '',
        floatingWindowAccelerator: 'CommandOrControl+K'
      }, 'win32')
    ).toEqual({
      quickAccelerator: 'CommandOrControl+K',
      toHoldKey: 'Space',
      holdAccelerator: nonMacDefaults.holdAccelerator
    })
  })

  it('normalizeShortcutSettings supports legacy floatingWindowAccelerator shape on macOS', () => {
    expect(
      normalizeShortcutSettings({ floatingWindowAccelerator: 'Command+K' }, 'darwin')
    ).toEqual({
      quickAccelerator: 'Command+K',
      toHoldKey: 'Space',
      holdAccelerator: macDefaults.holdAccelerator
    })
  })

  it('getShortcutPrimaryKey handles Option+Shift+Space', () => {
    expect(getShortcutPrimaryKey('Option+Shift+Space')).toBe('Space')
  })

  it('getShortcutPrimaryKey handles CommandOrControl+K', () => {
    expect(getShortcutPrimaryKey('CommandOrControl+K')).toBe('K')
  })

  it('validateShortcutSettings returns exact conflict errors', () => {
    expect(
      validateShortcutSettings({
        quickAccelerator: 'Option+Space',
        toHoldKey: 'Space',
        holdAccelerator: 'Option+Space'
      })
    ).toEqual([
      { field: 'holdAccelerator', message: 'Hold cannot use the same shortcut as Quick.' },
      { field: 'toHoldKey', message: 'To Hold cannot use the Quick trigger key.' }
    ])
  })
})
