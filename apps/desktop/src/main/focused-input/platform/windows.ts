import { execFile as nodeExecFile } from 'node:child_process'
import type { RawAppIdentity } from '@openbroca/app-identity'

const TEXTUAL_WINDOWS_CONTROL_TYPES = ['ControlType.Edit', 'ControlType.Document', 'ControlType.ComboBox'] as const

export function isLikelyWindowsEditableControl(
  controlType: unknown,
  options: {
    hasValuePattern: boolean
    isReadOnly: boolean | null
    hasTextPattern?: boolean
  }
): boolean {
  if (typeof controlType !== 'string' || !TEXTUAL_WINDOWS_CONTROL_TYPES.includes(controlType as (typeof TEXTUAL_WINDOWS_CONTROL_TYPES)[number])) {
    return false
  }

  if (controlType === 'ControlType.Document') {
    return options.hasTextPattern === true || (options.hasValuePattern && options.isReadOnly === false)
  }

  if (options.hasValuePattern) {
    return options.isReadOnly === false
  }

  return controlType === 'ControlType.Edit'
}

export const WINDOWS_FOCUSED_INPUT_POWERSHELL_SCRIPT = `
try {
  Add-Type -AssemblyName UIAutomationClient | Out-Null
  $element = [System.Windows.Automation.AutomationElement]::FocusedElement
  if ($null -eq $element) { return }

  $controlTypeName = $element.Current.ControlType.ProgrammaticName
  if ([string]::IsNullOrWhiteSpace($controlTypeName)) { return }
  if (
    $controlTypeName -ne 'ControlType.Edit' -and
    $controlTypeName -ne 'ControlType.Document' -and
    $controlTypeName -ne 'ControlType.ComboBox'
  ) { return }

  $valuePattern = $null
  $hasValuePattern = $element.TryGetCurrentPattern(
    [System.Windows.Automation.ValuePattern]::Pattern,
    [ref]$valuePattern
  )
  $textPattern = $null
  $hasTextPattern = $element.TryGetCurrentPattern(
    [System.Windows.Automation.TextPattern]::Pattern,
    [ref]$textPattern
  )

  $isEditable = $false
  if ($controlTypeName -eq 'ControlType.Document') {
    $isEditable =
      $hasTextPattern -or
      ($hasValuePattern -and -not ([System.Windows.Automation.ValuePattern]$valuePattern).Current.IsReadOnly)
  } elseif ($hasValuePattern) {
    $isEditable = -not ([System.Windows.Automation.ValuePattern]$valuePattern).Current.IsReadOnly
  } elseif ($controlTypeName -eq 'ControlType.Edit') {
    $isEditable = $true
  }

  if (-not $isEditable) { return }

  $process = Get-Process -Id $element.Current.ProcessId -ErrorAction Stop
  if ($null -eq $process) { return }

  $path = $process.Path
  if ([string]::IsNullOrWhiteSpace($path)) { return }

  $displayName = $process.ProcessName
  if ([string]::IsNullOrWhiteSpace($displayName)) {
    $displayName = $process.MainWindowTitle
  }

  if ([string]::IsNullOrWhiteSpace($displayName)) { return }

  [pscustomobject]@{
    displayName = $displayName
    platform = 'windows'
    path = $path
    source = 'detected'
  } | ConvertTo-Json -Compress
} catch {
}
`

function execFile(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    nodeExecFile(file, args, { timeout: 1000 }, (error, stdout) => {
      if (error) {
        reject(error)
        return
      }

      resolve(stdout ?? '')
    })
  })
}

function parseFocusedInputApp(stdout: string): RawAppIdentity | null {
  const trimmed = stdout.trim()
  if (!trimmed) {
    return null
  }

  try {
    const parsed = JSON.parse(trimmed) as RawAppIdentity
    if (parsed.platform !== 'windows' || parsed.source !== 'detected' || !parsed.path?.trim()) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export async function resolveWindowsFocusedInputApp(): Promise<RawAppIdentity | null> {
  try {
    const stdout = await execFile('powershell', ['-NoProfile', '-Command', WINDOWS_FOCUSED_INPUT_POWERSHELL_SCRIPT])
    return parseFocusedInputApp(stdout)
  } catch {
    return null
  }
}
