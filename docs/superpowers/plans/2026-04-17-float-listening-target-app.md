# Float Listening Target App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a left-side circular app icon in the floating listening UI by resolving the app that owns the current editable focus, silently falling back to the frontmost app, and hiding the icon entirely when neither app nor icon can be resolved.

**Architecture:** Keep platform-specific focused-input detection in the Electron main process, normalize the detected owner into the existing `AppIdentity` shape, and reuse `AppIdentityService` for icon hydration. Extend the listening-session bridge to publish `{ state, targetApp }`, poll only while the session is active, and keep the React float page presentation-only.

**Tech Stack:** TypeScript, Electron, React, Zustand, Vitest, Testing Library, `osascript` on macOS, PowerShell UI Automation on Windows

---

## File Map

### Create

- `apps/desktop/src/main/focused-input/service.ts` — main-process service that resolves focused-input owner and falls back to the frontmost app
- `apps/desktop/src/main/focused-input/platform/macos.ts` — macOS-focused editable-control resolver via accessibility script bridge
- `apps/desktop/src/main/focused-input/platform/windows.ts` — Windows-focused editable-control resolver via PowerShell UI Automation
- `apps/desktop/src/main/__tests__/focused-input-service.test.ts` — service tests for success and fallback behavior
- `docs/superpowers/plans/2026-04-17-float-listening-target-app.md` — this plan

### Modify

- `apps/desktop/src/shared/listening-session-state.ts` — add renderer-safe bridge state that includes `targetApp`
- `apps/desktop/src/main/app-identity/service.ts` — expose icon hydration for arbitrary detected apps
- `apps/desktop/src/main/__tests__/app-identity-service.test.ts` — cover the new hydration entry point
- `apps/desktop/src/main/listening-session.ts` — poll `targetApp` while active and broadcast combined bridge state
- `apps/desktop/src/main/__tests__/listening-session.test.ts` — cover `targetApp` polling lifecycle and deduped broadcasts
- `apps/desktop/src/main/index.ts` — wire the focused-input service into the listening session manager
- `apps/desktop/src/preload/index.ts` — expose the widened bridge payload
- `apps/desktop/src/preload/index.d.ts` — type the widened preload API
- `apps/desktop/src/renderer/src/stores/listening-session-store.ts` — store bridge state with `targetApp`
- `apps/desktop/src/renderer/src/stores/__tests__/listening-session-store.test.ts` — verify store initialization and bridge updates
- `apps/desktop/src/renderer/src/pages/float/float-listening.tsx` — render the left-side circular app icon when an icon exists
- `apps/desktop/src/renderer/src/pages/float/__tests__/float-listening.test.tsx` — cover icon rendering and waveform behavior

### Keep Behavior Stable

- Shortcut-driven recording start and stop behavior stays unchanged
- Post-recording `frontmostAppSnapshot` capture still uses the existing frontmost app path
- No permission prompt or warning UI is introduced
- No placeholder icon circle appears when `targetApp` is absent or unhydrated

## Task 1: Add the shared bridge contract and reusable app hydration hook

**Files:**
- Modify: `apps/desktop/src/shared/listening-session-state.ts`
- Modify: `apps/desktop/src/main/app-identity/service.ts`
- Modify: `apps/desktop/src/main/__tests__/app-identity-service.test.ts`

- [ ] **Step 1: Add the failing hydration test for arbitrary detected apps**

Extend `apps/desktop/src/main/__tests__/app-identity-service.test.ts` with:

```ts
test('hydrates icons for arbitrary detected apps', async () => {
  const service = new AppIdentityService({
    listApps: vi.fn().mockResolvedValue([]),
    getFrontmostApp: vi.fn().mockResolvedValue(null),
    resolveIconDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,focused')
  })

  await expect(
    service.hydrateApp({
      id: 'com.todesktop.230313mzl4w4u92',
      displayName: 'Cursor',
      platform: 'macos',
      bundleId: 'com.todesktop.230313mzl4w4u92',
      path: '/Applications/Cursor.app',
      source: 'detected'
    })
  ).resolves.toEqual(
    expect.objectContaining({
      iconDataUrl: 'data:image/png;base64,focused'
    })
  )
})
```

- [ ] **Step 2: Run the focused app-identity test and confirm it fails**

