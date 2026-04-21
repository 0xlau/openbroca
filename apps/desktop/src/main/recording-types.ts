import type { AudioFormat } from '@openbroca/audio-capture'
import type { AppIdentity } from '@openbroca/app-identity'

export interface CapturedRecording {
  format: AudioFormat
  chunks: Uint8Array[]
  startedAt: string
  endedAt: string
  durationMs: number
  frontmostAppSnapshot?: AppIdentity | null
  targetAppSnapshot?: AppIdentity | null
}

export interface StoredRecording {
  audioFilePath: string
  fileName: string
  byteLength: number
}
