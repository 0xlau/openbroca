import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { AudioCaptureSource, AudioFormat, CaptureOptions } from '@openbroca/audio-capture'

interface SessionOptions {
  deviceId?: number
}

function buildWavHeader(dataByteLength: number, format: AudioFormat): Buffer {
  const byteRate = (format.sampleRate * format.channels * format.bitDepth) / 8
  const blockAlign = (format.channels * format.bitDepth) / 8
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataByteLength, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)           // PCM chunk size
  header.writeUInt16LE(1, 20)            // PCM format
  header.writeUInt16LE(format.channels, 22)
  header.writeUInt32LE(format.sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(format.bitDepth, 34)
  header.write('data', 36)
  header.writeUInt32LE(dataByteLength, 40)
  return header
}

class ListeningSessionManager {
  private abortController: AbortController | null = null

  constructor(private captureSource: AudioCaptureSource) {}

  start(options?: SessionOptions): void {
    if (this.abortController) return
    this.abortController = new AbortController()
    this.run({ ...options, signal: this.abortController.signal }).catch(console.error)
  }

  stop(): void {
    this.abortController?.abort()
    this.abortController = null
  }

  private async run(opts: SessionOptions & { signal: AbortSignal }): Promise<void> {
    const captureOptions: CaptureOptions = {
      channels: 1,
      bitDepth: 16,
      signal: opts.signal
    }
    if (opts.deviceId != null) {
      captureOptions.deviceId = opts.deviceId
    }

    const format = this.captureSource.resolveFormat(captureOptions)
    const chunks: Uint8Array[] = []

    const stream = this.captureSource.capture(captureOptions)
    for await (const chunk of stream) {
      chunks.push(chunk)
    }

    if (chunks.length === 0) return

    const pcm = Buffer.concat(chunks.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength)))
    const wav = Buffer.concat([buildWavHeader(pcm.byteLength, format), pcm])

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const outPath = join(app.getPath('temp'), `openbroca-${timestamp}.wav`)
    writeFileSync(outPath, wav)
    console.log(`[listening-session] saved recording: ${outPath}`)
  }
}

export { ListeningSessionManager }
