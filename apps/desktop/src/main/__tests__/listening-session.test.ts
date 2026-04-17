import { describe, expect, test, vi } from 'vitest'
import type { AudioCaptureSource, CaptureOptions } from '@openbroca/audio-capture'
import type { AppIdentity } from '@openbroca/app-identity'
import type {
  ListeningSessionBridgeState,
  ListeningSessionState
} from '../../shared/listening-session-state'
import { ListeningSessionManager } from '../listening-session'

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })
  return { promise, resolve, reject }
}

class FakeCaptureSource implements AudioCaptureSource {
  readonly listDevices = vi.fn(() => [])
  readonly resolveFormat = vi.fn(() => ({
    sampleRate: 16000,
    channels: 1,
    bitDepth: 16
  }))

  readonly captureCalls: CaptureOptions[] = []
  private readonly firstRead = createDeferred<void>()
  private readonly release = createDeferred<void>()
  private readonly queuedChunks: Uint8Array[] = []
  private runtimeError: Error | null = null
  private abortWithError = false

  capture = vi.fn((options: CaptureOptions = {}) => {
    this.captureCalls.push(options)
    this.firstRead.resolve()

    return {
      [Symbol.asyncIterator]: () => ({
        next: async (): Promise<IteratorResult<Uint8Array>> => {
          await this.release.promise

          if (this.runtimeError) {
            throw this.runtimeError
          }

          const nextChunk = this.queuedChunks.shift()
          if (nextChunk) {
            return { done: false, value: nextChunk }
          }

          if (options.signal?.aborted) {
            if (this.abortWithError) {
              const error = new Error('capture aborted')
              error.name = 'AbortError'
              throw error
            }
            return { done: true, value: undefined }
          }

          return { done: true, value: undefined }
        }
      })
    } satisfies AsyncIterable<Uint8Array>
  })

  async waitForCaptureStart(): Promise<void> {
    await this.firstRead.promise
  }

  finish(): void {
    this.release.resolve()
  }

  failWith(error: Error): void {
    this.runtimeError = error
    this.release.resolve()
  }

  finishWithAbortError(): void {
    this.abortWithError = true
    this.release.resolve()
  }

  pushChunk(chunk: Uint8Array): void {
    this.queuedChunks.push(chunk)
  }
}

function expectManagerState(
  manager: ListeningSessionManager,
  state: ListeningSessionState,
  targetApp: AppIdentity | null = null
): void {
  expect(manager.getState()).toEqual({ state, targetApp } satisfies ListeningSessionBridgeState)
}

