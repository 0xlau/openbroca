# Permission Auto-Detect Design

**Date:** 2026-05-04

## Goal

After the user grants microphone or accessibility access in macOS System Settings, the permission onboarding window currently does not refresh — the user sees stale state and the **Continue** button stays disabled until they trigger a manual action that calls `permissions:refresh`.

This design adds an automatic detection mechanism that picks up TCC changes while the onboarding window is open and pushes a fresh snapshot to the renderer, so the UI updates without user input and `refreshPermissionGateAndMaybeAdvance` runs as soon as everything is granted (which automatically opens the main window and closes the onboarding window).

## Scope

This design covers:

- `apps/desktop` only, macOS only
- automatic detection of microphone and accessibility (`desktopControl`) permission changes
- main → renderer push of permission snapshots via IPC
- renderer subscription to those pushes
- detection lifecycle bound to the onboarding window only

This design does **not** cover:

- watching permissions while the main window is open (no runtime ejection back to onboarding if the user revokes access)
- a generic system-state polling framework
- Windows permission flows
- new permission types beyond microphone and `desktopControl`
- changes to the existing manual button click flow (it stays as a fallback)

## Confirmed Product Decisions

- Approach is **focus-triggered refresh + slow polling while focused** (not pure polling, not focus-only).
- Watcher only runs while the **onboarding window** exists. Closing or destroying the window stops it permanently.
- Runtime permission revocation (after the user has reached the main window) is intentionally out of scope — next launch will re-gate naturally.

## Architecture

A new `PermissionWatcher` lives in `apps/desktop/src/main/permission-gate/watcher.ts`. It is constructed once per onboarding-window instance with its dependencies injected, and its lifetime is bound to that window.

```ts
// permission-gate/watcher.ts
export type PermissionWatcherDeps = {
  resolve: () => Promise<PermissionGateSnapshot>
  pushSnapshot: (snapshot: PermissionGateSnapshot) => void
  onMaybeAdvance: () => Promise<PermissionGateSnapshot>
  pollIntervalMs?: number // default 1500
}

export class PermissionWatcher {
  constructor(deps: PermissionWatcherDeps)
  start(window: BrowserWindow): void
  stop(): void
}
```

Internal state:

- `lastSnapshotJson: string | null` — used to diff snapshots; only changed snapshots are pushed.
- `pollIntervalId: NodeJS.Timeout | null` — present only while the bound window is focused.
- Listeners for `focus`, `blur`, and `closed` on the bound window.

Behavior:

- `start(window)`:
  - bind focus/blur/closed listeners
  - if the window is currently focused, run `tick()` immediately and start the poll interval
- on `focus`: run `tick()` immediately, then start the poll interval (idempotent — does nothing if already running)
- on `blur`: clear the poll interval (idempotent)
- on `closed` or `stop()`: clear interval, remove all listeners. After `stop()` the watcher is dead — calling `start()` again is not supported (a new watcher is created per window).
- `tick()`:
  - call `deps.resolve()` to get a fresh snapshot
  - if `JSON.stringify(snapshot) === lastSnapshotJson`, do nothing
  - otherwise: update `lastSnapshotJson`, call `deps.pushSnapshot(snapshot)`, then call `deps.onMaybeAdvance()` (which may open the main window and close onboarding — that closure naturally triggers our `closed` listener and stops the watcher)

`tick()` calls are serialized: if a tick is already in flight when the next interval fires, the new tick is skipped (a simple `isTicking` boolean guard) so we never have overlapping resolves. Resolves are very cheap today (sync `systemPreferences` reads wrapped in `Promise.resolve`) but the guard prevents pathological behavior if that ever changes.

Errors thrown by `resolve()` or `onMaybeAdvance()` are caught inside `tick()`, logged via `console.warn`, and otherwise ignored — the watcher keeps running for the next interval. Failing to detect a change is acceptable; killing the watcher and stranding the user on stale UI is not.

## Data Flow

```
window focus / interval tick
  → PermissionWatcher.tick()
    → resolvePermissionGateSnapshot()
      → diff vs lastSnapshotJson
        → unchanged: drop
        → changed:
            → pushSnapshot(snapshot) → window.webContents.send('permissions:state-changed', snapshot)
            → onMaybeAdvance()       → existing refreshPermissionGateAndMaybeAdvance()
                                      → if canEnterMainWindow: opens main window, closes onboarding
```

