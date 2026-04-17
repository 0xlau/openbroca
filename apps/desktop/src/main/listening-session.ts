import type { AudioCaptureSource, CaptureOptions } from '@openbroca/audio-capture'
import type { AppIdentity } from '@openbroca/app-identity'
import {
  INITIAL_LISTENING_SESSION_BRIDGE_STATE,
  isListeningSessionBusy,
  isTargetAppPollingState,
  type ListeningSessionBridgeState,
  type ListeningSessionState
} from '../shared/listening-session-state'
import type { CapturedRecording } from './recording-types'

interface SessionOptions {
  deviceId?: number
}

interface ListeningSessionOptions {
  onRecordingComplete?: (recording: CapturedRecording, signal: AbortSignal) => Promise<void> | void
  getFrontmostAppSnapshot?: () => Promise<AppIdentity | null>
  getTargetApp?: () => Promise<AppIdentity | null>
  targetAppPollIntervalMs?: number
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

function sameAppIdentity(left: AppIdentity | null, right: AppIdentity | null): boolean {
  if (left === right) return true
  if (!left || !right) return false

  const sameStableIdentity =
    (left.id && right.id && left.id === right.id) ||
    (left.bundleId && right.bundleId && left.bundleId === right.bundleId) ||
    (left.aumid && right.aumid && left.aumid === right.aumid) ||
    (left.path && right.path && left.path === right.path)

  if (!sameStableIdentity) {
    return false
  }

  return (
    left.bundleId === right.bundleId &&
    left.aumid === right.aumid &&
    left.path === right.path &&
    left.iconDataUrl === right.iconDataUrl
  )
}

class ListeningSessionManager {
  private abortController: AbortController | null = null
  private processingAbortController: AbortController | null = null
  private processingGeneration = 0
  private state: ListeningSessionState = { status: 'idle' }
  private targetApp: AppIdentity | null = null
  private bridgeState: ListeningSessionBridgeState = INITIAL_LISTENING_SESSION_BRIDGE_STATE
  private listeners = new Set<(state: ListeningSessionBridgeState) => void>()
  private targetAppPollTimer: ReturnType<typeof setInterval> | null = null
  private targetAppPollGeneration = 0
  private targetAppRefreshGeneration: number | null = null

  constructor(
    private captureSource: AudioCaptureSource,
    private readonly options: ListeningSessionOptions = {}
  ) {}

  getState(): ListeningSessionBridgeState {
    return this.bridgeState
  }

  subscribe(listener: (state: ListeningSessionBridgeState) => void): () => void {
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
    if (isListeningSessionBusy(this.state)) {
      console.debug('[voice-debug] listening start ignored', {
        status: this.state.status
      })
      return
    }

    this.abortController = new AbortController()
    this.setSessionState({ status: 'starting' })
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
      this.setSessionState({ status: 'idle' })
      return
    }

    if (this.state.status === 'stopping' || this.state.status === 'processing') {
      return
    }

    this.setSessionState({ status: 'stopping' })
    this.abortController?.abort()
  }

  cancelProcessing(): void {
    console.debug('[voice-debug] processing cancel requested', {
      status: this.state.status
    })
    if (this.state.status !== 'processing') {
      return
    }

    this.processingGeneration += 1
    const controller = this.processingAbortController
    this.processingAbortController = null
    controller?.abort()
    this.setSessionState({ status: 'idle' })
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
      this.setSessionState({ status: 'listening' })

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
    } catch (error) {
      console.debug('[voice-debug] listening run failed', {
        aborted: opts.signal.aborted,
        error: normalizeErrorMessage(error)
      })
      if (isAbortLikeError(error, opts.signal)) {
        this.setSessionState({ status: 'idle' })
        return
      }

      this.setSessionState({
        status: 'error',
        message: normalizeErrorMessage(error)
      })
      return
    } finally {
      if (this.abortController?.signal === opts.signal || opts.signal.aborted) {
        this.abortController = null
      }
    }

    if (chunks.length === 0) {
      this.setSessionState({ status: 'idle' })
      return
    }

    const endedAt = new Date().toISOString()
    const endedAtMs = Date.now()
    const durationMs = Math.max(0, endedAtMs - startedAtMs)

