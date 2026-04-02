import type { AudioFormat } from '@openbroca/audio-capture'

export interface CapturedRecording {
  format: AudioFormat
  chunks: Uint8Array[]
  startedAt: string
  endedAt: string
  durationMs: number
}

export interface StoredRecording {
  audioFilePath: string
  fileName: string
  byteLength: number
}
