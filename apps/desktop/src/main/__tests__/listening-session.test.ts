import { describe, expect, test, vi } from 'vitest'
import type { AudioCaptureSource, CaptureOptions } from '@openbroca/audio-capture'
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

  pushChunk(chunk: Uint8Array): void {
    this.queuedChunks.push(chunk)
  }
}

describe('ListeningSessionManager', () => {
  test('starts in idle state', () => {
    const manager = new ListeningSessionManager(new FakeCaptureSource())

    expect(manager.getState()).toEqual({ status: 'idle' })
  })

  test('start transitions from idle to starting to listening', async () => {
    const captureSource = new FakeCaptureSource()
    const manager = new ListeningSessionManager(captureSource)
    const states: string[] = []

    manager.subscribe((state) => {
      states.push(state.status)
    })

    manager.start()

    await captureSource.waitForCaptureStart()

    await vi.waitFor(() => {
      expect(manager.getState()).toEqual({ status: 'listening' })
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
      expect(manager.getState()).toEqual({ status: 'listening' })
    })

    manager.stop()
    captureSource.finish()

    await vi.waitFor(() => {
      expect(manager.getState()).toEqual({ status: 'idle' })
    })

    await vi.waitFor(() => {
      expect(onRecordingComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          format: { sampleRate: 48000, channels: 1, bitDepth: 16 }
        })
      )
    })
  })

  test('stop transitions from listening to stopping to idle', async () => {
    const captureSource = new FakeCaptureSource()
    const manager = new ListeningSessionManager(captureSource)

    manager.start()
    await captureSource.waitForCaptureStart()
    await vi.waitFor(() => {
      expect(manager.getState()).toEqual({ status: 'listening' })
    })

    manager.stop()

    expect(manager.getState()).toEqual({ status: 'stopping' })

    captureSource.finish()

    await vi.waitFor(() => {
      expect(manager.getState()).toEqual({ status: 'idle' })
    })
  })

  test('repeated start while active is ignored', async () => {
    const captureSource = new FakeCaptureSource()
    const manager = new ListeningSessionManager(captureSource)

    manager.start()
    manager.start()

    await captureSource.waitForCaptureStart()
    await vi.waitFor(() => {
      expect(manager.getState()).toEqual({ status: 'listening' })
    })

    expect(captureSource.capture).toHaveBeenCalledTimes(1)

    captureSource.finish()
  })

  test('repeated stop while idle is a no-op', () => {
    const manager = new ListeningSessionManager(new FakeCaptureSource())

    manager.stop()
    manager.stop()

    expect(manager.getState()).toEqual({ status: 'idle' })
  })

  test('setup failures transition to error', async () => {
    const captureSource = new FakeCaptureSource()
    captureSource.resolveFormat.mockImplementationOnce(() => {
      throw new Error('device unavailable')
    })
    const manager = new ListeningSessionManager(captureSource)

    manager.start()

    await vi.waitFor(() => {
      expect(manager.getState()).toEqual({
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
      expect(manager.getState()).toEqual({ status: 'listening' })
    })

    captureSource.failWith(new Error('stream failed'))

    await vi.waitFor(() => {
      expect(manager.getState()).toEqual({
        status: 'error',
        message: 'stream failed'
      })
    })
  })

  test('abort-driven shutdown returns to idle instead of error', async () => {
    const captureSource = new FakeCaptureSource()
    const manager = new ListeningSessionManager(captureSource)
    const states: string[] = []

    manager.subscribe((state) => {
      states.push(state.status)
    })

    manager.start()
    await captureSource.waitForCaptureStart()
    await vi.waitFor(() => {
      expect(manager.getState()).toEqual({ status: 'listening' })
    })

    manager.stop()
    captureSource.finish()

    await vi.waitFor(() => {
      expect(manager.getState()).toEqual({ status: 'idle' })
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
      expect(manager.getState()).toEqual({ status: 'listening' })
    })

    manager.stop()
    captureSource.finish()

    await vi.waitFor(() => {
      expect(manager.getState()).toEqual({ status: 'idle' })
    })

    await vi.waitFor(() => {
      expect(onRecordingComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          chunks: [expect.any(Uint8Array)],
          durationMs: expect.any(Number),
          format: { sampleRate: 16000, channels: 1, bitDepth: 16 }
        })
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
      expect(manager.getState()).toEqual({ status: 'idle' })
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
      expect(manager.getState()).toEqual({ status: 'listening' })
    })

    manager.stop()
    captureSource.finish()

    await vi.waitFor(() => {
      expect(manager.getState()).toEqual({ status: 'idle' })
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