Run: `pnpm --dir apps/desktop exec vitest run src/main/__tests__/app-identity-service.test.ts`
Expected: FAIL because `hydrateApp()` does not exist yet.

- [ ] **Step 3: Add a reusable hydration method to `AppIdentityService`**

Update `apps/desktop/src/main/app-identity/service.ts`:

```ts
export class AppIdentityService {
  // existing constructor and helpers stay in place

  async hydrateApp(item: AppIdentity | null): Promise<AppIdentity | null> {
    if (!item) {
      return null
    }

    return {
      ...item,
      iconDataUrl: await this.resolveAppIcon(item)
    }
  }

  async getFrontmostApp(): Promise<AppIdentity | null> {
    return this.hydrateApp(await this.deps.getFrontmostApp())
  }
}
```

Keep `listApps()` using the same internal `resolveAppIcon()` path so there is only one icon hydration code path in the service.

- [ ] **Step 4: Add the shared listening-session bridge type**

Update `apps/desktop/src/shared/listening-session-state.ts` to keep the existing union and add:

```ts
import type { AppIdentity } from '@openbroca/app-identity'

export type ListeningSessionBridgeState = {
  state: ListeningSessionState
  targetApp: AppIdentity | null
}

export const INITIAL_LISTENING_SESSION_BRIDGE_STATE: ListeningSessionBridgeState = {
  state: { status: 'idle' },
  targetApp: null
}

export function isTargetAppPollingState(state: ListeningSessionState): boolean {
  return state.status === 'starting' || state.status === 'listening' || state.status === 'stopping'
}
```

Keep the existing `isListeningSessionActive()` helper unchanged for waveform activation.

- [ ] **Step 5: Re-run the app-identity test suite**

Run: `pnpm --dir apps/desktop exec vitest run src/main/__tests__/app-identity-service.test.ts`
Expected: PASS with the new `hydrateApp()` coverage.

- [ ] **Step 6: Commit the shared contract groundwork**

```bash
git add apps/desktop/src/shared/listening-session-state.ts apps/desktop/src/main/app-identity/service.ts apps/desktop/src/main/__tests__/app-identity-service.test.ts
git commit -m "feat: add listening session target app contract"
```

## Task 2: Implement the cross-platform focused-input service with soft-failure fallback

**Files:**
- Create: `apps/desktop/src/main/focused-input/service.ts`
- Create: `apps/desktop/src/main/focused-input/platform/macos.ts`
- Create: `apps/desktop/src/main/focused-input/platform/windows.ts`
- Create: `apps/desktop/src/main/__tests__/focused-input-service.test.ts`

- [ ] **Step 1: Write the failing service tests for focused-input fallback rules**

Create `apps/desktop/src/main/__tests__/focused-input-service.test.ts` with:

