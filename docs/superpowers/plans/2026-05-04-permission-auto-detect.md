# Permission Auto-Detect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically detect macOS microphone / accessibility permission changes while the onboarding window is open, push fresh snapshots to the renderer, and let `refreshPermissionGateAndMaybeAdvance` open the main window without user input.

**Architecture:** A `PermissionWatcher` class lives in `permission-gate/`, bound to the onboarding `BrowserWindow`. It listens for `focus`/`blur`/`closed`, runs an immediate `tick()` on focus, and runs a 1500 ms interval while the window is focused. Each tick re-resolves the permission snapshot, JSON-diffs it against the last one, and on change calls a `pushSnapshot` callback (which `webContents.send`s `permissions:state-changed`) plus `refreshPermissionGateAndMaybeAdvance`. The renderer subscribes via a new `window.api.permissions.onStateChange` bridge.

**Tech Stack:** Electron 39, TypeScript, Vitest, Testing Library, React 19.

**Reference spec:** `docs/superpowers/specs/2026-05-04-permission-auto-detect-design.md`

---

## File Structure

### New Files

- `apps/desktop/src/main/permission-gate/watcher.ts`
  Defines `PermissionWatcher` class and `PermissionWatcherDeps` type. One responsibility: drive periodic + focus-triggered re-resolution of the permission snapshot for one window's lifetime.
- `apps/desktop/src/main/permission-gate/__tests__/watcher.test.ts`
  Unit tests for the watcher lifecycle, diff suppression, error tolerance, and tick serialization.

### Modified Files

- `apps/desktop/src/main/index.ts`
  In `ensurePermissionOnboardingWindow()`, construct and `start()` a `PermissionWatcher`, and call `watcher.stop()` from the existing `closed` handler.
- `apps/desktop/src/preload/index.ts`
  Add `permissions.onStateChange(callback)` returning an unsubscribe function.
- `apps/desktop/src/preload/index.d.ts`
  Declare the `onStateChange` signature on `window.api.permissions`.
- `apps/desktop/src/preload/__tests__/index.test.ts`
  Verify the new `onStateChange` bridge wires to `ipcRenderer.on('permissions:state-changed', …)` and returns an unsubscribe that removes the listener.
- `apps/desktop/src/renderer/src/pages/onboarding/permissions.tsx`
  Add a `useEffect` that subscribes to `window.api.permissions.onStateChange` and calls `setSnapshot(next)` + `setErrorMessage(null)`.
- `apps/desktop/src/renderer/src/pages/onboarding/__tests__/permissions.test.tsx`
  Add a test that the onboarding view re-renders when an `onStateChange` callback fires with an updated snapshot.

---

## Task 1: PermissionWatcher — type and skeleton

**Files:**
- Create: `apps/desktop/src/main/permission-gate/watcher.ts`
- Test: `apps/desktop/src/main/permission-gate/__tests__/watcher.test.ts`

- [ ] **Step 1: Write the failing test (skeleton + first behavior)**

Create `apps/desktop/src/main/permission-gate/__tests__/watcher.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { PermissionWatcher } from '../watcher'
import type { PermissionGateSnapshot } from '../types'

function createSnapshot(
  overrides: Partial<PermissionGateSnapshot> = {}
): PermissionGateSnapshot {
  return {
    platform: 'darwin',
    shouldGate: true,
    canEnterMainWindow: false,
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
  // expose a setter for tests
  ;(emitter as unknown as { __setFocused: (v: boolean) => void }).__setFocused = (v) => {
    focused = v
  }
  return emitter
}

describe('PermissionWatcher', () => {
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
    const watcher = new PermissionWatcher({ resolve, pushSnapshot, onMaybeAdvance })
    const win = createFakeWindow(true)

    watcher.start(win as unknown as Electron.BrowserWindow)

    // let the immediate tick's microtask run
    await vi.runOnlyPendingTimersAsync()

    expect(resolve).toHaveBeenCalledTimes(1)
    expect(pushSnapshot).toHaveBeenCalledWith(snapshot)
    expect(onMaybeAdvance).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter desktop test apps/desktop/src/main/permission-gate/__tests__/watcher.test.ts`
Expected: FAIL — `Cannot find module '../watcher'`.

- [ ] **Step 3: Write the watcher implementation**

Create `apps/desktop/src/main/permission-gate/watcher.ts`:

