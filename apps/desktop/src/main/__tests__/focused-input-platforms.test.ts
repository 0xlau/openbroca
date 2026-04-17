import { describe, expect, test } from 'vitest'
import { isLikelyMacEditableRole, MAC_FOCUSED_INPUT_JXA_SCRIPT } from '../focused-input/platform/macos'
import {
  isLikelyWindowsEditableControl,
  WINDOWS_FOCUSED_INPUT_POWERSHELL_SCRIPT
} from '../focused-input/platform/windows'

describe('focused-input platform heuristics', () => {
  test('does not treat AXWebArea as editable without AXEditable', () => {
    expect(isLikelyMacEditableRole('AXWebArea', null)).toBe(false)
    expect(isLikelyMacEditableRole('AXWebArea', false)).toBe(false)
    expect(isLikelyMacEditableRole('AXWebArea', true)).toBe(true)
  })

  test('treats text roles as editable even when AXEditable is missing', () => {
    expect(isLikelyMacEditableRole('AXTextField', null)).toBe(true)
    expect(isLikelyMacEditableRole('AXTextArea', null)).toBe(true)
    expect(isLikelyMacEditableRole('AXSearchField', null)).toBe(true)
  })

  test('rejects implied text roles when AXEditable is explicitly false', () => {
    expect(isLikelyMacEditableRole('AXTextField', false)).toBe(false)
    expect(isLikelyMacEditableRole('AXTextArea', false)).toBe(false)
    expect(isLikelyMacEditableRole('AXSearchField', false)).toBe(false)
  })

  test('ships the macOS script with explicit false handling and no AXWebArea allowlist', () => {
    expect(MAC_FOCUSED_INPUT_JXA_SCRIPT).toContain(`function hasEditableRole(role, editable) {
  if (editable === false) {
    return false
  }

  return editable === true || impliedEditableRoles.indexOf(role) >= 0
}`)
    expect(MAC_FOCUSED_INPUT_JXA_SCRIPT).toContain('AXTextField')
    expect(MAC_FOCUSED_INPUT_JXA_SCRIPT).not.toContain('AXWebArea')
    expect(MAC_FOCUSED_INPUT_JXA_SCRIPT).toContain('systemEvents.UIElementsEnabled()')
  })

  test('requires a writable value pattern for document and combo box controls', () => {
    expect(
      isLikelyWindowsEditableControl('ControlType.Document', {
        hasValuePattern: false,
        isReadOnly: null,
        hasTextPattern: false
      })
    ).toBe(false)
    expect(
      isLikelyWindowsEditableControl('ControlType.Document', {
        hasValuePattern: false,
        isReadOnly: null,
        hasTextPattern: true
      })
    ).toBe(true)
    expect(
      isLikelyWindowsEditableControl('ControlType.ComboBox', {
        hasValuePattern: true,
        isReadOnly: true
      })
    ).toBe(false)
    expect(
      isLikelyWindowsEditableControl('ControlType.ComboBox', {
        hasValuePattern: true,
        isReadOnly: false
      })
    ).toBe(true)
  })

  test('rejects non-text controls even when they expose a writable value pattern', () => {
    expect(
      isLikelyWindowsEditableControl('ControlType.ListItem', {
        hasValuePattern: true,
        isReadOnly: false,
        hasTextPattern: true
      })
    ).toBe(false)
  })

  test('still allows plain edit controls without a value pattern', () => {
    expect(
      isLikelyWindowsEditableControl('ControlType.Edit', {
        hasValuePattern: false,
        isReadOnly: null,
        hasTextPattern: false
      })
    ).toBe(true)
  })

  test('ships the Windows script with the same control-type allowlist', () => {
    expect(WINDOWS_FOCUSED_INPUT_POWERSHELL_SCRIPT).toContain(`if (
    $controlTypeName -ne 'ControlType.Edit' -and
    $controlTypeName -ne 'ControlType.Document' -and
    $controlTypeName -ne 'ControlType.ComboBox'
  ) { return }`)
    expect(WINDOWS_FOCUSED_INPUT_POWERSHELL_SCRIPT).toContain(`if ($hasValuePattern) {
    $isEditable = -not ([System.Windows.Automation.ValuePattern]$valuePattern).Current.IsReadOnly
  } elseif ($controlTypeName -eq 'ControlType.Edit') {
    $isEditable = $true
  }`)
    expect(WINDOWS_FOCUSED_INPUT_POWERSHELL_SCRIPT).toContain(`[System.Windows.Automation.TextPattern]::Pattern`)
    expect(WINDOWS_FOCUSED_INPUT_POWERSHELL_SCRIPT).toContain(`if ($controlTypeName -eq 'ControlType.Document') {`)
  })
})