```ts
import { describe, expect, test, vi } from 'vitest'
import { FocusedInputAppService } from '../focused-input/service'

describe('FocusedInputAppService', () => {
  test('returns the focused editable app when platform resolution succeeds', async () => {
    const service = new FocusedInputAppService({
      resolveFocusedInputApp: vi.fn().mockResolvedValue({
        displayName: 'Cursor',
        platform: 'macos',
        bundleId: 'com.todesktop.230313mzl4w4u92',
        path: '/Applications/Cursor.app',
        source: 'detected'
      }),
      hydrateApp: vi.fn(async (app) => app && { ...app, iconDataUrl: 'data:image/png;base64,focused' }),
      getFrontmostApp: vi.fn().mockResolvedValue({
        id: 'frontmost',
        displayName: 'Arc',
        platform: 'macos',
        bundleId: 'company.thebrowser.Browser',
        path: '/Applications/Arc.app',
        source: 'detected',
        iconDataUrl: 'data:image/png;base64,front'
      })
    })

    await expect(service.getFocusedInputApp()).resolves.toEqual(
      expect.objectContaining({
        displayName: 'Cursor',
        iconDataUrl: 'data:image/png;base64,focused'
      })
    )
  })

  test('falls back to frontmost app when focused-input resolution returns null', async () => {
    const frontmost = {
      id: 'frontmost',
      displayName: 'Arc',
      platform: 'macos',
      bundleId: 'company.thebrowser.Browser',
      path: '/Applications/Arc.app',
      source: 'detected',
      iconDataUrl: 'data:image/png;base64,front'
    } as const

    const service = new FocusedInputAppService({
      resolveFocusedInputApp: vi.fn().mockResolvedValue(null),
      hydrateApp: vi.fn(async (app) => app),
      getFrontmostApp: vi.fn().mockResolvedValue(frontmost)
    })

    await expect(service.getFocusedInputApp()).resolves.toEqual(frontmost)
  })

  test('falls back to frontmost app when focused-input resolution throws', async () => {
    const frontmost = {
      id: 'frontmost',
      displayName: 'Notion',
      platform: 'windows',
      path: 'C:\\Program Files\\Notion\\Notion.exe',
      source: 'detected',
      iconDataUrl: 'data:image/png;base64,front'
    } as const

    const service = new FocusedInputAppService({
      resolveFocusedInputApp: vi.fn().mockRejectedValue(new Error('automation unavailable')),
      hydrateApp: vi.fn(async (app) => app),
      getFrontmostApp: vi.fn().mockResolvedValue(frontmost)
    })

    await expect(service.getFocusedInputApp()).resolves.toEqual(frontmost)
  })

  test('returns null when both focused-input and frontmost app fail', async () => {
    const service = new FocusedInputAppService({
      resolveFocusedInputApp: vi.fn().mockResolvedValue(null),
      hydrateApp: vi.fn(async () => null),
      getFrontmostApp: vi.fn().mockResolvedValue(null)
    })

    await expect(service.getFocusedInputApp()).resolves.toBeNull()
  })
})
```

- [ ] **Step 2: Run the new focused-input test file and verify it fails**

Run: `pnpm --dir apps/desktop exec vitest run src/main/__tests__/focused-input-service.test.ts`
Expected: FAIL because the service and platform files do not exist yet.

- [ ] **Step 3: Implement `FocusedInputAppService`**

Create `apps/desktop/src/main/focused-input/service.ts`:

```ts
import { normalizeDetectedAppIdentity } from '@openbroca/app-identity'
import type { AppIdentity, RawAppIdentity } from '@openbroca/app-identity'

type FocusedInputAppServiceDeps = {
  resolveFocusedInputApp: () => Promise<RawAppIdentity | null>
  hydrateApp: (app: AppIdentity | null) => Promise<AppIdentity | null>
  getFrontmostApp: () => Promise<AppIdentity | null>
}

export class FocusedInputAppService {
  constructor(private readonly deps: FocusedInputAppServiceDeps) {}

  async getFocusedInputApp(): Promise<AppIdentity | null> {
    try {
      const raw = await this.deps.resolveFocusedInputApp()
      if (raw) {
        const normalized = normalizeDetectedAppIdentity(raw)
        const hydrated = await this.deps.hydrateApp(normalized)
        if (hydrated) {
          return hydrated
        }
      }
    } catch (error) {
      console.debug('[voice-debug] focused input app resolution failed', {
        error: error instanceof Error ? error.message : String(error)
      })
    }

    return this.deps.getFrontmostApp()
  }
}
```

Keep the fallback inside the service so callers never need to implement their own downgrade logic.

- [ ] **Step 4: Implement the macOS resolver using `osascript` and soft parsing**

Create `apps/desktop/src/main/focused-input/platform/macos.ts` with an `execFile` wrapper that runs a compact JXA script and returns `RawAppIdentity | null`.

Use this shape:

```ts
import { execFile as nodeExecFile } from 'node:child_process'
import type { RawAppIdentity } from '@openbroca/app-identity'

const script = `
ObjC.import('AppKit')
function run() {
  const app = $.NSWorkspace.sharedWorkspace.frontmostApplication
  if (!app) return ''
  const system = Application('System Events')
  const proc = system.applicationProcesses.byName(ObjC.unwrap(app.localizedName))
  const focused = proc.attributes.byName('AXFocusedUIElement').value()
  const role = focused.attributes.byName('AXRole').value()
  let editable = false
  try { editable = !!focused.attributes.byName('AXEditable').value() } catch (_) {}
  if (!editable && !['AXTextField', 'AXTextArea', 'AXComboBox', 'AXWebArea'].includes(role)) return ''
  return JSON.stringify({
    displayName: ObjC.unwrap(app.localizedName),
    platform: 'macos',
    bundleId: ObjC.unwrap(app.bundleIdentifier),
    path: ObjC.unwrap(app.bundleURL.path),
    source: 'detected'
  })
}
`

export async function getMacFocusedInputApp(): Promise<RawAppIdentity | null> {
  const stdout = await execOsascript(script)
  return stdout ? (JSON.parse(stdout) as RawAppIdentity) : null
}
```

