import { describe, expect, test, vi } from 'vitest'
import type { AudioCaptureSource } from '@openbroca/audio-capture'
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

  readonly captureCalls: Array<{ signal?: AbortSignal }> = []
  private readonly firstRead = createDeferred<void>()
  private readonly release = createDeferred<void>()
  private runtimeError: Error | null = null

  capture = vi.fn((options = {}) => {
    this.captureCalls.push({ signal: options.signal })
    this.firstRead.resolve()

    return {
      [Symbol.asyncIterator]: () => ({
        next: async (): Promise<IteratorResult<Uint8Array>> => {
          await this.release.promise

          if (this.runtimeError) {
            throw this.runtimeError
          }

          if (options.signal?.aborted) {
            const error = new Error('aborted')
            error.name = 'AbortError'
            throw error
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
})
