import type { AudioCaptureSource, CaptureOptions } from '@openbroca/audio-capture'
import type { ListeningSessionState } from '../shared/listening-session-state'
import type { CapturedRecording } from './recording-types'

interface SessionOptions {
  deviceId?: number
}

interface ListeningSessionOptions {
  onRecordingComplete?: (recording: CapturedRecording) => Promise<void> | void
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

  constructor(
    private captureSource: AudioCaptureSource,
    private readonly options: ListeningSessionOptions = {}
  ) {}

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
    console.debug('[voice-debug] listening start requested', {
      status: this.state.status,
      deviceId: options?.deviceId ?? null
    })
    if (
      this.state.status === 'starting' ||
      this.state.status === 'listening' ||
      this.state.status === 'stopping'
    ) {
      console.debug('[voice-debug] listening start ignored', {
        status: this.state.status
      })
      return
    }

    this.abortController = new AbortController()
    this.setState({ status: 'starting' })
    void this.run({ ...options, signal: this.abortController.signal })
  }

  stop(): void {
    console.debug('[voice-debug] listening stop requested', {
      status: this.state.status
    })
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
    let chunks: Uint8Array[] = []
    let format: ReturnType<AudioCaptureSource['resolveFormat']>
    let startedAt = ''
    let startedAtMs = 0
    let didLogFirstChunk = false

    try {
      const captureOptions: CaptureOptions = {
        sampleRate: 16000,
        channels: 1,
        bitDepth: 16,
        signal: opts.signal
      }
      if (opts.deviceId != null) {
        captureOptions.deviceId = opts.deviceId
      }

      format = this.captureSource.resolveFormat(captureOptions)
      console.debug('[voice-debug] capture format resolved', format)
      chunks = []
      startedAt = new Date().toISOString()
      startedAtMs = Date.now()

      const stream = this.captureSource.capture(captureOptions)
      this.setState({ status: 'listening' })

      for await (const chunk of stream) {
        if (!didLogFirstChunk) {
          didLogFirstChunk = true
          console.debug('[voice-debug] first audio chunk received', {
            byteLength: chunk.byteLength
          })
        }
        chunks.push(chunk)
      }

      console.debug('[voice-debug] capture stream ended', {
        chunkCount: chunks.length
      })
      this.setState({ status: 'idle' })
    } catch (error) {
      console.debug('[voice-debug] listening run failed', {
        aborted: opts.signal.aborted,
        error: normalizeErrorMessage(error)
      })
      if (isAbortLikeError(error, opts.signal)) {
        this.setState({ status: 'idle' })
        return
      }

      this.setState({
        status: 'error',
        message: normalizeErrorMessage(error)
      })
      return
    } finally {
      if (this.abortController?.signal === opts.signal || opts.signal.aborted) {
        this.abortController = null
      }
    }

    if (chunks.length > 0) {
      const endedAt = new Date().toISOString()
      const endedAtMs = Date.now()
      const durationMs = Math.max(0, endedAtMs - startedAtMs)
      console.debug('[voice-debug] dispatching completed recording', {
        chunkCount: chunks.length,
        durationMs
      })

      void Promise.resolve(
        this.options.onRecordingComplete?.({
          format,
          chunks,
          startedAt,
          endedAt,
          durationMs
        })
      ).catch((completionError) => {
        console.error('[listening-session] recording completion failed', completionError)
      })
    }
  }

  private setState(next: ListeningSessionState): void {
    console.debug('[voice-debug] listening state changed', {
      from: this.state.status,
      to: next.status
    })
    this.state = next
    for (const listener of this.listeners) {
      listener(next)
    }
  }
}

export { ListeningSessionManager }