Keep parsing defensive: empty stdout, JSON parse failures, and accessibility denials must all resolve to `null`.

- [ ] **Step 5: Implement the Windows resolver using PowerShell UI Automation**

Create `apps/desktop/src/main/focused-input/platform/windows.ts` with a `powershell -NoProfile -Command ...` wrapper.

Use this shape:

```ts
import { execFile as nodeExecFile } from 'node:child_process'
import type { RawAppIdentity } from '@openbroca/app-identity'

const command = `
Add-Type -AssemblyName UIAutomationClient
$focused = [System.Windows.Automation.AutomationElement]::FocusedElement
if ($null -eq $focused) { return }
$controlType = $focused.Current.ControlType.ProgrammaticName
$processId = $focused.Current.ProcessId
$editable = $controlType -in @(
  'ControlType.Edit',
  'ControlType.Document',
  'ControlType.ComboBox'
)
if (-not $editable) { return }
$process = Get-Process -Id $processId -ErrorAction SilentlyContinue
if ($null -eq $process) { return }
[PSCustomObject]@{
  displayName = if ($process.MainWindowTitle) { $process.MainWindowTitle } else { $process.ProcessName }
  platform = 'windows'
  path = $process.Path
  source = 'detected'
} | ConvertTo-Json -Compress
`

export async function getWindowsFocusedInputApp(): Promise<RawAppIdentity | null> {
  const stdout = await execPowerShell(command)
  return stdout ? (JSON.parse(stdout) as RawAppIdentity) : null
}
```

Treat inaccessible controls, empty paths, and parse failures as `null`.

- [ ] **Step 6: Re-run the focused-input service tests and make them pass**

Run: `pnpm --dir apps/desktop exec vitest run src/main/__tests__/focused-input-service.test.ts`
Expected: PASS

- [ ] **Step 7: Commit the focused-input service**

```bash
git add apps/desktop/src/main/focused-input/service.ts apps/desktop/src/main/focused-input/platform/macos.ts apps/desktop/src/main/focused-input/platform/windows.ts apps/desktop/src/main/__tests__/focused-input-service.test.ts
git commit -m "feat: resolve focused input owner apps"
```

## Task 3: Extend the listening-session bridge to publish `targetApp`

**Files:**
- Modify: `apps/desktop/src/main/listening-session.ts`
- Modify: `apps/desktop/src/main/__tests__/listening-session.test.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/preload/index.d.ts`
- Modify: `apps/desktop/src/renderer/src/stores/listening-session-store.ts`
- Modify: `apps/desktop/src/renderer/src/stores/__tests__/listening-session-store.test.ts`

- [ ] **Step 1: Add failing manager tests for target-app polling and deduped broadcasts**

Extend `apps/desktop/src/main/__tests__/listening-session.test.ts` with a fake target-app resolver and two new tests:

```ts
test('polls target app while the session is active and clears it when idle', async () => {
  const captureSource = new FakeCaptureSource()
  const getTargetApp = vi
    .fn()
    .mockResolvedValueOnce({
      id: 'cursor',
      displayName: 'Cursor',
      platform: 'macos',
      bundleId: 'com.todesktop.230313mzl4w4u92',
      path: '/Applications/Cursor.app',
      source: 'detected',
      iconDataUrl: 'data:image/png;base64,cursor'
    })
    .mockResolvedValueOnce(null)

  const manager = new ListeningSessionManager(captureSource, {
    getTargetApp,
    targetAppPollIntervalMs: 5
  })

  const snapshots: string[] = []
  manager.subscribe((bridge) => {
    snapshots.push(`${bridge.state.status}:${bridge.targetApp?.id ?? 'none'}`)
  })

  manager.start()
  await captureSource.waitForCaptureStart()
  await vi.waitFor(() => {
    expect(snapshots).toContain('listening:cursor')
  })

  manager.stop()
  captureSource.finish()

  await vi.waitFor(() => {
    expect(manager.getState()).toEqual({
      state: { status: 'idle' },
      targetApp: null
    })
  })
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
  })

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

  const callCountAfterFirstCursor = listener.mock.calls.length
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(listener.mock.calls.length).toBe(callCountAfterFirstCursor)

  manager.stop()
  captureSource.finish()
})
```

