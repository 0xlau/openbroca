import { describe, expect, test, vi } from 'vitest'
import { createAutoEnterService } from '../send-key/auto-enter'

describe('createAutoEnterService', () => {
  test('auto enter sends Enter via osascript on macOS', async () => {
    const execFile = vi.fn(
      (
        _file: string,
        _args: string[],
        callback: (error: Error | null, stdout?: string, stderr?: string) => void
      ) => callback(null, '', '')
    )

    const service = createAutoEnterService({
      platform: 'darwin',
      execFile: execFile as never
    })

    await service.triggerAutoEnter('enter')

    expect(execFile).toHaveBeenCalledWith(
      'osascript',
      ['-e', 'tell application "System Events" to key code 36'],
      expect.any(Function)
    )
  })

  test('auto enter sends Command+Enter via osascript on macOS for mod-enter mode', async () => {
    const execFile = vi.fn(
      (
        _file: string,
        _args: string[],
        callback: (error: Error | null, stdout?: string, stderr?: string) => void
      ) => callback(null, '', '')
    )

    const service = createAutoEnterService({
      platform: 'darwin',
      execFile: execFile as never
    })

    await service.triggerAutoEnter('mod-enter')

    expect(execFile).toHaveBeenCalledWith(
      'osascript',
      ['-e', 'tell application "System Events" to keystroke return using command down'],
      expect.any(Function)
    )
  })

  test('auto enter sends Enter via PowerShell on Windows', async () => {
    const execFile = vi.fn(
      (
        _file: string,
        _args: string[],
        callback: (error: Error | null, stdout?: string, stderr?: string) => void
      ) => callback(null, '', '')
    )

    const service = createAutoEnterService({
      platform: 'win32',
      execFile: execFile as never
    })

    await service.triggerAutoEnter('enter')

    expect(execFile).toHaveBeenCalledWith(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        '$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys("{ENTER}")'
      ],
      expect.any(Function)
    )
  })

  test('auto enter sends Ctrl+Enter via PowerShell on Windows for mod-enter mode', async () => {
    const execFile = vi.fn(
      (
        _file: string,
        _args: string[],
        callback: (error: Error | null, stdout?: string, stderr?: string) => void
      ) => callback(null, '', '')
    )

    const service = createAutoEnterService({
      platform: 'win32',
      execFile: execFile as never
    })

    await service.triggerAutoEnter('mod-enter')

    expect(execFile).toHaveBeenCalledWith(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        '$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys("^{ENTER}")'
      ],
      expect.any(Function)
    )
  })
})
