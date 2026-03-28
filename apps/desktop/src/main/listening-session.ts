import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { AudioCaptureSource, AudioFormat, CaptureOptions } from '@openbroca/audio-capture'
import type { ListeningSessionState } from '../shared/listening-session-state'

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
  header.writeUInt32LE(16, 16) // PCM chunk size
  header.writeUInt16LE(1, 20) // PCM format
  header.writeUInt16LE(format.channels, 22)
  header.writeUInt32LE(format.sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(format.bitDepth, 34)
  header.write('data', 36)
  header.writeUInt32LE(dataByteLength, 40)
  return header
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === 'string' && error.length > 0) {
    return error
  }

  return 'Listening session failed'
}

function isAbortLikeError(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (error instanceof Error && error.name === 'AbortError')
}

class ListeningSessionManager {
  private abortController: AbortController | null = null
  private state: ListeningSessionState = { status: 'idle' }
  private listeners = new Set<(state: ListeningSessionState) => void>()

  constructor(private captureSource: AudioCaptureSource) {}

  getState(): ListeningSessionState {
    return this.state
  }

  subscribe(listener: (state: ListeningSessionState) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  start(options?: SessionOptions): void {
    if (
      this.state.status === 'starting' ||
      this.state.status === 'listening' ||
      this.state.status === 'stopping'
    ) {
      return
    }

    this.abortController = new AbortController()
    this.setState({ status: 'starting' })
    void this.run({ ...options, signal: this.abortController.signal })
  }

  stop(): void {
    if (this.state.status === 'idle') {
      return
    }

    if (this.state.status === 'error') {
      this.abortController?.abort()
      this.abortController = null
      this.setState({ status: 'idle' })
      return
    }

    if (this.state.status === 'stopping') {
      return
    }

    this.setState({ status: 'stopping' })
    this.abortController?.abort()
  }

  private async run(opts: SessionOptions & { signal: AbortSignal }): Promise<void> {
    try {
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
      this.setState({ status: 'listening' })

      for await (const chunk of stream) {
        chunks.push(chunk)
      }

      if (chunks.length > 0) {
        const pcm = Buffer.concat(
          chunks.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength))
        )
        const wav = Buffer.concat([buildWavHeader(pcm.byteLength, format), pcm])

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const outPath = join(app.getPath('temp'), `openbroca-${timestamp}.wav`)
        writeFileSync(outPath, wav)
        console.log(`[listening-session] saved recording: ${outPath}`)
      }

      this.setState({ status: 'idle' })
    } catch (error) {
      if (isAbortLikeError(error, opts.signal)) {
        this.setState({ status: 'idle' })
        return
      }

      this.setState({
        status: 'error',
        message: normalizeErrorMessage(error)
      })
    } finally {
      if (this.abortController?.signal === opts.signal || opts.signal.aborted) {
        this.abortController = null
      }
    }
  }

  private setState(next: ListeningSessionState): void {
    this.state = next
    for (const listener of this.listeners) {
      listener(next)
    }
  }
}

export { ListeningSessionManager }