- [ ] **Step 2: Run the listening-session test file and confirm the new cases fail**

Run: `pnpm --dir apps/desktop exec vitest run src/main/__tests__/listening-session.test.ts`
Expected: FAIL because the manager still returns bare `ListeningSessionState`.

- [ ] **Step 3: Refactor `ListeningSessionManager` to own bridge state and polling**

Update `apps/desktop/src/main/listening-session.ts` to:

```ts
import type { AppIdentity } from '@openbroca/app-identity'
import {
  INITIAL_LISTENING_SESSION_BRIDGE_STATE,
  isListeningSessionActive,
  isTargetAppPollingState,
  type ListeningSessionBridgeState,
  type ListeningSessionState
} from '../shared/listening-session-state'

interface ListeningSessionOptions {
  onRecordingComplete?: (recording: CapturedRecording) => Promise<void> | void
  getFrontmostAppSnapshot?: () => Promise<AppIdentity | null>
  getTargetApp?: () => Promise<AppIdentity | null>
  targetAppPollIntervalMs?: number
}

class ListeningSessionManager {
  private sessionState: ListeningSessionState = { status: 'idle' }
  private targetApp: AppIdentity | null = null
  private bridgeState: ListeningSessionBridgeState = INITIAL_LISTENING_SESSION_BRIDGE_STATE
  private targetAppTimer: ReturnType<typeof setInterval> | null = null

  getState(): ListeningSessionBridgeState {
    return this.bridgeState
  }

  private publish(): void {
    this.bridgeState = {
      state: this.sessionState,
      targetApp: this.targetApp
    }
    for (const listener of this.listeners) {
      listener(this.bridgeState)
    }
  }
}
```

Keep audio capture semantics unchanged. Only the bridge payload shape should widen.

- [ ] **Step 4: Add polling lifecycle helpers and stable app comparison**

Add private helpers inside `ListeningSessionManager`:

```ts
private setSessionState(next: ListeningSessionState): void {
  this.sessionState = next
  this.syncTargetAppPolling()
  this.publish()
}

private async refreshTargetApp(): Promise<void> {
  const next = await this.options.getTargetApp?.()
  if (sameAppIdentity(this.targetApp, next ?? null)) {
    return
  }

  this.targetApp = next ?? null
  this.publish()
}

private syncTargetAppPolling(): void {
  if (!isTargetAppPollingState(this.sessionState) || !this.options.getTargetApp) {
    if (this.targetAppTimer) clearInterval(this.targetAppTimer)
    this.targetAppTimer = null
    if (this.targetApp) {
      this.targetApp = null
      this.publish()
    }
    return
  }

  if (this.targetAppTimer) {
    return
  }

  void this.refreshTargetApp()
  this.targetAppTimer = setInterval(() => {
    void this.refreshTargetApp()
  }, this.options.targetAppPollIntervalMs ?? 500)
}
```

Add a local `sameAppIdentity()` helper that compares `id`, then `bundleId`, then `aumid`, then `path`.

- [ ] **Step 5: Widen the preload and renderer store bridge types**

Update `apps/desktop/src/preload/index.ts` and `apps/desktop/src/preload/index.d.ts` so `window.api.listeningSession.getState()` and `onStateChange()` use `ListeningSessionBridgeState` instead of `ListeningSessionState`:

```ts
import type { ListeningSessionBridgeState } from '../shared/listening-session-state'

listeningSession: {
  getState: () =>
    ipcRenderer.invoke('listening-session:get-state') as Promise<ListeningSessionBridgeState>,
  onStateChange: (callback: (state: ListeningSessionBridgeState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: ListeningSessionBridgeState) =>
      callback(state)
    ipcRenderer.on('listening-session:state-changed', handler)
    return () => ipcRenderer.removeListener('listening-session:state-changed', handler)
  }
}
```