The watcher is the only producer of automatic `permissions:state-changed` pushes. Manual button-click paths (`requestMicrophone`, `openDesktopControlSettings`, `refresh`) keep their existing return-value pattern; they do not push events. This keeps the click path's tested behavior intact.

## Wiring

`apps/desktop/src/main/index.ts`, inside `ensurePermissionOnboardingWindow()`:

```ts
function ensurePermissionOnboardingWindow(): void {
  const existing = windowManager.getPermissionOnboarding()
  if (existing && !existing.isDestroyed()) return

  const win = windowManager.createPermissionOnboarding()

  const watcher = new PermissionWatcher({
    resolve: resolvePermissionGateSnapshot,
    pushSnapshot: (snapshot) => {
      if (!win.isDestroyed()) {
        win.webContents.send('permissions:state-changed', snapshot)
      }
    },
    onMaybeAdvance: refreshPermissionGateAndMaybeAdvance
  })
  watcher.start(win)

  win.on('closed', () => {
    watcher.stop()
    if (!windowManager.getMain()) {
      app.quit()
    }
  })
}
```

No other call sites change. `refreshPermissionGateAndMaybeAdvance` is reused as-is.

## Renderer Subscription

### Preload

Add to `apps/desktop/src/preload/index.ts` under the `permissions` object:

```ts
onStateChange: (callback: (snapshot: PermissionGateSnapshot) => void) => {
  const handler = (_event: Electron.IpcRendererEvent, snapshot: PermissionGateSnapshot) =>
    callback(snapshot)
  ipcRenderer.on('permissions:state-changed', handler)
  return () => {
    ipcRenderer.removeListener('permissions:state-changed', handler)
  }
}
```

Mirror this in `apps/desktop/src/preload/index.d.ts`.

This follows the existing pattern used by `listeningSession.onStateChange` and `notifyWindow.onStateChange`.

### Onboarding component

In `apps/desktop/src/renderer/src/pages/onboarding/permissions.tsx`, add a second `useEffect`:

```ts
React.useEffect(() => {
  const unsubscribe = window.api.permissions.onStateChange((next) => {
    setSnapshot(next)
    setErrorMessage(null)
  })
  return unsubscribe
}, [])
```

When `canEnterMainWindow` becomes true, the main process closes the onboarding window during the same `refreshPermissionGateAndMaybeAdvance` call. The renderer may receive a `setSnapshot` immediately before unmount; this is harmless — React drops the state update on the unmounted tree.

## Testing

### `permission-gate/__tests__/watcher.test.ts` (new)

Use Vitest fake timers and a fake `BrowserWindow`-shaped EventEmitter to drive lifecycle. Verify:

1. `start(window)` with an initially-focused window runs `tick()` once and starts the poll interval.
2. `start(window)` with an initially-blurred window does **not** tick or start the interval.
3. On `focus`, `tick()` runs once and the interval starts; the interval is not double-started if `focus` fires twice without `blur` in between.
4. On `blur`, the interval stops (timers advance, no further ticks).
5. Identical snapshots on consecutive ticks do not call `pushSnapshot` or `onMaybeAdvance`.
6. A snapshot that differs from `lastSnapshotJson` calls `pushSnapshot(snapshot)` and then `onMaybeAdvance()`.
7. On `closed`, the watcher stops: no more ticks fire even after timer advancement, and listeners are removed.
8. `stop()` is idempotent.
9. Concurrent ticks are serialized — when `resolve()` is pending, a second timer fire does not invoke `resolve()` again.
10. A throwing `resolve()` does not crash the watcher: a subsequent successful tick still pushes the new snapshot.

### `permissions.test.tsx`

Add one case: simulate the preload `onStateChange` callback firing with an updated snapshot and assert the UI reflects it (e.g., a previously `needs-manual-step` card now reads `Granted`, and `Continue` becomes enabled).

The existing manual-click-path tests stay untouched.

### `permission-gate.test.ts`

No changes — the resolver functions are unchanged.

## Non-Goals (YAGNI)

- No watcher for the main window. Permission revocation while in main does not gate the user back to onboarding.
- No EventEmitter / pub-sub bus. The watcher pushes directly to its bound window via `webContents.send`.
- No abstraction for "watch any system state on focus". Single-purpose class.
- No exponential backoff or adaptive interval. Fixed 1500ms when focused is plenty given the cost of a TCC read.
- No new tRPC procedure. The push channel uses raw IPC, matching `listening-session:state-changed` and `notify-window:state-changed`.