    this.beginProcessing({
      format,
      chunks,
      startedAt,
      endedAt,
      durationMs,
      frontmostAppSnapshot: null
    })
  }

  private beginProcessing(recording: CapturedRecording): void {
    const generation = ++this.processingGeneration
    const controller = new AbortController()
    this.processingAbortController = controller
    this.setSessionState({ status: 'processing' })

    void this.completeRecording(recording, generation, controller)
  }

  private async completeRecording(
    recording: CapturedRecording,
    generation: number,
    controller: AbortController
  ): Promise<void> {
    let frontmostAppSnapshot: AppIdentity | null = null

    try {
      if (this.options.getFrontmostAppSnapshot) {
        try {
          frontmostAppSnapshot = await this.options.getFrontmostAppSnapshot()
        } catch (error) {
          console.debug('[voice-debug] failed to capture frontmost app snapshot', {
            error: normalizeErrorMessage(error)
          })
        }
      }

      if (generation !== this.processingGeneration || controller.signal.aborted) {
        return
      }

      console.debug('[voice-debug] dispatching completed recording', {
        chunkCount: recording.chunks.length,
        durationMs: recording.durationMs,
        frontmostAppId: frontmostAppSnapshot?.id ?? null
      })

      await this.options.onRecordingComplete?.(
        {
          ...recording,
          frontmostAppSnapshot
        },
        controller.signal
      )
    } catch (completionError) {
      console.error('[listening-session] recording completion failed', completionError)
    } finally {
      if (this.processingAbortController === controller) {
        this.processingAbortController = null
      }

      if (generation === this.processingGeneration && this.state.status === 'processing') {
        this.setSessionState({ status: 'idle' })
      }
    }
  }

  private setSessionState(next: ListeningSessionState): void {
    console.debug('[voice-debug] listening state changed', {
      from: this.state.status,
      to: next.status
    })

    this.state = next
    this.syncTargetAppPolling()
    this.publish()
  }

  private publish(): void {
    this.bridgeState = {
      state: this.state,
      targetApp: this.targetApp
    }

    for (const listener of this.listeners) {
      listener(this.bridgeState)
    }
  }

  private syncTargetAppPolling(): void {
    if (!isTargetAppPollingState(this.state) || !this.options.getTargetApp) {
      if (this.targetAppPollTimer) {
        clearInterval(this.targetAppPollTimer)
        this.targetAppPollTimer = null
      }

      this.targetAppPollGeneration += 1
      this.targetAppRefreshGeneration = null
      this.targetApp = null
      return
    }

    if (this.targetAppPollTimer) {
      return
    }

    this.targetAppPollGeneration += 1
    void this.refreshTargetApp(this.targetAppPollGeneration)
    this.targetAppPollTimer = setInterval(() => {
      void this.refreshTargetApp(this.targetAppPollGeneration)
    }, this.options.targetAppPollIntervalMs ?? 500)
  }

  private async refreshTargetApp(generation: number): Promise<void> {
    if (
      generation !== this.targetAppPollGeneration ||
      this.targetAppRefreshGeneration === generation ||
      !this.options.getTargetApp ||
      !isTargetAppPollingState(this.state)
    ) {
      return
    }

    this.targetAppRefreshGeneration = generation

    try {
      let nextTargetApp: AppIdentity | null = null

      try {
        nextTargetApp = await this.resolveTargetApp()
      } catch (error) {
        console.debug('[voice-debug] target app resolution failed', {
          error: normalizeErrorMessage(error)
        })
      }

      if (
        generation !== this.targetAppPollGeneration ||
        !isTargetAppPollingState(this.state) ||
        sameAppIdentity(this.targetApp, nextTargetApp)
      ) {
        return
      }

      this.targetApp = nextTargetApp
      this.publish()
    } finally {
      if (this.targetAppRefreshGeneration === generation) {
        this.targetAppRefreshGeneration = null
      }
    }
  }

  private async resolveTargetApp(): Promise<AppIdentity | null> {
    if (!this.options.getTargetApp) {
      return null
    }

    return (await this.options.getTargetApp()) ?? null
  }
}

export { ListeningSessionManager }