Then update `apps/desktop/src/renderer/src/stores/listening-session-store.ts`:

```ts
import {
  INITIAL_LISTENING_SESSION_BRIDGE_STATE,
  type ListeningSessionBridgeState
} from '../../../shared/listening-session-state'

interface ListeningSessionStoreState {
  bridge: ListeningSessionBridgeState
}

const listeningSessionStoreImpl = createStore<ListeningSessionStoreState>(() => ({
  bridge: INITIAL_LISTENING_SESSION_BRIDGE_STATE
}))
```

Use a single `setListeningSessionBridgeState()` helper so snapshot loads and live updates write the same structure.

- [ ] **Step 6: Wire the focused-input service into `index.ts`**

Update `apps/desktop/src/main/index.ts` so it instantiates the focused-input service and passes it into the manager:

```ts
import { FocusedInputAppService } from './focused-input/service'
import { getMacFocusedInputApp } from './focused-input/platform/macos'
import { getWindowsFocusedInputApp } from './focused-input/platform/windows'

const focusedInputAppService = new FocusedInputAppService({
  resolveFocusedInputApp:
    process.platform === 'darwin'
      ? () => getMacFocusedInputApp()
      : process.platform === 'win32'
        ? () => getWindowsFocusedInputApp()
        : async () => null,
  hydrateApp: (app) => appIdentityService.hydrateApp(app),
  getFrontmostApp: () => appIdentityService.getFrontmostApp()
})

const listeningSession = new ListeningSessionManager(captureSource, {
  getFrontmostAppSnapshot: () => appIdentityService.getFrontmostApp(),
  getTargetApp: () => focusedInputAppService.getFocusedInputApp(),
  onRecordingComplete: (recording) => void postRecordingPipeline.process(recording)
})
```

Leave the IPC channel names unchanged.

- [ ] **Step 7: Update the store tests for the widened bridge shape**

Adjust `apps/desktop/src/renderer/src/stores/__tests__/listening-session-store.test.ts` to use bridge payloads:

```ts
const getState = vi.fn().mockResolvedValue({
  state: { status: 'idle' },
  targetApp: null
})

const listeners = new Set<(bridge: ListeningSessionBridgeState) => void>()

listeningSession: {
  getState,
  onStateChange: vi.fn((callback) => {
    listeners.add(callback)
    return () => listeners.delete(callback)
  })
}
```

Add one assertion that a later live update with a target app overwrites the initial null snapshot.

- [ ] **Step 8: Re-run main and renderer bridge tests**

Run:

```bash
pnpm --dir apps/desktop exec vitest run src/main/__tests__/listening-session.test.ts
pnpm --dir apps/desktop exec vitest run src/renderer/src/stores/__tests__/listening-session-store.test.ts
```

Expected: PASS for both files.

- [ ] **Step 9: Commit the bridge extension**

```bash
git add apps/desktop/src/main/listening-session.ts apps/desktop/src/main/__tests__/listening-session.test.ts apps/desktop/src/main/index.ts apps/desktop/src/preload/index.ts apps/desktop/src/preload/index.d.ts apps/desktop/src/renderer/src/stores/listening-session-store.ts apps/desktop/src/renderer/src/stores/__tests__/listening-session-store.test.ts
git commit -m "feat: bridge listening session target app"
```

## Task 4: Render the target app icon in the floating listening page

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/float/float-listening.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/float/__tests__/float-listening.test.tsx`

- [ ] **Step 1: Add failing float page tests for icon rendering**

Update `apps/desktop/src/renderer/src/pages/float/__tests__/float-listening.test.tsx` so the bridge state includes `targetApp`.

Add these tests:

```ts
test('renders the focused target app icon when one is available', async () => {
  const { container } = await renderForBridgeState({
    state: { status: 'listening' },
    targetApp: {
      id: 'cursor',
      displayName: 'Cursor',
      platform: 'macos',
      bundleId: 'com.todesktop.230313mzl4w4u92',
      path: '/Applications/Cursor.app',
      source: 'detected',
      iconDataUrl: 'data:image/png;base64,cursor'
    }
  })

  await waitFor(() => {
    expect(within(container).getByAltText('Cursor icon')).toBeTruthy()
  })
})