```ts
import type { BrowserWindow } from 'electron'
import type { PermissionGateSnapshot } from './types'

export type PermissionWatcherDeps = {
  resolve: () => Promise<PermissionGateSnapshot>
  pushSnapshot: (snapshot: PermissionGateSnapshot) => void
  onMaybeAdvance: () => Promise<PermissionGateSnapshot>
  pollIntervalMs?: number
}

const DEFAULT_POLL_INTERVAL_MS = 1500

export class PermissionWatcher {
  private readonly deps: PermissionWatcherDeps
  private readonly pollIntervalMs: number
  private window: BrowserWindow | null = null
  private pollIntervalId: NodeJS.Timeout | null = null
  private lastSnapshotJson: string | null = null
  private isTicking = false
  private stopped = false

  private readonly handleFocus = () => this.startPolling()
  private readonly handleBlur = () => this.stopPolling()
  private readonly handleClosed = () => this.stop()

  constructor(deps: PermissionWatcherDeps) {
    this.deps = deps
    this.pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
  }

  start(window: BrowserWindow): void {
    if (this.stopped || this.window) {
      return
    }

    this.window = window
    window.on('focus', this.handleFocus)
    window.on('blur', this.handleBlur)
    window.on('closed', this.handleClosed)

    if (window.isFocused()) {
      this.startPolling()
    }
  }

  stop(): void {
    if (this.stopped) {
      return
    }
    this.stopped = true
    this.stopPolling()

    const window = this.window
    this.window = null
    if (!window) {
      return
    }

    window.removeListener('focus', this.handleFocus)
    window.removeListener('blur', this.handleBlur)
    window.removeListener('closed', this.handleClosed)
  }

  private startPolling(): void {
    if (this.stopped) {
      return
    }
    void this.tick()
    if (this.pollIntervalId) {
      return
    }
    this.pollIntervalId = setInterval(() => {
      void this.tick()
    }, this.pollIntervalMs)
  }

  private stopPolling(): void {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId)
      this.pollIntervalId = null
    }
  }

  private async tick(): Promise<void> {
    if (this.stopped || this.isTicking) {
      return
    }
    this.isTicking = true
    try {
      const snapshot = await this.deps.resolve()
      const json = JSON.stringify(snapshot)
      if (json === this.lastSnapshotJson) {
        return
      }
      this.lastSnapshotJson = json
      this.deps.pushSnapshot(snapshot)
      await this.deps.onMaybeAdvance()
    } catch (error) {
      console.warn('[PermissionWatcher] tick failed', error)
    } finally {
      this.isTicking = false
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter desktop test apps/desktop/src/main/permission-gate/__tests__/watcher.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/permission-gate/watcher.ts \
        apps/desktop/src/main/permission-gate/__tests__/watcher.test.ts
git commit -m "feat(desktop): add PermissionWatcher skeleton with focus-triggered tick"
```

---

## Task 2: Diff suppression

**Files:**
- Modify: `apps/desktop/src/main/permission-gate/__tests__/watcher.test.ts`

- [ ] **Step 1: Write the failing test**

Append to the `describe('PermissionWatcher', …)` block:

```ts
test('does not push or advance when the snapshot is identical to the previous tick', async () => {
  const snapshot = createSnapshot()
  const resolve = vi.fn().mockResolvedValue(snapshot)
  const pushSnapshot = vi.fn()
  const onMaybeAdvance = vi.fn().mockResolvedValue(snapshot)
  const watcher = new PermissionWatcher({
    resolve,
    pushSnapshot,
    onMaybeAdvance,
    pollIntervalMs: 1000
  })
  const win = createFakeWindow(true)

  watcher.start(win as unknown as Electron.BrowserWindow)
  await vi.runOnlyPendingTimersAsync()

  // First tick already pushed once
  expect(pushSnapshot).toHaveBeenCalledTimes(1)

  // Advance the timer to fire the next interval tick
  await vi.advanceTimersByTimeAsync(1000)

  expect(resolve).toHaveBeenCalledTimes(2)
  expect(pushSnapshot).toHaveBeenCalledTimes(1)
  expect(onMaybeAdvance).toHaveBeenCalledTimes(1)
})

test('pushes and advances when a subsequent snapshot differs', async () => {
  const initial = createSnapshot()
  const granted = createSnapshot({
    canEnterMainWindow: true,
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
  const resolve = vi
    .fn()
    .mockResolvedValueOnce(initial)
    .mockResolvedValue(granted)
  const pushSnapshot = vi.fn()
  const onMaybeAdvance = vi.fn().mockResolvedValue(granted)
  const watcher = new PermissionWatcher({
    resolve,
    pushSnapshot,
    onMaybeAdvance,
    pollIntervalMs: 1000
  })
  const win = createFakeWindow(true)

  watcher.start(win as unknown as Electron.BrowserWindow)
  await vi.runOnlyPendingTimersAsync()
  await vi.advanceTimersByTimeAsync(1000)

  expect(pushSnapshot).toHaveBeenNthCalledWith(1, initial)
  expect(pushSnapshot).toHaveBeenNthCalledWith(2, granted)
  expect(onMaybeAdvance).toHaveBeenCalledTimes(2)
})
```