describe('ListeningSessionManager', () => {
  test('starts in idle state', () => {
    const manager = new ListeningSessionManager(new FakeCaptureSource())

    expectManagerState(manager, { status: 'idle' })
  })

  test('start transitions from idle to starting to listening', async () => {
    const captureSource = new FakeCaptureSource()
    const manager = new ListeningSessionManager(captureSource)
    const states: string[] = []

    manager.subscribe((bridge) => {
      states.push(bridge.state.status)
    })

    manager.start()

    await captureSource.waitForCaptureStart()

    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'listening' })
    })

    expect(states.slice(0, 2)).toEqual(['starting', 'listening'])

    captureSource.finish()
  })

  test('requests 16kHz mono capture with 16-bit depth', async () => {
    const captureSource = new FakeCaptureSource()
    const manager = new ListeningSessionManager(captureSource)

    manager.start()

    await captureSource.waitForCaptureStart()

    expect(captureSource.resolveFormat).toHaveBeenCalledWith(
      expect.objectContaining({
        sampleRate: 16000,
        channels: 1,
        bitDepth: 16
      })
    )
    expect(captureSource.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        sampleRate: 16000,
        channels: 1,
        bitDepth: 16
      })
    )

    captureSource.finish()
  })

  test('continues capture when the resolved sample rate is not 16kHz', async () => {
    const captureSource = new FakeCaptureSource()
    const onRecordingComplete = vi.fn().mockResolvedValue(undefined)
    captureSource.resolveFormat.mockImplementationOnce(() => ({
      sampleRate: 48000,
      channels: 1,
      bitDepth: 16
    }))
    const manager = new ListeningSessionManager(captureSource, { onRecordingComplete })

    captureSource.pushChunk(new Uint8Array([1, 2, 3, 4]))

    manager.start()

    await captureSource.waitForCaptureStart()
    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'listening' })
    })

    manager.stop()
    captureSource.finish()

    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'idle' })
    })

    await vi.waitFor(() => {
      expect(onRecordingComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          format: { sampleRate: 48000, channels: 1, bitDepth: 16 }
        }),
        expect.any(AbortSignal)
      )
    })
  })

  test('stop transitions from listening to stopping to idle', async () => {
    const captureSource = new FakeCaptureSource()
    const manager = new ListeningSessionManager(captureSource)

    manager.start()
    await captureSource.waitForCaptureStart()
    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'listening' })
    })

    manager.stop()

    expectManagerState(manager, { status: 'stopping' })

    captureSource.finish()

    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'idle' })
    })
  })

  test('keeps the session alive in processing until recording completion settles', async () => {
    const captureSource = new FakeCaptureSource()
    const completion = createDeferred<void>()
    const states: string[] = []
    const onRecordingComplete = vi.fn().mockImplementation(async (_recording, signal: AbortSignal) => {
      expect(signal.aborted).toBe(false)
      await completion.promise
    })
    const manager = new ListeningSessionManager(captureSource, { onRecordingComplete })

    manager.subscribe((bridge) => {
      states.push(bridge.state.status)
    })

    captureSource.pushChunk(new Uint8Array([1, 2, 3, 4]))

    manager.start()
    await captureSource.waitForCaptureStart()
    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'listening' })
    })

    manager.stop()
    captureSource.finish()

    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'processing' })
    })

    expect(onRecordingComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        chunks: [expect.any(Uint8Array)]
      }),
      expect.any(AbortSignal)
    )

    completion.resolve()

    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'idle' })
    })

    expect(states).toEqual(['starting', 'listening', 'stopping', 'processing', 'idle'])
  })

  test('stop still transitions into processing when capture aborts after buffered audio exists', async () => {
    const captureSource = new FakeCaptureSource()
    const completion = createDeferred<void>()
    const onRecordingComplete = vi.fn().mockImplementation(async () => {
      await completion.promise
    })
    const manager = new ListeningSessionManager(captureSource, { onRecordingComplete })

    captureSource.pushChunk(new Uint8Array([1, 2, 3, 4]))

    manager.start()
    await captureSource.waitForCaptureStart()
    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'listening' })
    })

    manager.stop()
    captureSource.finishWithAbortError()

    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'processing' })
    })

    expect(onRecordingComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        chunks: [expect.any(Uint8Array)]
      }),
      expect.any(AbortSignal)
    )

    completion.resolve()

    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'idle' })
    })
  })

  test('cancelProcessing aborts post-recording work and returns to idle', async () => {
    const captureSource = new FakeCaptureSource()
    const processingSignal = createDeferred<AbortSignal>()
    const completion = createDeferred<void>()
    const onRecordingComplete = vi.fn().mockImplementation(async (_recording, signal: AbortSignal) => {
      processingSignal.resolve(signal)
      await completion.promise
    })
    const manager = new ListeningSessionManager(captureSource, { onRecordingComplete })

    captureSource.pushChunk(new Uint8Array([1, 2, 3, 4]))

    manager.start()
    await captureSource.waitForCaptureStart()
    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'listening' })
    })

    manager.stop()
    captureSource.finish()

    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'processing' })
    })

    const signal = await processingSignal.promise

    manager.cancelProcessing()

    await vi.waitFor(() => {
      expect(signal.aborted).toBe(true)
      expectManagerState(manager, { status: 'idle' })
    })

    completion.resolve()
  })

  test('cancelProcessing does not report abort-like completion failures as errors', async () => {
    const captureSource = new FakeCaptureSource()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const onRecordingComplete = vi.fn().mockImplementation(
      async (_recording, signal: AbortSignal) =>
        await new Promise<void>((resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              const error = new Error('processing canceled')
              error.name = 'AbortError'
              reject(error)
            },
            { once: true }
          )
        })
    )
    const manager = new ListeningSessionManager(captureSource, { onRecordingComplete })

    captureSource.pushChunk(new Uint8Array([1, 2, 3, 4]))

    manager.start()
    await captureSource.waitForCaptureStart()
    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'listening' })
    })

    manager.stop()
    captureSource.finish()

    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'processing' })
    })

    manager.cancelProcessing()

    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'idle' })
    })

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(errorSpy).not.toHaveBeenCalled()

    errorSpy.mockRestore()
  })

  test('late completion from a canceled processing run cannot reset a newer processing run', async () => {
    const captureSource = new FakeCaptureSource()
    const completionA = createDeferred<void>()
    const completionB = createDeferred<void>()
    const onRecordingComplete = vi
      .fn()
      .mockImplementationOnce(async () => {
        await completionA.promise
      })
      .mockImplementationOnce(async () => {
        await completionB.promise
      })
    const manager = new ListeningSessionManager(captureSource, { onRecordingComplete })

    captureSource.pushChunk(new Uint8Array([1, 2, 3, 4]))
    manager.start()
    await captureSource.waitForCaptureStart()
    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'listening' })
    })

    manager.stop()
    captureSource.finish()

    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'processing' })
    })

    manager.cancelProcessing()

    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'idle' })
    })

    captureSource.pushChunk(new Uint8Array([5, 6, 7, 8]))
    manager.start()
    await vi.waitFor(() => {
      expect(captureSource.capture).toHaveBeenCalledTimes(2)
    })
    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'listening' })
    })

    manager.stop()
    captureSource.finish()

    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'processing' })
    })

    completionA.resolve()

    await new Promise((resolve) => setTimeout(resolve, 0))

    expectManagerState(manager, { status: 'processing' })

    completionB.resolve()

    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'idle' })
    })
  })

  test('repeated start while processing is ignored', async () => {
    const captureSource = new FakeCaptureSource()
    const completion = createDeferred<void>()
    const onRecordingComplete = vi.fn().mockImplementation(async () => {
      await completion.promise
    })
    const manager = new ListeningSessionManager(captureSource, { onRecordingComplete })

    captureSource.pushChunk(new Uint8Array([1, 2, 3, 4]))

    manager.start()
    await captureSource.waitForCaptureStart()
    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'listening' })
    })

    manager.stop()
    captureSource.finish()

    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'processing' })
    })

    manager.start()

    expect(captureSource.capture).toHaveBeenCalledTimes(1)
    expectManagerState(manager, { status: 'processing' })

    completion.resolve()

    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'idle' })
    })
  })

  test('repeated start while active is ignored', async () => {
    const captureSource = new FakeCaptureSource()
    const manager = new ListeningSessionManager(captureSource)

    manager.start()
    manager.start()

    await captureSource.waitForCaptureStart()
    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'listening' })
    })

    expect(captureSource.capture).toHaveBeenCalledTimes(1)

    captureSource.finish()
  })

  test('repeated stop while idle is a no-op', () => {
    const manager = new ListeningSessionManager(new FakeCaptureSource())

    manager.stop()
    manager.stop()

    expectManagerState(manager, { status: 'idle' })
  })

  test('setup failures transition to error', async () => {
    const captureSource = new FakeCaptureSource()
    captureSource.resolveFormat.mockImplementationOnce(() => {
      throw new Error('device unavailable')
    })
    const manager = new ListeningSessionManager(captureSource)

    manager.start()

    await vi.waitFor(() => {
      expectManagerState(manager, {
        status: 'error',
        message: 'device unavailable'
      })
    })
  })

  test('runtime failures transition to error', async () => {
    const captureSource = new FakeCaptureSource()
    const manager = new ListeningSessionManager(captureSource)

    manager.start()
    await captureSource.waitForCaptureStart()
    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'listening' })
    })

    captureSource.failWith(new Error('stream failed'))

    await vi.waitFor(() => {
      expectManagerState(manager, {
        status: 'error',
        message: 'stream failed'
      })
    })
  })

  test('abort-driven shutdown returns to idle instead of error', async () => {
    const captureSource = new FakeCaptureSource()
    const manager = new ListeningSessionManager(captureSource)
    const states: string[] = []

    manager.subscribe((bridge) => {
      states.push(bridge.state.status)
    })

    manager.start()
    await captureSource.waitForCaptureStart()
    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'listening' })
    })

    manager.stop()
    captureSource.finish()

    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'idle' })
    })

    expect(states).toContain('stopping')
    expect(states).not.toContain('error')
  })

  test('emits a captured recording payload instead of writing temp wavs', async () => {
    const captureSource = new FakeCaptureSource()
    const onRecordingComplete = vi.fn().mockResolvedValue(undefined)
    const manager = new ListeningSessionManager(captureSource, { onRecordingComplete })

    captureSource.pushChunk(new Uint8Array([1, 2, 3, 4]))

    manager.start()
    await captureSource.waitForCaptureStart()
    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'listening' })
    })

    manager.stop()
    captureSource.finish()

    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'idle' })
    })

    await vi.waitFor(() => {
      expect(onRecordingComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          chunks: [expect.any(Uint8Array)],
          durationMs: expect.any(Number),
          format: { sampleRate: 16000, channels: 1, bitDepth: 16 }
        }),
        expect.any(AbortSignal)
      )
    })
  })

  test('captures frontmost app snapshot when recording completes', async () => {
    const captureSource = new FakeCaptureSource()
    const onRecordingComplete = vi.fn().mockResolvedValue(undefined)
    const getFrontmostAppSnapshot = vi.fn().mockResolvedValue({
      id: 'com.recorded.app',
      displayName: 'Recorded App',
      platform: 'macos',
      bundleId: 'com.recorded.bundle',
      source: 'detected'
    })
    const manager = new ListeningSessionManager(captureSource, {
      onRecordingComplete,
      getFrontmostAppSnapshot
    } as never)

    captureSource.pushChunk(new Uint8Array([1, 2, 3, 4]))

    manager.start()
    await captureSource.waitForCaptureStart()
    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'listening' })
    })

    manager.stop()
    captureSource.finish()

    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'idle' })
    })

    await vi.waitFor(() => {
      expect(onRecordingComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          frontmostAppSnapshot: expect.objectContaining({
            id: 'com.recorded.app',
            bundleId: 'com.recorded.bundle'
          })
        }),
        expect.any(AbortSignal)
      )
    })
  })

  test('emits debug logs for the capture lifecycle', async () => {
    const captureSource = new FakeCaptureSource()
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
    const manager = new ListeningSessionManager(captureSource)

    captureSource.pushChunk(new Uint8Array([1, 2, 3, 4]))

    manager.start({ deviceId: 7 })
    await captureSource.waitForCaptureStart()
    manager.stop()
    captureSource.finish()

    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'idle' })
    })

    expect(debugSpy).toHaveBeenCalledWith(
      '[voice-debug] listening start requested',
      expect.objectContaining({ deviceId: 7, status: 'idle' })
    )
    expect(debugSpy).toHaveBeenCalledWith(
      '[voice-debug] capture format resolved',
      expect.objectContaining({ sampleRate: 16000, channels: 1, bitDepth: 16 })
    )
    expect(debugSpy).toHaveBeenCalledWith(
      '[voice-debug] first audio chunk received',
      expect.objectContaining({ byteLength: 4 })
    )
    expect(debugSpy).toHaveBeenCalledWith(
      '[voice-debug] listening state changed',
      expect.objectContaining({ from: 'listening', to: 'stopping' })
    )

    debugSpy.mockRestore()
  })

  test('polls target app while the session is busy, including processing, and clears it when idle', async () => {
    const captureSource = new FakeCaptureSource()
    const completion = createDeferred<void>()
    const onRecordingComplete = vi.fn().mockImplementation(async () => {
      await completion.promise
    })
    const getTargetApp = vi.fn().mockResolvedValue({
      id: 'cursor',
      displayName: 'Cursor',
      platform: 'macos',
      bundleId: 'com.todesktop.230313mzl4w4u92',
      path: '/Applications/Cursor.app',
      source: 'detected',
      iconDataUrl: 'data:image/png;base64,cursor'
    } satisfies AppIdentity)
    const manager = new ListeningSessionManager(captureSource, {
      onRecordingComplete,
      getTargetApp,
      targetAppPollIntervalMs: 5
    })

    captureSource.pushChunk(new Uint8Array([1, 2, 3, 4]))

    manager.start()
    await captureSource.waitForCaptureStart()

    await vi.waitFor(() => {
      expect(manager.getState().targetApp).toEqual(
        expect.objectContaining({
          id: 'cursor',
          iconDataUrl: 'data:image/png;base64,cursor'
        })
      )
    })

    const callsBeforeStop = getTargetApp.mock.calls.length

    manager.stop()
    captureSource.finish()

    await vi.waitFor(() => {
      expectManagerState(
        manager,
        { status: 'processing' },
        expect.objectContaining({
          id: 'cursor',
          iconDataUrl: 'data:image/png;base64,cursor'
        }) as AppIdentity
      )
    })

    await vi.waitFor(() => {
      expect(getTargetApp.mock.calls.length).toBeGreaterThan(callsBeforeStop)
    })

    completion.resolve()

    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'idle' })
    })

    expect(getTargetApp).toHaveBeenCalled()
  })

  test('does not rebroadcast unchanged target app identities', async () => {
    const captureSource = new FakeCaptureSource()
    const getTargetApp = vi.fn().mockResolvedValue({
      id: 'cursor',
      displayName: 'Cursor',
      platform: 'macos',
      bundleId: 'com.todesktop.230313mzl4w4u92',
      path: '/Applications/Cursor.app',
      source: 'detected',
      iconDataUrl: 'data:image/png;base64,cursor'
    } satisfies AppIdentity)
    const manager = new ListeningSessionManager(captureSource, {
      getTargetApp,
      targetAppPollIntervalMs: 5
    })
    const listener = vi.fn()

    manager.subscribe(listener)
    manager.start()
    await captureSource.waitForCaptureStart()

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          targetApp: expect.objectContaining({ id: 'cursor' })
        })
      )
    })

    const callsWithCursor = listener.mock.calls.filter(([bridge]) => bridge.targetApp?.id === 'cursor').length
    await new Promise((resolve) => setTimeout(resolve, 25))
    const nextCallsWithCursor = listener.mock.calls.filter(([bridge]) => bridge.targetApp?.id === 'cursor').length

    expect(nextCallsWithCursor).toBe(callsWithCursor)

    manager.stop()
    captureSource.finish()

    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'idle' })
    })
  })

  test('rebroadcasts when the same target app later gains an icon', async () => {
    const captureSource = new FakeCaptureSource()
    const getTargetApp = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'cursor',
        displayName: 'Cursor',
        platform: 'macos',
        bundleId: 'com.todesktop.230313mzl4w4u92',
        path: '/Applications/Cursor.app',
        source: 'detected'
      } satisfies AppIdentity)
      .mockResolvedValue({
        id: 'cursor',
        displayName: 'Cursor',
        platform: 'macos',
        bundleId: 'com.todesktop.230313mzl4w4u92',
        path: '/Applications/Cursor.app',
        source: 'detected',
        iconDataUrl: 'data:image/png;base64,cursor'
      } satisfies AppIdentity)
    const manager = new ListeningSessionManager(captureSource, {
      getTargetApp,
      targetAppPollIntervalMs: 5
    })

    manager.start()
    await captureSource.waitForCaptureStart()

    await vi.waitFor(() => {
      expect(manager.getState().targetApp).toEqual(
        expect.objectContaining({
          id: 'cursor',
          iconDataUrl: 'data:image/png;base64,cursor'
        })
      )
    })

    manager.stop()
    captureSource.finish()

    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'idle' })
    })
  })

  test('does not rebroadcast the same app when only displayName changes', async () => {
    const captureSource = new FakeCaptureSource()
    const getTargetApp = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'cursor',
        displayName: 'Cursor - file A',
        platform: 'windows',
        path: 'C:\\Users\\liupeiqiang\\AppData\\Local\\Programs\\Cursor\\Cursor.exe',
        source: 'detected',
        iconDataUrl: 'data:image/png;base64,cursor'
      } satisfies AppIdentity)
      .mockResolvedValue({
        id: 'cursor',
        displayName: 'Cursor - file B',
        platform: 'windows',
        path: 'C:\\Users\\liupeiqiang\\AppData\\Local\\Programs\\Cursor\\Cursor.exe',
        source: 'detected',
        iconDataUrl: 'data:image/png;base64,cursor'
      } satisfies AppIdentity)
    const manager = new ListeningSessionManager(captureSource, {
      getTargetApp,
      targetAppPollIntervalMs: 5
    })
    const listener = vi.fn()

    manager.subscribe(listener)
    manager.start()
    await captureSource.waitForCaptureStart()

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          targetApp: expect.objectContaining({ id: 'cursor' })
        })
      )
    })

    const callsWithCursor = listener.mock.calls.filter(([bridge]) => bridge.targetApp?.id === 'cursor').length
    await new Promise((resolve) => setTimeout(resolve, 25))
    const nextCallsWithCursor = listener.mock.calls.filter(([bridge]) => bridge.targetApp?.id === 'cursor').length

    expect(nextCallsWithCursor).toBe(callsWithCursor)

    manager.stop()
    captureSource.finish()

    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'idle' })
    })
  })

  test('logs callback failures without blocking session shutdown', async () => {
    const captureSource = new FakeCaptureSource()
    const error = new Error('storage failed')
    const onRecordingComplete = vi.fn().mockRejectedValue(error)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const manager = new ListeningSessionManager(captureSource, { onRecordingComplete })

    captureSource.pushChunk(new Uint8Array([1, 2, 3, 4]))

    manager.start()
    await captureSource.waitForCaptureStart()
    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'listening' })
    })

    manager.stop()
    captureSource.finish()

    await vi.waitFor(() => {
      expectManagerState(manager, { status: 'idle' })
    })

    await vi.waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[listening-session\] recording completion failed/),
        error
      )
    })

    errorSpy.mockRestore()
  })
})
