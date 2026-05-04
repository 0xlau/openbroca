import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { OnboardingWatcher } from '../watcher'
import type { OnboardingGateSnapshot } from '../types'

function createSnapshot(overrides: Partial<OnboardingGateSnapshot> = {}): OnboardingGateSnapshot {
  return {
    platform: 'darwin',
    mode: 'first-run',
    canEnterMainWindow: false,
    permissionsOk: false,
    hasCompletedOnboarding: false,
    permissions: [
      {
        key: 'microphone',
        title: 'Microphone',
        description: 'Required to capture your voice.',
        status: 'missing'
      },
      {
        key: 'desktopControl',
        title: 'Desktop Control',
        description: 'Required to paste the final text into your current app.',
        status: 'needs-manual-step'
      }
    ],
    ...overrides
  }
}

type FakeWindow = EventEmitter & { isFocused: () => boolean }

function createFakeWindow(initialFocused = true): FakeWindow {
  const emitter = new EventEmitter() as FakeWindow
  let focused = initialFocused
  emitter.isFocused = () => focused
  ;(emitter as unknown as { __setFocused: (v: boolean) => void }).__setFocused = (v) => {
    focused = v
  }
  return emitter
}

describe('OnboardingWatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test('start with focused window ticks immediately and pushes the first snapshot', async () => {
    const snapshot = createSnapshot()
    const resolve = vi.fn().mockResolvedValue(snapshot)
    const pushSnapshot = vi.fn()
    const onMaybeAdvance = vi.fn().mockResolvedValue(snapshot)
    const watcher = new OnboardingWatcher({ resolve, pushSnapshot, onMaybeAdvance })
    const win = createFakeWindow(true)

    watcher.start(win as unknown as Electron.BrowserWindow)

    // Flush microtasks for the immediate tick without advancing timers.
    await vi.advanceTimersByTimeAsync(0)

    expect(resolve).toHaveBeenCalledTimes(1)
    expect(pushSnapshot).toHaveBeenCalledWith(snapshot)
    expect(onMaybeAdvance).toHaveBeenCalledTimes(1)
  })

  test('does not push or advance when the snapshot is identical to the previous tick', async () => {
    const snapshot = createSnapshot()
    const resolve = vi.fn().mockResolvedValue(snapshot)
    const pushSnapshot = vi.fn()
    const onMaybeAdvance = vi.fn().mockResolvedValue(snapshot)
    const watcher = new OnboardingWatcher({
      resolve,
      pushSnapshot,
      onMaybeAdvance,
      pollIntervalMs: 1000
    })
    const win = createFakeWindow(true)

    watcher.start(win as unknown as Electron.BrowserWindow)
    await vi.advanceTimersByTimeAsync(0)

    expect(pushSnapshot).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1000)

    expect(resolve).toHaveBeenCalledTimes(2)
    expect(pushSnapshot).toHaveBeenCalledTimes(1)
    expect(onMaybeAdvance).toHaveBeenCalledTimes(1)
  })

  test('pushes and advances when a subsequent snapshot differs', async () => {
    const initial = createSnapshot()
    const granted = createSnapshot({
      mode: 'none',
      canEnterMainWindow: true,
      permissionsOk: true,
      hasCompletedOnboarding: true,
      permissions: [
        {
          key: 'microphone',
          title: 'Microphone',
          description: 'Required to capture your voice.',
          status: 'granted'
        },
        {
          key: 'desktopControl',
          title: 'Desktop Control',
          description: 'Required to paste the final text into your current app.',
          status: 'granted'
        }
      ]
    })
    const resolve = vi.fn().mockResolvedValueOnce(initial).mockResolvedValue(granted)
    const pushSnapshot = vi.fn()
    const onMaybeAdvance = vi.fn().mockResolvedValue(granted)
    const watcher = new OnboardingWatcher({
      resolve,
      pushSnapshot,
      onMaybeAdvance,
      pollIntervalMs: 1000
    })
    const win = createFakeWindow(true)

    watcher.start(win as unknown as Electron.BrowserWindow)
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(1000)

    expect(pushSnapshot).toHaveBeenNthCalledWith(1, initial)
    expect(pushSnapshot).toHaveBeenNthCalledWith(2, granted)
    expect(onMaybeAdvance).toHaveBeenCalledTimes(2)
  })

  test('does not tick or start the interval when started while window is blurred', async () => {
    const snapshot = createSnapshot()
    const resolve = vi.fn().mockResolvedValue(snapshot)
    const pushSnapshot = vi.fn()
    const onMaybeAdvance = vi.fn().mockResolvedValue(snapshot)
    const watcher = new OnboardingWatcher({
      resolve,
      pushSnapshot,
      onMaybeAdvance,
      pollIntervalMs: 1000
    })
    const win = createFakeWindow(false)

    watcher.start(win as unknown as Electron.BrowserWindow)
    await vi.advanceTimersByTimeAsync(2000)

    expect(resolve).not.toHaveBeenCalled()
    expect(pushSnapshot).not.toHaveBeenCalled()
  })

  test('focus fires an immediate tick and starts the interval; blur stops the interval', async () => {
    const snapshot = createSnapshot()
    const resolve = vi.fn().mockResolvedValue(snapshot)
    const pushSnapshot = vi.fn()
    const onMaybeAdvance = vi.fn().mockResolvedValue(snapshot)
    const watcher = new OnboardingWatcher({
      resolve,
      pushSnapshot,
      onMaybeAdvance,
      pollIntervalMs: 1000
    })
    const win = createFakeWindow(false)

    watcher.start(win as unknown as Electron.BrowserWindow)
    expect(resolve).not.toHaveBeenCalled()
    ;(win as unknown as { __setFocused: (v: boolean) => void }).__setFocused(true)
    win.emit('focus')
    await vi.advanceTimersByTimeAsync(0)
    expect(resolve).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1000)
    expect(resolve).toHaveBeenCalledTimes(2)
    ;(win as unknown as { __setFocused: (v: boolean) => void }).__setFocused(false)
    win.emit('blur')
    await vi.advanceTimersByTimeAsync(5000)
    expect(resolve).toHaveBeenCalledTimes(2)
  })

  test('does not double-start the interval when focus fires twice without an intervening blur', async () => {
    const snapshot = createSnapshot()
    const resolve = vi.fn().mockResolvedValue(snapshot)
    const pushSnapshot = vi.fn()
    const onMaybeAdvance = vi.fn().mockResolvedValue(snapshot)
    const watcher = new OnboardingWatcher({
      resolve,
      pushSnapshot,
      onMaybeAdvance,
      pollIntervalMs: 1000
    })
    const win = createFakeWindow(true)

    watcher.start(win as unknown as Electron.BrowserWindow)
    await vi.advanceTimersByTimeAsync(0)

    win.emit('focus')
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(1000)

    // start: 1 tick. focus: 1 tick. interval after 1s: 1 tick. Total 3.
    expect(resolve).toHaveBeenCalledTimes(3)
  })

  test('closed event stops all future ticks', async () => {
    const snapshot = createSnapshot()
    const resolve = vi.fn().mockResolvedValue(snapshot)
    const pushSnapshot = vi.fn()
    const onMaybeAdvance = vi.fn().mockResolvedValue(snapshot)
    const watcher = new OnboardingWatcher({
      resolve,
      pushSnapshot,
      onMaybeAdvance,
      pollIntervalMs: 1000
    })
    const win = createFakeWindow(true)

    watcher.start(win as unknown as Electron.BrowserWindow)
    await vi.advanceTimersByTimeAsync(0)

    win.emit('closed')
    const callsAtClose = resolve.mock.calls.length

    await vi.advanceTimersByTimeAsync(5000)
    expect(resolve).toHaveBeenCalledTimes(callsAtClose)
  })

  test('stop() is idempotent', () => {
    const watcher = new OnboardingWatcher({
      resolve: vi.fn().mockResolvedValue(createSnapshot()),
      pushSnapshot: vi.fn(),
      onMaybeAdvance: vi.fn().mockResolvedValue(createSnapshot())
    })
    const win = createFakeWindow(true)
    watcher.start(win as unknown as Electron.BrowserWindow)
    expect(() => {
      watcher.stop()
      watcher.stop()
    }).not.toThrow()
  })

  test('does not start a second tick while a previous resolve is still pending', async () => {
    let resolveFirstTick: ((value: OnboardingGateSnapshot) => void) | undefined
    const resolve = vi.fn(() => {
      if (!resolveFirstTick) {
        return new Promise<OnboardingGateSnapshot>((r) => {
          resolveFirstTick = r
        })
      }
      return Promise.resolve(createSnapshot())
    })
    const pushSnapshot = vi.fn()
    const onMaybeAdvance = vi.fn().mockResolvedValue(createSnapshot())
    const watcher = new OnboardingWatcher({
      resolve,
      pushSnapshot,
      onMaybeAdvance,
      pollIntervalMs: 100
    })
    const win = createFakeWindow(true)

    watcher.start(win as unknown as Electron.BrowserWindow)
    await Promise.resolve()
    expect(resolve).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(500)
    expect(resolve).toHaveBeenCalledTimes(1)

    resolveFirstTick?.(createSnapshot())
    await vi.advanceTimersByTimeAsync(0)

    await vi.advanceTimersByTimeAsync(100)
    expect(resolve).toHaveBeenCalledTimes(2)
  })

  test('keeps watching after a resolve() rejection', async () => {
    const granted = createSnapshot({
      mode: 'none',
      canEnterMainWindow: true,
      permissionsOk: true,
      hasCompletedOnboarding: true
    })
    const resolve = vi
      .fn()
      .mockRejectedValueOnce(new Error('TCC blew up'))
      .mockResolvedValue(granted)
    const pushSnapshot = vi.fn()
    const onMaybeAdvance = vi.fn().mockResolvedValue(granted)
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const watcher = new OnboardingWatcher({
      resolve,
      pushSnapshot,
      onMaybeAdvance,
      pollIntervalMs: 100
    })
    const win = createFakeWindow(true)

    watcher.start(win as unknown as Electron.BrowserWindow)
    await vi.advanceTimersByTimeAsync(0)

    expect(pushSnapshot).not.toHaveBeenCalled()
    expect(consoleWarn).toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(100)
    expect(pushSnapshot).toHaveBeenCalledWith(granted)
    expect(onMaybeAdvance).toHaveBeenCalledTimes(1)
  })
})
