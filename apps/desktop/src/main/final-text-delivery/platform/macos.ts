import { execFile as nodeExecFile, type ExecFileException } from 'node:child_process'
import type { ClipboardPasteAttemptResult } from '../service'

type ExecFile = (
  file: string,
  args: string[],
  callback: (error: ExecFileException | null, stdout: string, stderr: string) => void
) => void

function sendGenericPaste(execFile: ExecFile): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    execFile(
      'osascript',
      ['-e', 'tell application "System Events" to keystroke "v" using command down'],
      (error) => (error ? reject(error) : resolve())
    )
  })
}

export function createMacPasteText(execFile: ExecFile = nodeExecFile as ExecFile) {
  return async (_text: string): Promise<ClipboardPasteAttemptResult> => {
    try {
      await sendGenericPaste(execFile)

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
