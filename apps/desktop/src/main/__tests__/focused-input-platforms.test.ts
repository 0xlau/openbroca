import { describe, expect, test } from 'vitest'
import {
  isLikelyWindowsEditableControl,
  WINDOWS_FOCUSED_INPUT_POWERSHELL_SCRIPT
} from '../focused-input/platform/windows'

describe('focused-input platform heuristics', () => {
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

  test('keeps Windows editable-control heuristics intact', () => {
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
