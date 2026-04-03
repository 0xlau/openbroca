import { execFile as nodeExecFile, type ExecFileException } from 'node:child_process'

type ExecFile = (
  file: string,
  args: string[],
  callback: (error: ExecFileException | null, stdout: string, stderr: string) => void
) => void

export interface AutoEnterService {
  triggerAutoEnter: () => Promise<void>
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
      triggerAutoEnter: () =>
        runExecFile(execFile, 'osascript', ['-e', 'tell application "System Events" to key code 36'])
    }
  }

  if (platform === 'win32') {
    return {
      triggerAutoEnter: () =>
        runExecFile(execFile, 'powershell.exe', [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          '$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys("{ENTER}")'
        ])
    }
  }

  return {
    triggerAutoEnter: async () => {}
  }
}
