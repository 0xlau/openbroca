import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { CapturedRecording, StoredRecording } from './recording-types'

function buildWavHeader(dataByteLength: number, format: CapturedRecording['format']): Buffer {
  const byteRate = (format.sampleRate * format.channels * format.bitDepth) / 8
  const blockAlign = (format.channels * format.bitDepth) / 8
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataByteLength, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(format.channels, 22)
  header.writeUInt32LE(format.sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(format.bitDepth, 34)
  header.write('data', 36)
  header.writeUInt32LE(dataByteLength, 40)
  return header
}

export class RecordingStorage {
  constructor(
    private readonly deps: {
      mkdir?: typeof mkdir
      writeFile?: typeof writeFile
      now?: () => Date
    } = {}
  ) {}

  async save(recording: CapturedRecording): Promise<StoredRecording> {
    const recordingsDir = join(app.getPath('userData'), 'recordings')
    const timestamp = (this.deps.now?.() ?? new Date()).toISOString().replace(/[:.]/g, '-')
    const fileName = `openbroca-${timestamp}.wav`
    const audioFilePath = join(recordingsDir, fileName)
    const pcm = Buffer.concat(recording.chunks.map((chunk) => Buffer.from(chunk)))
    const wav = Buffer.concat([buildWavHeader(pcm.byteLength, recording.format), pcm])

    await (this.deps.mkdir ?? mkdir)(recordingsDir, { recursive: true })
    await (this.deps.writeFile ?? writeFile)(audioFilePath, wav)

    return { audioFilePath, fileName, byteLength: wav.byteLength }
  }
}