test('does not render the icon container when targetApp is null', async () => {
  const { container } = await renderForBridgeState({
    state: { status: 'idle' },
    targetApp: null
  })

  await waitFor(() => {
    expect(within(container).queryByTestId('float-target-app-icon')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the float page test file and verify it fails**

Run: `pnpm --dir apps/desktop exec vitest run src/renderer/src/pages/float/__tests__/float-listening.test.tsx`
Expected: FAIL because the component and test helper still use the old store shape.

- [ ] **Step 3: Render the icon circle only when an icon exists**

Update `apps/desktop/src/renderer/src/pages/float/float-listening.tsx`:

```tsx
  const { bridge } = useStore(listeningSessionStore)
  const { state, targetApp } = bridge

  return (
    <div className="flex gap-2">
      {targetApp?.iconDataUrl ? (
        <div
          className="bg-background h-9 w-9 shrink-0 overflow-hidden rounded-full border"
          data-testid="float-target-app-icon"
        >
          <img
            src={targetApp.iconDataUrl}
            alt={`${targetApp.displayName} icon`}
            className="h-full w-full object-cover"
          />
        </div>
      ) : null}

      <div className="bg-background h-9 w-20 flex items-center justify-center rounded-full border">
        <LiveWaveform
          active={state.status === 'listening'}
          // existing props stay unchanged
        />
      </div>
    </div>
  )
```

Do not render any placeholder element when `iconDataUrl` is missing.

- [ ] **Step 4: Update the float test helper to use bridge state**

Refactor the test helper in `apps/desktop/src/renderer/src/pages/float/__tests__/float-listening.test.tsx`:

```ts
import type { ListeningSessionBridgeState } from '../../../../../shared/listening-session-state'

async function renderForBridgeState(bridge: ListeningSessionBridgeState) {
  const listeners = new Set<(next: ListeningSessionBridgeState) => void>()

  window.api = {
    ...window.api,
    listeningSession: {
      getState: vi.fn().mockResolvedValue(bridge),
      onStateChange: vi.fn((callback) => {
        listeners.add(callback)
        return () => listeners.delete(callback)
      })
    }
  }

  const { FloatListening } = await import('../float-listening')
  const view = render(<FloatListening />)

  return {
    ...view,
    emit(next: ListeningSessionBridgeState) {
      for (const listener of listeners) {
        listener(next)
      }
    }
  }
}
```

Keep the existing waveform activation assertions, but make them read from `bridge.state.status`.

- [ ] **Step 5: Re-run the float page tests**

Run: `pnpm --dir apps/desktop exec vitest run src/renderer/src/pages/float/__tests__/float-listening.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit the float UI change**

```bash
git add apps/desktop/src/renderer/src/pages/float/float-listening.tsx apps/desktop/src/renderer/src/pages/float/__tests__/float-listening.test.tsx
git commit -m "feat: show target app icon in float listening"
```

## Task 5: Verify the whole slice before claiming completion

**Files:**
- Modify: none expected

- [ ] **Step 1: Run the focused test set together**

Run:

```bash
pnpm --dir apps/desktop exec vitest run \
  src/main/__tests__/app-identity-service.test.ts \
  src/main/__tests__/focused-input-service.test.ts \
  src/main/__tests__/listening-session.test.ts \
  src/renderer/src/stores/__tests__/listening-session-store.test.ts \
  src/renderer/src/pages/float/__tests__/float-listening.test.tsx
```

Expected: PASS

- [ ] **Step 2: Run desktop typecheck**

Run: `pnpm --dir apps/desktop typecheck`
Expected: PASS

- [ ] **Step 3: Inspect the worktree status**

Run: `git status --short`
Expected: only the files from this plan appear as modified or committed work.

- [ ] **Step 4: Summarize any platform gaps before merging**

If either platform resolver needed a small deviation from the plan, record it in the final implementation summary. In particular, call out:

- any control types added beyond the planned editable defaults
- any OS-specific command quoting changes
- whether icon hydration ever succeeds without a `path`

- [ ] **Step 5: Final commit if verification required follow-up fixes**

```bash
git add -A
git commit -m "fix: finalize float listening target app verification"
```

Only create this final commit if verification uncovered issues that required code changes.