- [ ] **Step 2: Run test to verify it passes (already implemented)**

Run: `pnpm --filter desktop test apps/desktop/src/main/permission-gate/__tests__/watcher.test.ts`
Expected: PASS — Task 1's implementation already covers diff suppression.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/main/permission-gate/__tests__/watcher.test.ts
git commit -m "test(desktop): cover PermissionWatcher diff suppression"
```

---

## Task 3: Focus / blur / closed lifecycle

**Files:**
- Modify: `apps/desktop/src/main/permission-gate/__tests__/watcher.test.ts`

- [ ] **Step 1: Write the failing tests**

Append:

```ts
test('does not tick or start the interval when started while window is blurred', async () => {
  const snapshot = createSnapshot()
  const resolve = vi.fn().mockResolvedValue(snapshot)
  const pushSnapshot = vi.fn()
  const onMaybeAdvance = vi.fn().mockResolvedValue(snapshot)
  const watcher = new PermissionWatcher({
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
  const watcher = new PermissionWatcher({
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
  await vi.runOnlyPendingTimersAsync()
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
  const watcher = new PermissionWatcher({
    resolve,
    pushSnapshot,
    onMaybeAdvance,
    pollIntervalMs: 1000
  })
  const win = createFakeWindow(true)

  watcher.start(win as unknown as Electron.BrowserWindow)
  await vi.runOnlyPendingTimersAsync()

  win.emit('focus')
  await vi.runOnlyPendingTimersAsync()
  await vi.advanceTimersByTimeAsync(1000)

  // start: 1 tick. focus: 1 tick. interval after 1s: 1 tick. Total 3.
  expect(resolve).toHaveBeenCalledTimes(3)
})

test('closed event stops all future ticks', async () => {
  const snapshot = createSnapshot()
  const resolve = vi.fn().mockResolvedValue(snapshot)
  const pushSnapshot = vi.fn()
  const onMaybeAdvance = vi.fn().mockResolvedValue(snapshot)
  const watcher = new PermissionWatcher({
    resolve,
    pushSnapshot,
    onMaybeAdvance,
    pollIntervalMs: 1000
  })
  const win = createFakeWindow(true)

  watcher.start(win as unknown as Electron.BrowserWindow)
  await vi.runOnlyPendingTimersAsync()

  win.emit('closed')
  const callsAtClose = resolve.mock.calls.length

  await vi.advanceTimersByTimeAsync(5000)
  expect(resolve).toHaveBeenCalledTimes(callsAtClose)
})

test('stop() is idempotent', () => {
  const watcher = new PermissionWatcher({
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
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `pnpm --filter desktop test apps/desktop/src/main/permission-gate/__tests__/watcher.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/main/permission-gate/__tests__/watcher.test.ts
git commit -m "test(desktop): cover PermissionWatcher focus/blur/closed lifecycle"
```

---

## Task 4: Tick serialization and error tolerance

**Files:**
- Modify: `apps/desktop/src/main/permission-gate/__tests__/watcher.test.ts`

- [ ] **Step 1: Write the failing tests**

Append:

```ts
test('does not start a second tick while a previous resolve is still pending', async () => {
  let resolveFirstTick: ((value: PermissionGateSnapshot) => void) | undefined
  const resolve = vi.fn(() => {
    if (!resolveFirstTick) {
      return new Promise<PermissionGateSnapshot>((r) => {
        resolveFirstTick = r
      })
    }
    return Promise.resolve(createSnapshot())
  })
  const pushSnapshot = vi.fn()
  const onMaybeAdvance = vi.fn().mockResolvedValue(createSnapshot())
  const watcher = new PermissionWatcher({
    resolve,
    pushSnapshot,
    onMaybeAdvance,
    pollIntervalMs: 100
  })
  const win = createFakeWindow(true)

  watcher.start(win as unknown as Electron.BrowserWindow)
  // Let the immediate tick's resolve() promise enter the pending state.
  await Promise.resolve()
  expect(resolve).toHaveBeenCalledTimes(1)

  // Advance through several would-be intervals while resolve() is still pending.
  await vi.advanceTimersByTimeAsync(500)
  expect(resolve).toHaveBeenCalledTimes(1)

  // Now release the first tick and let microtasks settle.
  resolveFirstTick?.(createSnapshot())
  await vi.advanceTimersByTimeAsync(0)

  // The next interval fire should resume polling.
  await vi.advanceTimersByTimeAsync(100)
  expect(resolve).toHaveBeenCalledTimes(2)
})

test('keeps watching after a resolve() rejection', async () => {
  const granted = createSnapshot({ canEnterMainWindow: true })
  const resolve = vi
    .fn()
    .mockRejectedValueOnce(new Error('TCC blew up'))
    .mockResolvedValue(granted)
  const pushSnapshot = vi.fn()
  const onMaybeAdvance = vi.fn().mockResolvedValue(granted)
  const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

  const watcher = new PermissionWatcher({
    resolve,
    pushSnapshot,
    onMaybeAdvance,
    pollIntervalMs: 100
  })
  const win = createFakeWindow(true)

  watcher.start(win as unknown as Electron.BrowserWindow)
  await vi.runOnlyPendingTimersAsync()

  expect(pushSnapshot).not.toHaveBeenCalled()
  expect(consoleWarn).toHaveBeenCalled()

  await vi.advanceTimersByTimeAsync(100)
  expect(pushSnapshot).toHaveBeenCalledWith(granted)
  expect(onMaybeAdvance).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `pnpm --filter desktop test apps/desktop/src/main/permission-gate/__tests__/watcher.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/main/permission-gate/__tests__/watcher.test.ts
git commit -m "test(desktop): cover PermissionWatcher serialization and error tolerance"
```

---

## Task 5: Wire the preload bridge for `permissions.onStateChange`

**Files:**
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/preload/index.d.ts`
- Modify: `apps/desktop/src/preload/__tests__/index.test.ts`

- [ ] **Step 1: Write the failing test**

In `apps/desktop/src/preload/__tests__/index.test.ts`, extend the `getExposedApi()` return type to include the new method, and add a new `describe` block at the end of the file:

In `getExposedApi()`, add `permissions.onStateChange` to the returned shape:

```ts
permissions: {
  getSnapshot: () => Promise<PermissionGateSnapshot>
  requestMicrophone: () => Promise<PermissionGateSnapshot>
  openDesktopControlSettings: () => Promise<PermissionGateSnapshot>
  refresh: () => Promise<PermissionGateSnapshot>
  quitApp: () => Promise<void>
  onStateChange: (
    callback: (snapshot: PermissionGateSnapshot) => void
  ) => () => void
}
```

And append:

```ts
describe('preload permissions bridge', () => {
  afterEach(() => {
    vi.resetModules()
    invoke.mockReset()
    on.mockReset()
    removeListener.mockReset()
    exposeInMainWorld.mockReset()
  })

  test('onStateChange registers ipcRenderer listener and returns unsubscribe', async () => {
    enableContextIsolation()
    await import('../index')
    const api = getExposedApi()

    const callback = vi.fn()
    const unsubscribe = api.permissions.onStateChange(callback)

    expect(on).toHaveBeenCalledTimes(1)
    expect(on.mock.calls[0]?.[0]).toBe('permissions:state-changed')

    const handler = on.mock.calls[0]?.[1] as (
      event: unknown,
      snapshot: PermissionGateSnapshot
    ) => void
    const fakeSnapshot = {
      platform: 'darwin',
      shouldGate: true,
      canEnterMainWindow: false,
      permissions: []
    } as PermissionGateSnapshot
    handler({}, fakeSnapshot)
    expect(callback).toHaveBeenCalledWith(fakeSnapshot)

    unsubscribe()
    expect(removeListener).toHaveBeenCalledWith('permissions:state-changed', handler)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter desktop test apps/desktop/src/preload/__tests__/index.test.ts`
Expected: FAIL — `onStateChange` is not a function.

- [ ] **Step 3: Add the bridge in preload**

Modify `apps/desktop/src/preload/index.ts`. Inside the `permissions` block, after `quitApp`:

```ts
permissions: {
  getSnapshot: () =>
    ipcRenderer.invoke('permissions:get-snapshot') as Promise<PermissionGateSnapshot>,
  requestMicrophone: () =>
    ipcRenderer.invoke('permissions:request-microphone') as Promise<PermissionGateSnapshot>,
  openDesktopControlSettings: () =>
    ipcRenderer.invoke('permissions:open-desktop-control-settings') as Promise<PermissionGateSnapshot>,
  refresh: () => ipcRenderer.invoke('permissions:refresh') as Promise<PermissionGateSnapshot>,
  quitApp: () => ipcRenderer.invoke('permissions:quit-app') as Promise<void>,
  onStateChange: (callback: (snapshot: PermissionGateSnapshot) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: PermissionGateSnapshot) =>
      callback(snapshot)
    ipcRenderer.on('permissions:state-changed', handler)
    return () => {
      ipcRenderer.removeListener('permissions:state-changed', handler)
    }
  }
},
```

- [ ] **Step 4: Add the type in preload index.d.ts**

Modify `apps/desktop/src/preload/index.d.ts`. Inside `permissions`:

```ts
permissions: {
  getSnapshot: () => Promise<PermissionGateSnapshot>
  requestMicrophone: () => Promise<PermissionGateSnapshot>
  openDesktopControlSettings: () => Promise<PermissionGateSnapshot>
  refresh: () => Promise<PermissionGateSnapshot>
  quitApp: () => Promise<void>
  onStateChange: (
    callback: (snapshot: PermissionGateSnapshot) => void
  ) => () => void
}
```

- [ ] **Step 5: Run tests + typecheck to verify both pass**

Run:
```
pnpm --filter desktop test apps/desktop/src/preload/__tests__/index.test.ts
pnpm --filter desktop typecheck
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/preload/index.ts \
        apps/desktop/src/preload/index.d.ts \
        apps/desktop/src/preload/__tests__/index.test.ts
git commit -m "feat(desktop): expose permissions.onStateChange via preload"
```

---

## Task 6: Wire the watcher in main process

**Files:**
- Modify: `apps/desktop/src/main/index.ts`

- [ ] **Step 1: Add the import**

In `apps/desktop/src/main/index.ts`, near the existing `permission-gate/service` import (around line 19-23), add:

```ts
import { PermissionWatcher } from './permission-gate/watcher'
```

- [ ] **Step 2: Modify `ensurePermissionOnboardingWindow()`**

Replace the existing function body with:

```ts
function ensurePermissionOnboardingWindow(): void {
  const existingWindow = windowManager.getPermissionOnboarding()
  if (existingWindow && !existingWindow.isDestroyed()) {
    return
  }

  const onboardingWindow = windowManager.createPermissionOnboarding()

  const watcher = new PermissionWatcher({
    resolve: resolvePermissionGateSnapshot,
    pushSnapshot: (snapshot) => {
      if (!onboardingWindow.isDestroyed()) {
        onboardingWindow.webContents.send('permissions:state-changed', snapshot)
      }
    },
    onMaybeAdvance: refreshPermissionGateAndMaybeAdvance
  })
  watcher.start(onboardingWindow)

  onboardingWindow.on('closed', () => {
    watcher.stop()
    if (!windowManager.getMain()) {
      app.quit()
    }
  })
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter desktop typecheck`
Expected: PASS.

- [ ] **Step 4: Run all desktop tests to confirm no regression**

Run: `pnpm --filter desktop test`
Expected: PASS (all existing tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/index.ts
git commit -m "feat(desktop): start PermissionWatcher with onboarding window"
```

---

## Task 7: Renderer subscribes to onStateChange

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/onboarding/permissions.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/onboarding/__tests__/permissions.test.tsx`

- [ ] **Step 1: Write the failing test**

Modify `renderPage()` in `permissions.test.tsx` so callers can capture the registered `onStateChange` callback. Update the `window.api = { … }` block to include an `onStateChange` mock:

```ts
let onStateChangeCallback: ((snapshot: PermissionGateSnapshot) => void) | null = null
const onStateChange = vi.fn(
  (callback: (snapshot: PermissionGateSnapshot) => void) => {
    onStateChangeCallback = callback
    return () => {
      onStateChangeCallback = null
    }
  }
)

window.api = {
  ...window.api,
  permissions: {
    getSnapshot,
    requestMicrophone,
    openDesktopControlSettings,
    refresh,
    quitApp,
    onStateChange
  }
}
```

And return `triggerStateChange` from `renderPage()`:

```ts
return {
  getSnapshot,
  requestMicrophone,
  openDesktopControlSettings,
  refresh,
  triggerStateChange: (snapshot: PermissionGateSnapshot) => {
    onStateChangeCallback?.(snapshot)
  }
}
```

Update the import line at the top of the file from:

```ts
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
```

to:

```ts
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
```

Then add a new test inside the `describe('PermissionOnboarding', …)` block:

```ts
test('updates the UI when the main process pushes a permission state change', async () => {
  const { triggerStateChange } = await renderPage()

  // Initially both cards are not granted, Continue is disabled
  expect(
    (screen.getByRole('button', { name: 'Continue to OpenBroca' }) as HTMLButtonElement).disabled
  ).toBe(true)

  const granted = createSnapshot({
    canEnterMainWindow: false,
    permissions: [
      createPermission({ key: 'microphone', status: 'granted' }),
      createPermission({ key: 'desktopControl', status: 'needs-manual-step' })
    ]
  })

  await act(async () => {
    triggerStateChange(granted)
  })

  // The microphone card flips to "Granted"
  const microphoneCard = (await screen.findAllByTestId('permission-card')).find((card) =>
    within(card).queryByText('Microphone Access')
  )
  expect(microphoneCard).toBeTruthy()
  const grantButton = within(microphoneCard as HTMLElement).getByRole('button') as HTMLButtonElement
  expect(grantButton.textContent).toContain('Granted')
  expect(grantButton.disabled).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter desktop test apps/desktop/src/renderer/src/pages/onboarding/__tests__/permissions.test.tsx`
Expected: FAIL — `onStateChange` is not invoked, snapshot does not update.

- [ ] **Step 3: Add the subscription in the component**

Modify `apps/desktop/src/renderer/src/pages/onboarding/permissions.tsx`. Below the existing initial-load `useEffect` (around line 166), add:

```ts
React.useEffect(() => {
  const unsubscribe = window.api.permissions.onStateChange((next) => {
    setSnapshot(next)
    setErrorMessage(null)
  })
  return unsubscribe
}, [])
```

- [ ] **Step 4: Run tests + typecheck**

Run:
```
pnpm --filter desktop test apps/desktop/src/renderer/src/pages/onboarding/__tests__/permissions.test.tsx
pnpm --filter desktop typecheck
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/pages/onboarding/permissions.tsx \
        apps/desktop/src/renderer/src/pages/onboarding/__tests__/permissions.test.tsx
git commit -m "feat(desktop): subscribe onboarding UI to permission state pushes"
```

---

## Task 8: End-to-end smoke and final verification

**Files:**
- (verification only)

- [ ] **Step 1: Run full lint, typecheck, and tests**

```
pnpm --filter desktop lint
pnpm --filter desktop typecheck
pnpm --filter desktop test
```
Expected: PASS for all three.

- [ ] **Step 2: Manual smoke (macOS only — skip on other platforms)**

Run `pnpm --filter desktop dev`. With both microphone and accessibility currently denied:

1. Open the onboarding window, click **Grant Access** on Accessibility — System Settings → Privacy & Security opens.
2. Toggle Openbroca on.
3. Switch back to the onboarding window (Cmd+Tab) **without** clicking any in-app button.
4. The Accessibility card should flip to **Granted** within ~1.5 seconds.
5. Repeat for Microphone (use a fresh denied state). Once both are granted, the onboarding window should close and the main window should open automatically.

- [ ] **Step 3: Final commit (chore: nothing to commit — plan is complete)**

If lint/typecheck reveal a small fix you missed, commit it now under `chore(desktop): finalize permission auto-detect`. Otherwise nothing to do.

---

## Self-Review Notes (resolved)

- Spec coverage: every spec section has a task — watcher class (Tasks 1-4), wiring (Task 6), preload bridge (Task 5), renderer subscription (Task 7).
- The `pollIntervalMs` deps option matches across tests and implementation.
- Method names: `start`, `stop`, `tick`, `startPolling`, `stopPolling` are consistent throughout.
- The IPC channel name `permissions:state-changed` is used identically in `pushSnapshot`, the preload bridge, and the preload test.
- `console.warn` for tick errors — matches the spec's "log via `console.warn`" requirement (test in Task 4).
