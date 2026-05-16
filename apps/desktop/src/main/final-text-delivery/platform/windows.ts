import { execFile as nodeExecFile, type ExecFileException } from 'node:child_process'
import type { ClipboardPasteAttemptResult } from '../service'

type ExecFile = (
  file: string,
  args: string[],
  callback: (error: ExecFileException | null, stdout: string, stderr: string) => void
) => void

export function createWindowsPasteText(execFile: ExecFile = nodeExecFile as ExecFile) {
  return async (text: string): Promise<ClipboardPasteAttemptResult> => {
    void text

    try {
      await new Promise<void>((resolve, reject) => {
        execFile(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            '$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys("^v")'
          ],
          (error) => (error ? reject(error) : resolve())
        )
      })

      return {
        ok: true,
        method: 'paste'
      }
    } catch {
      return {
        ok: false,
        reason: 'command-failed'
      }
    }
  }
}
