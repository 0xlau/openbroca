import { execFile as nodeExecFile, type ExecFileException } from 'node:child_process'
import type { AutoEnterMode } from '../../shared/instructions'

type ExecFile = (
  file: string,
  args: string[],
  callback: (error: ExecFileException | null, stdout: string, stderr: string) => void
) => void

export interface AutoEnterService {
  triggerAutoEnter: (mode: AutoEnterMode) => Promise<void>
}

interface CreateAutoEnterServiceDeps {
  platform?: NodeJS.Platform
  execFile?: ExecFile
}

function runExecFile(execFile: ExecFile, file: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(file, args, (error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}

export function createAutoEnterService(deps: CreateAutoEnterServiceDeps = {}): AutoEnterService {
  const platform = deps.platform ?? process.platform
  const execFile = deps.execFile ?? (nodeExecFile as ExecFile)

  if (platform === 'darwin') {
    return {
      triggerAutoEnter: (mode) => {
        if (mode === 'off') {
          return Promise.resolve()
        }

        const command =
          mode === 'mod-enter'
            ? 'tell application "System Events" to keystroke return using command down'
            : 'tell application "System Events" to key code 36'

        return runExecFile(execFile, 'osascript', ['-e', command])
      }
    }
  }

  if (platform === 'win32') {
    return {
      triggerAutoEnter: (mode) => {
        if (mode === 'off') {
          return Promise.resolve()
        }

        const keys = mode === 'mod-enter' ? '^{ENTER}' : '{ENTER}'
        return runExecFile(execFile, 'powershell.exe', [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          `$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys("${keys}")`
        ])
      }
    }
  }

  return {
    triggerAutoEnter: async () => {}
  }
}
